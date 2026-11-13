// Unit tests for housing.js: the housing finance deployment check. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../housing.js');

const clone = () => JSON.parse(JSON.stringify(H.DATA));
const kinds = (fs) => fs.map((f) => f.id).sort();

test('completeness: an occupied unit with no lease blocks the audit', () => {
  const c = H.completeness(H.DATA);
  assert.equal(c.ok, false);
  assert.deepEqual(c.missingLeases, ['109']);
  const d = clone();
  d.leases.push({ unit: '109', resident: 'E. Park', start: '2026-01-01', rent: 188000, parking: 0, pet: 0, deposit: 188000, signed: true });
  assert.equal(H.completeness(d).ok, true);
});

test('reconcile: finds every planted discrepancy and nothing on the clean units', () => {
  const found = H.reconcile(H.DATA);
  assert.deepEqual(kinds(found), [
    '102-missing_charge', '103-concession_not_applied', '104-duplicate_charge', '105-above_guideline', '105-escalation_missed',
    '106-rent_mismatch', '107-deposit_mismatch', '108-unsigned_lease', '109-missing_lease', '111-charge_not_in_lease',
  ]);
  for (const clean of ['101', '110', '112']) assert.ok(!found.some((f) => f.unit === clean), `unit ${clean} should be clean`);
});

test('reconcile: the effect on the resident has the right sign and size', () => {
  const by = Object.fromEntries(H.reconcile(H.DATA).map((f) => [f.id, f.impact]));
  assert.equal(by['102-missing_charge'], -5000);
  assert.equal(by['103-concession_not_applied'], 10000);
  assert.equal(by['104-duplicate_charge'], 7500);
  // the lease asks for $1,905 but Ontario's 2.1% guideline allows $1,888.85, so the shortfall is $38.85, not $55
  assert.equal(by['105-escalation_missed'], -3885);
  assert.equal(by['106-rent_mismatch'], 36000);
  assert.equal(by['111-charge_not_in_lease'], 7500);
});

test('reconcile: an escalation billed correctly, and a concession credited, raise nothing', () => {
  const d = clone();
  d.ledger.find((c) => c.unit === '105' && c.code === 'RENT').amount = 190500;
  d.ledger.push({ unit: '103', code: 'CONC', amount: -10000 });
  const ids = kinds(H.reconcile(d));
  assert.ok(!ids.includes('105-escalation_missed') && !ids.includes('105-rent_mismatch'));
  assert.ok(!ids.includes('103-concession_not_applied'));
  // after the concession ends, nothing is expected
  assert.equal(H.termsFor(H.DATA.leases.find((l) => l.unit === '103'), '2027-01').CONC, 0);
});

test('validateOutput: counts matches, misses and false alarms, and leaves data gaps out', () => {
  const v = H.validateOutput(H.reconcile(H.DATA), H.DATA.productFlags);
  assert.equal(v.expected, 8);
  assert.equal(v.matched, 6);
  assert.equal(v.missed, 2);
  assert.equal(v.falseAlarms, 1);
  assert.deepEqual(v.rows.filter((r) => r.result !== 'match').map((r) => r.unit).sort(), ['105', '110', '111']);
  assert.ok(!v.rows.some((r) => r.unit === '109'));
  assert.ok(!v.rows.some((r) => r.kind === 'above_guideline'), 'the guideline is a review rule, not a product miss');
});

test('readiness: no go until the four blockers are resolved, then go with customer items still open', () => {
  const first = H.readiness(H.DATA);
  assert.equal(first.ready, false);
  assert.deepEqual(first.blocking.map((i) => i.id).sort(), ['OI-105-miss', 'OI-109-lease', 'OI-110-fa', 'OI-111-miss']);
  assert.ok(first.items.every((i) => i.owner && i.need));
  const done = Object.fromEntries(first.blocking.map((i) => [i.id, true]));
  const after = H.readiness(H.DATA, done);
  assert.equal(after.ready, true);
  assert.ok(after.open.length > 0, 'customer corrections stay open after launch');
  assert.ok(after.open.every((i) => !i.blocks));
});

test('Ontario guideline: uses the official percentages and skips units first occupied after 15 Nov 2018', () => {
  assert.deepEqual(H.ONTARIO_GUIDELINE.pct, { 2025: 2.5, 2026: 2.1, 2027: 1.9 });
  const lease = H.DATA.leases.find((l) => l.unit === '105');
  const cap = H.guidelineCap(H.DATA.building, lease);
  assert.deepEqual(cap, { year: 2026, pct: 2.1, max: 188885 });
  // a newer building is exempt, so the same increase raises no guideline finding
  const d = clone();
  d.building.firstOccupied = '2019-03-01';
  assert.equal(H.guidelineCap(d.building, lease), null);
  assert.ok(!H.reconcile(d).some((f) => f.kind === 'above_guideline'));
  // and an increase within the guideline is fine
  const d2 = clone();
  d2.leases.find((l) => l.unit === '105').escalation.rent = 188800;
  assert.ok(!H.reconcile(d2).some((f) => f.kind === 'above_guideline'));
});
