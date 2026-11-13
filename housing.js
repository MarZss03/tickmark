// Housing finance deployment check: before a property operator goes live on an AI finance product,
// confirm their files are complete, reconcile the signed leases against the resident ledger and the
// rent roll, check the product's flags against what should have been flagged, and list what is still
// open, who owns it, and whether it blocks launch. Synthetic data only. No DOM; the page loads it as
// window.TickmarkHousing and the tests load it with require(). Amounts are in cents.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkHousing = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const PERIOD = { month: '2026-11', label: 'November 2026' };
  const OPERATOR = 'Maple Court Residences (fictional)';

  // Real public rule: Ontario's annual rent increase guideline, from the province's own table
  // (https://www.ontario.ca/page/residential-rent-increases, checked 12 Nov 2026). It caps increases for
  // units first occupied on or before 15 Nov 2018, unless the Landlord and Tenant Board approves more.
  const ONTARIO_GUIDELINE = {
    source: 'https://www.ontario.ca/page/residential-rent-increases',
    checked: '2026-11-12',
    pct: { 2025: 2.5, 2026: 2.1, 2027: 1.9 },
    exemptIfFirstOccupiedAfter: '2018-11-15',
  };

  // What the customer sent. Each lease is the abstract of a signed lease; `escalation` is a rent change
  // written into the lease; a concession runs through its `until` month.
  const DATA = {
    building: { name: OPERATOR, province: 'ON', firstOccupied: '1998-09-01' },
    leases: [
      { unit: '101', resident: 'A. Okafor', start: '2026-03-01', rent: 185000, parking: 7500, pet: 0, deposit: 185000, signed: true },
      { unit: '102', resident: 'J. Tremblay', start: '2026-06-01', rent: 192000, parking: 0, pet: 5000, deposit: 192000, signed: true },
      { unit: '103', resident: 'R. Singh', start: '2026-09-01', rent: 210000, parking: 7500, pet: 0, deposit: 210000, signed: true, concession: { amount: 10000, until: '2026-12' } },
      { unit: '104', resident: 'M. Chen', start: '2025-11-01', rent: 178000, parking: 7500, pet: 0, deposit: 178000, signed: true },
      { unit: '105', resident: 'L. Moreau', start: '2025-11-01', rent: 185000, parking: 0, pet: 0, deposit: 185000, signed: true, escalation: { from: '2026-11', rent: 190500 } },
      { unit: '106', resident: 'S. Haddad', start: '2026-02-01', rent: 215000, parking: 7500, pet: 0, deposit: 215000, signed: true },
      { unit: '107', resident: 'P. Novak', start: '2026-07-01', rent: 150000, parking: 0, pet: 0, deposit: 150000, signed: true },
      { unit: '108', resident: 'K. Ito', start: '2026-10-01', rent: 199000, parking: 0, pet: 0, deposit: 199000, signed: false },
      { unit: '110', resident: 'D. Alvarez', start: '2026-04-01', rent: 205000, parking: 7500, pet: 0, deposit: 205000, signed: true, petsAllowed: false },
      { unit: '111', resident: 'T. Walsh', start: '2026-08-01', rent: 172000, parking: 0, pet: 0, deposit: 172000, signed: true },
      { unit: '112', resident: 'N. Brooks', start: '2026-05-01', rent: 198000, parking: 7500, pet: 5000, deposit: 198000, signed: true },
    ],
    // November charges as posted in the property management system
    ledger: [
      ['101', 'RENT', 185000], ['101', 'PARK', 7500],
      ['102', 'RENT', 192000],
      ['103', 'RENT', 210000], ['103', 'PARK', 7500],
      ['104', 'RENT', 178000], ['104', 'PARK', 7500], ['104', 'PARK', 7500],
      ['105', 'RENT', 185000],
      ['106', 'RENT', 251000], ['106', 'PARK', 7500],
      ['107', 'RENT', 150000],
      ['108', 'RENT', 199000],
      ['109', 'RENT', 188000],
      ['110', 'RENT', 205000], ['110', 'PARK', 7500],
      ['111', 'RENT', 172000], ['111', 'PARK', 7500],
      ['112', 'RENT', 198000], ['112', 'PARK', 7500], ['112', 'PET', 5000],
    ].map(([unit, code, amount]) => ({ unit, code, amount })),
    rentRoll: [
      ['101', 185000, 185000], ['102', 192000, 192000], ['103', 210000, 210000], ['104', 178000, 178000],
      ['105', 185000, 185000], ['106', 215000, 215000], ['107', 150000, 100000], ['108', 199000, 199000],
      ['109', 188000, 188000], ['110', 205000, 205000], ['111', 172000, 172000], ['112', 198000, 198000],
    ].map(([unit, rent, deposit]) => ({ unit, rent, deposit, status: 'Occupied' })),
    // What the lease audit product flagged on this data during the trial run (simulated). Each flag names
    // the unit and the kind of problem it believes it found.
    productFlags: [
      { unit: '102', kind: 'missing_charge', note: 'Pet fee in lease, not billed' },
      { unit: '103', kind: 'concession_not_applied', note: 'Concession in lease, not credited' },
      { unit: '104', kind: 'duplicate_charge', note: 'Parking billed twice' },
      { unit: '106', kind: 'rent_mismatch', note: 'Billed rent differs from lease' },
      { unit: '107', kind: 'deposit_mismatch', note: 'Deposit differs from lease' },
      { unit: '108', kind: 'unsigned_lease', note: 'Resident signature missing' },
      { unit: '110', kind: 'missing_charge', note: 'Pet fee in lease, not billed' },
    ],
  };

  const LEASE_FIELDS = ['unit', 'resident', 'start', 'rent', 'deposit', 'signed'];
  const KIND_LABEL = {
    missing_lease: 'No lease on file',
    unsigned_lease: 'Lease not signed',
    missing_charge: 'Charge in lease, not billed',
    charge_not_in_lease: 'Billed, not in lease',
    duplicate_charge: 'Charged twice',
    rent_mismatch: 'Billed rent differs from lease',
    escalation_missed: 'Rent increase not billed',
    concession_not_applied: 'Concession not credited',
    deposit_mismatch: 'Deposit differs from lease',
    above_guideline: 'Increase above Ontario guideline',
  };
  // checks that belong to the deployment review, not to what the audit product reads
  const OUT_OF_PRODUCT_SCOPE = new Set(['missing_lease', 'above_guideline']);

  // the most a rent-controlled unit can be raised to this year, or null when the guideline does not apply
  function guidelineCap(building, lease) {
    if (!lease.escalation || building.province !== 'ON') return null;
    if (building.firstOccupied > ONTARIO_GUIDELINE.exemptIfFirstOccupiedAfter) return null;
    const year = Number(lease.escalation.from.slice(0, 4)), pct = ONTARIO_GUIDELINE.pct[year];
    if (pct == null) return null;
    return { year, pct, max: Math.round(lease.rent * (1 + pct / 100)) };
  }

  // the lease's monthly terms for a month, after any escalation and concession
  function termsFor(lease, month) {
    const rent = lease.escalation && month >= lease.escalation.from ? lease.escalation.rent : lease.rent;
    const concession = lease.concession && month <= lease.concession.until ? lease.concession.amount : 0;
    return { RENT: rent, PARK: lease.parking || 0, PET: lease.pet || 0, CONC: concession };
  }

  // Step 1: is everything here? A unit on the rent roll with no lease cannot be audited at all.
  function completeness(data) {
    const leaseUnits = new Set(data.leases.map((l) => l.unit));
    const missingLeases = data.rentRoll.filter((r) => r.status === 'Occupied' && !leaseUnits.has(r.unit)).map((r) => r.unit);
    const blankFields = [];
    data.leases.forEach((l) => LEASE_FIELDS.forEach((f) => { if (l[f] === undefined || l[f] === null || l[f] === '') blankFields.push(`${l.unit}.${f}`); }));
    const files = [
      { name: 'Signed leases', rows: data.leases.length, ok: missingLeases.length === 0 && blankFields.length === 0, note: missingLeases.length ? `No lease for occupied unit ${missingLeases.join(', ')}` : blankFields.length ? `Blank: ${blankFields.join(', ')}` : 'Every occupied unit has a lease' },
      { name: 'Resident ledger', rows: data.ledger.length, ok: data.ledger.length > 0, note: `${PERIOD.label} charges` },
      { name: 'Rent roll', rows: data.rentRoll.length, ok: data.rentRoll.length > 0, note: `${data.rentRoll.filter((r) => r.status === 'Occupied').length} occupied units` },
    ];
    return { files, missingLeases, blankFields, ok: files.every((f) => f.ok) };
  }

  // Step 2: reconcile lease, ledger and rent roll unit by unit. Returns what should be flagged.
  function reconcile(data, month = PERIOD.month) {
    const findings = [];
    const add = (unit, kind, detail, lease, ledger, roll) => findings.push({ id: `${unit}-${kind}`, unit, kind, label: KIND_LABEL[kind], detail, lease, ledger, roll });
    const leases = new Map(data.leases.map((l) => [l.unit, l]));
    const roll = new Map(data.rentRoll.map((r) => [r.unit, r]));
    const billed = {};
    data.ledger.forEach((c) => { ((billed[c.unit] ||= {})[c.code] ||= []).push(c.amount); });

    for (const r of data.rentRoll) {
      const lease = leases.get(r.unit);
      if (!lease) { add(r.unit, 'missing_lease', 'Occupied on the rent roll and billed, but no lease was sent', null, sum(billed[r.unit]?.RENT), r.rent); continue; }
      if (!lease.signed) add(r.unit, 'unsigned_lease', 'The lease on file has no resident signature', null, null, null);
      const want = termsFor(lease, month), got = billed[r.unit] || {};
      const cap = data.building ? guidelineCap(data.building, lease) : null;
      if (cap && lease.escalation.rent > cap.max) {
        const pct = ((lease.escalation.rent - lease.rent) / lease.rent) * 100;
        add(r.unit, 'above_guideline', `The lease raises rent ${pct.toFixed(2)}%, above Ontario's ${cap.year} guideline of ${cap.pct}%. Without an exemption or Board approval, the most that can be billed is ${money(cap.max)}`, lease.escalation.rent, sum(got.RENT), r.rent);
        findings[findings.length - 1].lawfulMax = cap.max;
      }

      // rent: an escalation that was not billed is a different problem from a wrong figure
      const rentBilled = sum(got.RENT);
      if (rentBilled !== want.RENT) {
        const kind = lease.escalation && month >= lease.escalation.from && rentBilled === lease.rent ? 'escalation_missed' : 'rent_mismatch';
        add(r.unit, kind, kind === 'escalation_missed' ? `Lease steps up from ${money(lease.rent)} to ${money(want.RENT)} in ${PERIOD.label}; ledger still bills the old rent` : `Lease rent is ${money(want.RENT)}; ledger bills ${money(rentBilled)}`, want.RENT, rentBilled, r.rent);
      }
      for (const code of ['PARK', 'PET']) {
        const posts = got[code] || [];
        const name = code === 'PARK' ? 'parking' : 'pet fee';
        if (want[code] && !posts.length) add(r.unit, 'missing_charge', `Lease has a ${money(want[code])} ${name}; nothing billed`, want[code], 0, null);
        else if (!want[code] && posts.length) add(r.unit, 'charge_not_in_lease', `Ledger bills a ${money(sum(posts))} ${name} the lease does not mention`, 0, sum(posts), null);
        else if (posts.length > 1) add(r.unit, 'duplicate_charge', `${name[0].toUpperCase() + name.slice(1)} posted ${posts.length} times`, want[code], sum(posts), null);
      }
      if (want.CONC && !(got.CONC || []).length) add(r.unit, 'concession_not_applied', `Lease gives a ${money(want.CONC)} monthly concession through ${monthName(lease.concession.until)}; nothing credited`, -want.CONC, 0, null);
      if (lease.deposit !== r.deposit) add(r.unit, 'deposit_mismatch', `Lease deposit ${money(lease.deposit)}; rent roll shows ${money(r.deposit)}`, lease.deposit, null, r.deposit);
    }
    // what the discrepancy means for the resident's balance this month: + they were overbilled, - underbilled
    findings.forEach((f) => { f.impact = impactOf(f, findings); });
    return findings;
  }
  function impactOf(f, all) {
    if (f.kind === 'escalation_missed') {
      // an increase above the guideline cannot be billed in full; the shortfall is only up to the lawful maximum
      const g = all.find((x) => x.unit === f.unit && x.kind === 'above_guideline');
      return -((g ? g.lawfulMax : f.lease) - f.ledger);
    }
    if (f.kind === 'missing_charge') return -(f.lease - f.ledger);
    if (f.kind === 'charge_not_in_lease') return f.ledger;
    if (f.kind === 'duplicate_charge') return f.ledger - f.lease;
    if (f.kind === 'rent_mismatch') return f.ledger - f.lease;
    if (f.kind === 'concession_not_applied') return -f.lease;
    return 0;
  }

  // Step 3: did the product flag what it should have, and nothing else? A missing lease is a data gap,
  // not something the product could have read, so it is left out of the comparison.
  function validateOutput(findings, flags) {
    const expected = findings.filter((f) => !OUT_OF_PRODUCT_SCOPE.has(f.kind));
    const key = (u, k) => `${u}|${k === 'escalation_missed' ? 'rent_mismatch' : k}`;
    const flagged = new Set(flags.map((x) => key(x.unit, x.kind)));
    const known = new Set(expected.map((f) => key(f.unit, f.kind)));
    const rows = expected.map((f) => ({ ...f, result: flagged.has(key(f.unit, f.kind)) ? 'match' : 'missed' }));
    flags.filter((x) => !known.has(key(x.unit, x.kind))).forEach((x) => rows.push({ id: `${x.unit}-${x.kind}-fa`, unit: x.unit, kind: x.kind, label: KIND_LABEL[x.kind], detail: x.note, result: 'false alarm' }));
    const n = (r) => rows.filter((x) => x.result === r).length;
    return { rows, matched: n('match'), missed: n('missed'), falseAlarms: n('false alarm'), expected: expected.length };
  }

  // why a product miss or false alarm happened, written after looking at the lease (kept with the data)
  const ROOT_CAUSE = {
    '105-escalation_missed': 'The product read the first rent in the lease and missed the step up written later in the same lease.',
    '111-charge_not_in_lease': 'The product only checks charges the lease lists, so a charge with no lease term behind it is never compared.',
    '110-missing_charge-fa': 'The lease says "No pets permitted"; the product read the word "pets" as a pet fee.',
  };

  // Step 4: every open item has an owner, a request and a launch impact
  function openItems(data) {
    const c = completeness(data), findings = reconcile(data), v = validateOutput(findings, data.productFlags);
    const items = [];
    const push = (id, title, owner, need, blocks, ref) => items.push({ id, title, owner, need, blocks, ref });
    c.missingLeases.forEach((u) => push(`OI-${u}-lease`, `Unit ${u}: no lease on file`, 'Customer: property manager', `Send the signed lease for unit ${u}; it is billed ${money(sum(data.ledger.filter((x) => x.unit === u).map((x) => x.amount)))} this month with nothing to check it against.`, true, `${u}-missing_lease`));
    v.rows.filter((r) => r.result === 'missed').forEach((r) => push(`OI-${r.unit}-miss`, `Product missed unit ${r.unit}: ${r.label.toLowerCase()}`, 'Product and Engineering', `${ROOT_CAUSE[r.id] || 'Find why the product did not flag it.'} Fix or document before launch.`, true, r.id));
    v.rows.filter((r) => r.result === 'false alarm').forEach((r) => push(`OI-${r.unit}-fa`, `False alarm on unit ${r.unit}: ${r.label.toLowerCase()}`, 'Product and Engineering', `${ROOT_CAUSE[r.id] || 'Find why the product raised it.'} Confirm the fix before launch so staff do not chase it.`, true, r.id));
    findings.filter((f) => f.kind === 'above_guideline').forEach((f) => push(`OI-${f.unit}-guideline`, `Unit ${f.unit}: increase above Ontario guideline`, 'Customer: property manager and legal', `Confirm whether the unit is exempt or has Board approval. If not, bill at most ${money(f.lawfulMax)} and correct the increase before the product suggests billing ${money(f.lease)}.`, false, f.id));
    findings.filter((f) => f.kind === 'unsigned_lease').forEach((f) => push(`OI-${f.unit}-sign`, `Unit ${f.unit}: lease not signed`, 'Customer: property manager', 'Get the resident’s signature. A compliance item, not a launch blocker.', false, f.id));
    findings.filter((f) => f.impact).forEach((f) => push(`OI-${f.unit}-${f.kind}`, `Unit ${f.unit}: ${f.label.toLowerCase()}`, 'Customer: accounting team', `Confirm and correct: ${f.detail}. ${f.impact > 0 ? `Resident overbilled ${money(f.impact)}` : `Resident underbilled ${money(-f.impact)}`} this month.`, false, f.id));
    findings.filter((f) => f.kind === 'deposit_mismatch').forEach((f) => push(`OI-${f.unit}-deposit`, `Unit ${f.unit}: deposit differs`, 'Customer: accounting team', `Confirm which deposit is right: ${f.detail}.`, false, f.id));
    return items;
  }

  // Step 5: go or no go. Launch waits on complete data and a product whose misses and false alarms are fixed.
  function readiness(data, resolved = {}) {
    const items = openItems(data);
    const blocking = items.filter((i) => i.blocks && !resolved[i.id]);
    const open = items.filter((i) => !resolved[i.id]);
    return { ready: blocking.length === 0, blocking, open, items };
  }

  const monthName = (ym) => new Date(ym + "-01T00:00:00Z").toLocaleString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  const sum = (xs) => (xs || []).reduce((a, b) => a + b, 0);
  const money = (cents) => '$' + (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return { PERIOD, OPERATOR, ONTARIO_GUIDELINE, guidelineCap, DATA, KIND_LABEL, ROOT_CAUSE, termsFor, completeness, reconcile, validateOutput, openItems, readiness, money };
});
