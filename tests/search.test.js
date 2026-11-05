// Tests for search: the matcher on its own, then every demo case through the same documents the workbench builds.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const C = require('../cases.js');
const S = require('../search.js');
const makeRules = require('../case-rules.js');

const load = (file) => { const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { window }); return window; };
const { TM } = load('data.js');
const { TMC } = load('case-data.js');
const A = makeRules(E, TM, TMC);
const D = TMC.dir;
const MODULES = { close: { label: 'Month-end Close', short: 'Close' }, payroll: { label: 'Payroll', short: 'Payroll' }, cash: { label: 'Cash Reconciliation', short: 'Cash' }, mortgage: { label: 'Mortgage Servicing', short: 'Mortgage' }, payouts: { label: 'Merchant Payouts', short: 'Payouts' } };

function desk() {
  const s = C.newState();
  C.sync(s, D, A, 'cash', { bank: TM.bank, gl: TM.gl, window: 3 });
  C.sync(s, D, A, 'payroll', { hris: TM.hris, payroll: TM.payroll, equity: TM.equity, period: { start: '2026-10-01', end: '2026-10-15' } });
  C.sync(s, D, A, 'mortgage', {});
  C.sync(s, D, A, 'close', { exceptions: TM.close });
  C.sync(s, D, A, 'payouts', {});
  return s;
}
const docs = (s, me = 'ava') => S.caseDocs(s, D, C, { me, modules: MODULES, store: TMC.storeView.payouts, money: (v) => '$' + E.money(v) });
const ids = (s, q, me) => S.search(docs(s, me), q).results.map((r) => r.doc.id);
const keyOf = (s, id) => s.cases[id].key;

test('matcher: every word must match, IDs match in pieces, a long word forgives one typo', () => {
  const d = [
    { id: 'A-1', title: 'Payout PO-1028 is short', fields: [{ label: 'Finding', text: 'Payout PO-1028 is short', weight: 5 }] },
    { id: 'A-2', title: 'Payout PO-1030 missing', fields: [{ label: 'Finding', text: 'Payout PO-1030 missing', weight: 5 }] },
  ];
  assert.deepEqual(S.search(d, 'po-1028').results.map((r) => r.doc.id), ['A-1']);
  assert.deepEqual(S.search(d, '1028').results.map((r) => r.doc.id), ['A-1']);
  assert.deepEqual(S.search(d, 'payout').results.map((r) => r.doc.id).sort(), ['A-1', 'A-2']);
  assert.deepEqual(S.search(d, 'payout missing').results.map((r) => r.doc.id), ['A-2']);
  assert.deepEqual(S.search(d, 'misisng').results.map((r) => r.doc.id), ['A-2'], 'a swapped pair of letters is one typo');
  assert.equal(S.search(d, 'mis').results.length, 1, 'a word can be typed in part');
  assert.equal(S.search(d, 'nothing here').results.length, 0);
  assert.equal(S.search(d, '   ').results.length, 0);
  assert.equal(S.near('chargeback', 'chargebak'), true);
  assert.equal(S.near('reserve', 'review'), false);
});

test('matcher: amounts match by value, not by the characters typed', () => {
  const d = [{ id: 'X', title: 'Legal fee paid 6,850.00; ledger shows 6,580.00', fields: [{ label: 'Finding', text: 'Legal fee paid 6,850.00; ledger shows 6,580.00', weight: 5 }], amounts: [6850, -412.8] }];
  for (const q of ['6850', '$6,850', '6,850.00', '6850.0', '412.80', '$412.8']) assert.equal(S.search(d, q).results.length, 1, q);
  assert.equal(S.search(d, '685').results.length, 0, 'part of an amount is not that amount');
});

test('marks: the matched words are wrapped, the rest is escaped', () => {
  const d = [{ id: 'X', title: 'Bank <received> $300.00 less', fields: [{ label: 'Finding', text: 'Bank <received> $300.00 less', weight: 5 }] }];
  const h = S.search(d, '300 bank').results[0].hits[0];
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  assert.equal(S.mark(h.text, h.marks, esc), '<mark>Bank</mark> &lt;received&gt; $<mark>300.00</mark> less');
  // curly apostrophes and accents keep the marks in place, and a word with an apostrophe matches without it
  const d2 = [{ id: 'Y', title: 'The payout’s summary row, café', fields: [{ label: 'Store owner view', text: 'The payout’s summary row, café', weight: 1 }] }];
  const h2 = S.search(d2, 'payouts cafe').results[0].hits[0];
  assert.equal(S.mark(h2.text, h2.marks, esc), 'The <mark>payout’s</mark> summary row, <mark>café</mark>');
  const sn = S.snippet('word '.repeat(40) + 'target ' + 'tail '.repeat(40), [[200, 206]], 60);
  assert.ok(sn.text.startsWith('…') && sn.text.endsWith('…') && sn.text.length <= 62);
  assert.equal(sn.text.slice(sn.marks[0][0], sn.marks[0][1]), 'target');
});

test('cases: IDs, references, people and amounts each find the right case', () => {
  const s = desk();
  const one = (q) => { const r = ids(s, q); assert.ok(r.length >= 1, q); return keyOf(s, r[0]); };
  assert.equal(one('PO-1028'), 'po:PO-1028');
  assert.equal(one('ML-40311'), 'ms:ML-40311');
  assert.equal(one('birchwood'), 'ms:ML-40311');
  assert.equal(one('E-1041'), 'payroll:E-1041:INACTIVE_PAID');
  assert.equal(one('$6,850'), 'cash:2026-10-22:-6850');
  assert.equal(one('300'), 'po:PO-1028');
  const cf = s.order.find((id) => s.cases[id].module === 'cash');
  assert.deepEqual(ids(s, cf), [cf], 'a case ID finds that case alone');
  // a person's name finds their cases first, ahead of words that merely start the same way
  const sam = ids(s, 'sam');
  assert.ok(sam.slice(0, 5).every((id) => s.cases[id].owner === 'sam'), sam.join(' '));
});

test('cases: plain words find what the records call something else', () => {
  const s = desk();
  const r = S.search(docs(s), 'twice').results.map((x) => keyOf(s, x.doc.id));
  assert.ok(r.includes('payroll:E-1017:DUPLICATE_PAYMENT'));
  assert.ok(r.includes('close:CL-03'), 'two identical charges');
  const short = S.search(docs(s), 'short').results;
  assert.ok(short.some((x) => keyOf(s, x.doc.id) === 'po:PO-1028' && x.hits.some((h) => h.syn)), 'PO-1028 says “less”; marked as a similar word');
  assert.ok(ids(s, 'chargebak').map((id) => keyOf(s, id)).includes('po:PO-1028'), 'a typo still finds the store owner text');
});

test('filters: owner, queue and state narrow the results; status follows the demo', () => {
  const s = desk();
  const payroll = ids(s, 'in:payroll');
  assert.equal(payroll.length, s.order.filter((id) => s.cases[id].module === 'payroll').length);
  assert.ok(ids(s, 'owner:sam').every((id) => s.cases[id].owner === 'sam'));
  assert.ok(ids(s, 'is:mine', 'sam').every((id) => s.cases[id].owner === 'sam'));
  assert.deepEqual(ids(s, 'in:mortgage birchwood').map((id) => keyOf(s, id)), ['ms:ML-40311']);
  assert.equal(ids(s, 'in:payroll birchwood').length, 0);
  assert.equal(ids(s, 'is:closed').length, 0, 'nothing is closed at the start');
  const first = s.cases[ids(s, 'is:p1')[0]];
  assert.equal(C.effectivePriority(first), 'P1');
});

test('privacy: evidence the viewer cannot open is not searchable by them', () => {
  const s = desk();
  // the demo data restricts nothing, so restrict one payroll record to the payroll team
  const id = s.order.find((i) => s.cases[i].module === 'payroll' && s.cases[i].evidence.length);
  const e = s.cases[id].evidence[0];
  e.restricted = ['payroll'];
  e.label = 'Salary file for the restricted test';
  const insider = Object.keys(D.people).find((p) => D.people[p].team === 'payroll');
  const outsider = Object.keys(D.people).find((p) => D.people[p].team !== 'payroll');
  assert.ok(insider && outsider);
  assert.deepEqual(ids(s, 'restricted test', insider), [id]);
  assert.deepEqual(ids(s, 'restricted test', outsider), [], 'search never names what the case page would hide');
});
