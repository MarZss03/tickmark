// Tests for attaching a model-read document to a case (cases.js attachDocument). Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const C = require('../cases.js');
const load = (file) => { const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { window }); return window; };
const { TM } = load('data.js');
const { TMC } = load('case-data.js');
const A = require('../case-rules.js')(E, TM, TMC);
const D = TMC.dir;

function mortgageCase() {
  const s = C.newState();
  C.sync(s, D, A, 'mortgage', {});
  const c = Object.values(s.cases).find((x) => x.key === 'ms:ML-40311');
  return { s, c };
}

test('a wire confirmation read on device fills the missing bank receipt and the rules move on', () => {
  const { s, c } = mortgageCase();
  const before = c.exceptions.filter((x) => x.status === 'open').map((x) => x.code);
  assert.ok(before.includes('BALANCE_AFTER_PAYOUT'), 'case starts waiting on the bank receipt');
  const r = C.attachDocument(s, D, A, c.id, {
    id: 'doc-wire-W-88213', label: 'Wire confirmation W-88213 (read on this device)',
    evidence: { label: 'Wire confirmation W-88213', system: 'Read on this device by Gemini Nano', origin: 'bank-wire', kind: 'document', loc: 'Scan · confirmed by Ava Chen',
      facts: { bank: '2026-10-30 14:02', hold: 'review hold 30 Oct 14:05 – 2 Nov 09:40', payout_amount: 412880 } },
    patch: [{ path: 'funds.0.bank', value: '2026-10-30T14:02', label: 'Bank received' }, { path: 'funds.0.holdOn', value: '2026-10-30T14:05', label: 'Hold placed' }, { path: 'funds.0.holdOff', value: '2026-11-02T09:40', label: 'Hold released' }],
    touches: ['bank'],
  }, 'ava');
  assert.equal(r.ok, true, r.error);
  const after = s.cases[c.id].exceptions.filter((x) => x.status === 'open').map((x) => x.code);
  assert.ok(!after.includes('BALANCE_AFTER_PAYOUT'));
  assert.ok(after.includes('LATE_POSTING'), 'the hold now explains the late posting');
  assert.ok(s.cases[c.id].history.some((h) => /Evidence added: Wire confirmation W-88213/.test(h.event)));
});

test('the same document cannot be added twice, and an empty one is refused', () => {
  const { s, c } = mortgageCase();
  const doc = { id: 'doc-x', label: 'X', evidence: { label: 'X', system: 'device', origin: 'bank-wire', facts: { bank: '2026-10-30 14:02' } } };
  assert.equal(C.attachDocument(s, D, A, c.id, doc, 'ava').ok, true);
  assert.equal(C.attachDocument(s, D, A, c.id, doc, 'ava').ok, false);
  assert.equal(C.attachDocument(s, D, A, c.id, {}, 'ava').ok, false);
});
