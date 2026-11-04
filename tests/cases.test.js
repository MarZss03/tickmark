// Tests for the shared casework: Cash, Payroll and Mortgage cases through detection, tracing,
// escalation, replies, re-checks and decisions. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const C = require('../cases.js');
const makeRules = require('../case-rules.js');

function loadBrowser(file) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { window });
  return JSON.parse(JSON.stringify(window));
}
const { TM } = loadBrowser('data.js');
// case-data.js holds an undefined patch value (a deletion), which JSON would drop, so keep its own objects
const TMC = (() => { const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'case-data.js'), 'utf8'), { window }); return window.TMC; })();
const PERIOD = { start: '2026-10-01', end: '2026-10-15' };
const A = makeRules(E, TM, TMC);
const D = TMC.dir;

function desk() {
  const s = C.newState();
  C.sync(s, D, A, 'cash', { bank: TM.bank, gl: TM.gl, window: 3 });
  C.sync(s, D, A, 'payroll', { hris: TM.hris, payroll: TM.payroll, equity: TM.equity, period: PERIOD });
  C.sync(s, D, A, 'mortgage', {});
  C.sync(s, D, A, 'close', { exceptions: TM.close });
  return s;
}
const byKey = (s, key) => s.order.map((id) => s.cases[id]).find((c) => c.key === key);
const open = (c) => c.exceptions.filter((x) => x.status === 'open').map((x) => x.code);
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };

test('detection: the three modules land in one queue, and a re-scan updates instead of duplicating', () => {
  const s = desk();
  const mods = new Set(s.order.map((id) => s.cases[id].module));
  assert.deepEqual([...mods].sort(), ['cash', 'close', 'mortgage', 'payroll']);
  const n = s.order.length;
  const again = C.sync(s, D, A, 'cash', { bank: TM.bank, gl: TM.gl, window: 3 });
  assert.equal(again.created.length, 0);
  assert.equal(again.updated.length, 3);
  assert.equal(s.order.length, n);
  const legal = byKey(s, 'cash:2026-10-22:-6850');
  assert.equal(legal.exceptions.length, 1);
  assert.equal(legal.exceptions[0].seen, 2);
  assert.equal(C.queue(s, D, { module: 'mortgage', me: 'ava' }).length, TMC.mortgage.length);
});

test('cash: trace separates independent sources from copies and names the likely source error', () => {
  const s = desk();
  const c = byKey(s, 'cash:2026-10-22:-6850');
  const amount = C.trace(c).find((f) => f.key === 'amount');
  assert.equal(amount.status, 'conflict');
  assert.equal(amount.leading, '6850.00');
  const gl = amount.readings.find((r) => r.evidence === 'gl');
  assert.deepEqual(gl.copies, ['AP entry AP-55102']);
  const inv = amount.readings.find((r) => r.evidence === 'inv');
  assert.equal(inv.inferred, true);
  assert.match(inv.loc, /^chars \d+–\d+$/);
  const x = c.exceptions[0];
  assert.equal(x.code, 'AMOUNT_DIFF');
  assert.equal(x.cls, 'source-error');
  assert.equal(x.confidence, 'high');
  assert.match(x.cause, /swapped/);
});

test('cash: escalate to a person, reply with a correction, re-check clears it, then confirm', () => {
  const s = desk();
  const c = byKey(s, 'cash:2026-10-22:-6850');
  assert.equal(C.actionsFor(s, D, A, c.id, 'sara').find((a) => a.id === 'confirm').ready, false);
  const t = ok(C.escalate(s, D, c.id, { ...TMC.cash['2026-10-22:-6850'].draft, exceptionIds: [c.exceptions[0].id] }, 'sara')).task;
  assert.equal(C.escalate(s, D, c.id, { ...TMC.cash['2026-10-22:-6850'].draft }, 'sara').duplicate, t);
  assert.equal(C.reply(s, D, A, t, 'rina', { answer: 'Not mine to answer here.', conclusion: 'confirmed' }).ok, false);
  ok(C.reply(s, D, A, t, 'tom', { answer: 'Keyed 6,580 by mistake; corrected to 6,850.', conclusion: 'corrected', attach: ['ap-fix'] }));
  assert.deepEqual(open(c), []);
  assert.equal(c.records.gl[0][2], -6850);
  assert.ok(c.history.some((h) => h.changes && h.changes.some((x) => x.before === -6580 && x.after === -6850)));
  assert.ok(c.evidence.find((e) => e.id === 'ap').superseded, 'the original entry is kept, marked superseded');
  assert.equal(C.actionsFor(s, D, A, c.id, 'sara').find((a) => a.id === 'confirm').ready, false, 'the reply is still unreviewed');
  ok(C.accept(s, D, t, 'sara'));
  assert.equal(C.act(s, D, A, c.id, 'confirm', { by: 'tom', version: c.version }).ok, false, 'Tom has no cash.confirm');
  ok(C.act(s, D, A, c.id, 'confirm', { by: 'sara', version: c.version }));
  assert.equal(C.caseStatus(s, c), 'closed');
});

test('cash: a team task is claimed by a member, not by an outsider', () => {
  const s = desk();
  const c = byKey(s, 'cash:2026-10-20:7400');
  const x = c.exceptions[0];
  assert.equal(x.cls, 'insufficient');
  assert.ok(x.missing.length >= 2);
  const t = ok(C.escalate(s, D, c.id, TMC.cash['2026-10-20:7400'].draft, 'sara')).task;
  assert.equal(C.claim(s, D, t, 'tom').ok, false);
  ok(C.claim(s, D, t, 'amir'));
  ok(C.reply(s, D, A, t, 'amir', { answer: 'Northgate paid INV-2324.', conclusion: 'confirmed', attach: ['remit'] }));
  assert.deepEqual(open(c), []);
});

test('payroll: the duplicate traces to two imports of one file and clears after the reversal', () => {
  const s = desk();
  const c = byKey(s, 'payroll:E-1017:DUPLICATE_PAYMENT');
  const src = C.trace(c).find((f) => f.key === 'source_file');
  assert.equal(src.readings.length, 2);
  assert.equal(src.independent, 1);
  assert.equal(c.exceptions[0].confidence, 'high');
  const rel = () => C.actionsFor(s, D, A, c.id, 'mei').find((a) => a.id === 'release');
  assert.equal(rel().ready, false);
  const t = ok(C.escalate(s, D, c.id, TMC.payroll['E-1017:DUPLICATE_PAYMENT'].draft, 'jon')).task;
  ok(C.reply(s, D, A, t, 'omar', { answer: 'IMP-1015-09 re-ran the same file. Reversed.', conclusion: 'corrected', attach: ['rev'] }));
  ok(C.accept(s, D, t, 'jon'));
  assert.deepEqual(open(c), []);
  assert.equal(C.actionsFor(s, D, A, c.id, 'jon').find((a) => a.id === 'release').allowed, false, 'Jon cannot release');
  ok(C.act(s, D, A, c.id, 'release', { by: 'mei', version: c.version }));
});

test('mortgage: on-time wire, late posting: Payments, then the authorised reviewer, then re-check and resume', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-40311');
  assert.deepEqual(open(c), ['BALANCE_AFTER_PAYOUT']);
  const notice = () => C.actionsFor(s, D, A, c.id, 'ava').find((a) => a.id === 'send-notice');
  assert.equal(notice().ready, false);
  const m = TMC.mortgage[0];
  const t1 = ok(C.escalate(s, D, c.id, m.drafts.BALANCE_AFTER_PAYOUT, 'ava')).task;
  assert.equal(C.reply(s, D, A, t1, 'leo', { answer: 'x'.repeat(12), conclusion: 'confirmed' }).ok, false, 'not claimed yet');
  ok(C.claim(s, D, t1, 'leo'));
  ok(C.reply(s, D, A, t1, 'leo', { answer: 'Received 30 Oct 14:02; review hold until 2 Nov 09:40.', conclusion: 'confirmed', attach: ['wire'] }));
  assert.deepEqual(open(c), ['LATE_POSTING']);
  assert.equal(c.exceptions.find((x) => x.code === 'LATE_POSTING').cls, 'timing');
  assert.equal(notice().ready, false, 'a late posting alone does not trigger a shortfall notice');
  assert.match(notice().prereqs[0].label, /before the demo cut-off/);
  ok(C.accept(s, D, t1, 'ava'));
  const bad = C.escalate(s, D, c.id, { ...m.drafts.LATE_POSTING, person: 'eliza' }, 'ava');
  assert.equal(bad.ok, false);
  assert.ok(bad.suggest.some((p) => p.id === 'daniel'));
  const t2 = ok(C.escalate(s, D, c.id, m.drafts.LATE_POSTING, 'ava')).task;
  ok(C.reply(s, D, A, t2, 'daniel', { answer: 'Settlement date is 30 Oct; reverse the hold interest.', conclusion: 'confirmed', attach: ['settle'] }));
  ok(C.accept(s, D, t2, 'ava'));
  assert.equal(C.act(s, D, A, c.id, 'apply-adjustment', { by: 'ava', version: c.version }).ok, false, 'Ava lacks settlement authority');
  ok(C.act(s, D, A, c.id, 'apply-adjustment', { by: 'daniel', version: c.version }));
  assert.deepEqual(open(c), []);
  ok(C.act(s, D, A, c.id, 'resume', { by: 'daniel', version: c.version }));
  assert.match(c.stage, /Resumed/);
});

test('mortgage: a late wire gives an estimate until confirmed, then a notice, then the top-up clears it', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-38774');
  const x = () => c.exceptions.find((e) => e.code === 'LATE_FUNDS' && e.status === 'open');
  assert.match(x().title, /208\.28 \(estimate\)/);
  const m = TMC.mortgage[1];
  const t = ok(C.escalate(s, D, c.id, m.drafts.LATE_FUNDS, 'ava')).task;
  ok(C.reply(s, D, A, t, 'daniel', { answer: 'Settlement 3 Nov at 52.07 per day.', conclusion: 'confirmed', attach: ['settle'] }));
  ok(C.accept(s, D, t, 'ava'));
  assert.match(x().title, /confirmed/);
  ok(C.act(s, D, A, c.id, 'send-notice', { by: 'ava', version: c.version }));
  assert.equal(C.actionsFor(s, D, A, c.id, 'daniel').find((a) => a.id === 'resume').ready, false);
  ok(C.attachEvidence(s, D, A, c.id, 'topup', 'ava', { via: 'inbox' }));
  assert.deepEqual(open(c), []);
  ok(C.act(s, D, A, c.id, 'resume', { by: 'daniel', version: c.version }));
});

test('mortgage: a date change marks the old approval for re-review and rejects decisions from a stale page', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-41902');
  const seen = c.version;
  ok(C.attachEvidence(s, D, A, c.id, 'move', 'ava', { via: 'inbox' }));
  assert.ok(open(c).includes('CLOSING_CHANGED'));
  assert.ok(c.decisions[0].stale);
  assert.equal(c.due, '2026-11-13T20:00:00Z');
  const t = ok(C.escalate(s, D, c.id, TMC.mortgage[2].drafts.CLOSING_CHANGED, 'ava')).task;
  ok(C.claim(s, D, t, 'noah'));
  ok(C.reply(s, D, A, t, 'noah', { answer: 'Statement v2 issued to 13 Nov.', conclusion: 'corrected', attach: ['v2'] }));
  ok(C.accept(s, D, t, 'ava'));
  assert.deepEqual(open(c), []);
  assert.match(C.actionsFor(s, D, A, c.id, 'daniel').find((a) => a.id === 'resume').prereqs[2].label, /re-review/);
  assert.equal(C.act(s, D, A, c.id, 'rereview', { by: 'ava', reason: 'Statement v2 matches the new date.', version: seen }).stale, true);
  ok(C.act(s, D, A, c.id, 'rereview', { by: 'ava', reason: 'Statement v2 matches the new date.', version: c.version }));
  assert.equal(C.act(s, D, A, c.id, 'rereview', { by: 'ava', reason: 'Statement v2 matches the new date.', version: c.version }).ok, false);
  ok(C.act(s, D, A, c.id, 'resume', { by: 'daniel', version: c.version }));
});

test('mortgage: an overdue check goes to the lead; a wrong receipt is sent back; the right one closes it', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-29988');
  const t = c.tasks[0];
  assert.equal(C.isOverdue(s, s.tasks[t]), true);
  assert.equal(C.queue(s, D, { me: 'ava' }).find((r) => r.id === c.id).overdue, 1);
  ok(C.escalateToLead(s, D, t, 'ava'));
  assert.equal(s.tasks[t].assignee, 'kofi');
  ok(C.reassign(s, D, t, 'kofi', { to: 'person', person: 'lucy', reason: 'Lucy tracks Toronto registrations.' }));
  assert.equal(s.tasks[t].original, 'team:registration');
  ok(C.reply(s, D, A, t, 'lucy', { answer: 'Receipt attached.', conclusion: 'confirmed', attach: ['wrong'] }));
  assert.match(c.exceptions.find((x) => x.status === 'open').title, /not ON 1188420/);
  ok(C.askMore(s, D, t, 'ava', 'That receipt is for ON 1188402. We need ON 1188420.'));
  ok(C.reply(s, D, A, t, 'lucy', { answer: 'Right receipt attached.', conclusion: 'corrected', attach: ['right'] }));
  ok(C.accept(s, D, t, 'ava'));
  assert.deepEqual(open(c), []);
});

test('mortgage: each branch opens with its own exception and none is a payout default', () => {
  const s = desk();
  const codes = Object.fromEntries(TMC.mortgage.map((m) => [m.key, open(byKey(s, m.key))]));
  assert.deepEqual(codes['ms:ML-42207'], ['CANCEL_OPEN_ITEMS']);
  assert.deepEqual(codes['ms:ML-37150'], ['WAIVER_NOT_APPLIED']);
  assert.deepEqual(codes['ms:ML-43310'], ['STATEMENT_REG_MISMATCH']);
  assert.deepEqual(codes['ms:ML-35020'], ['REFI_NOT_LINKED']);
  assert.deepEqual(codes['ms:ML-31877'], ['DOC_TYPE_MISMATCH']);
  assert.deepEqual(codes['ms:RM-10044'], ['RULE_TO_VERIFY', 'MANUAL_REVIEW']);
  assert.deepEqual(codes['ms:CL-7001'], ['RULE_TO_VERIFY', 'SCOPE_MISMATCH']);
  assert.ok(codes['ms:ML-41902'].includes('STATEMENT_EXPIRING'));
});

test('tasks: return, clarification, withdrawal, and an accepted exception reopening when its evidence changes', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-42207');
  const t = ok(C.escalate(s, D, c.id, TMC.mortgage[6].drafts.CANCEL_OPEN_ITEMS, 'ava')).task;
  ok(C.claim(s, D, t, 'leo'));
  ok(C.askClarify(s, D, t, 'leo', 'Which account should a returned wire go back to?'));
  assert.equal(C.answerClarify(s, D, t, 'leo', 'nope').ok, false);
  ok(C.answerClarify(s, D, t, 'ava', 'Back to the sending firm, per the email.'));
  ok(C.returnTask(s, D, t, 'leo', 'Returns are handled by the Payments lead only.'));
  ok(C.reassign(s, D, t, 'ava', { to: 'person', person: 'priya', reason: 'Lead handles returns.' }));
  ok(C.reply(s, D, A, t, 'priya', { answer: 'Received 4 Nov and returned under RT-901.', conclusion: 'confirmed', attach: ['ret'] }));
  ok(C.accept(s, D, t, 'ava'));
  assert.deepEqual(open(c), []);
  ok(C.act(s, D, A, c.id, 'confirm-cancel', { by: 'ava', reason: 'Wire returned; nothing else in flight.', version: c.version }));
  // accepting an exception holds only for the evidence it was accepted on
  const w = byKey(s, 'ms:ML-37150');
  const x = w.exceptions[0];
  ok(C.act(s, D, A, w.id, 'accept:' + x.id, { by: 'ava', reason: 'Borrower agreed to pay the full charge.', version: w.version }));
  C.runCheck(s, A, w.id, 'Engine', 'Re-check');
  assert.equal(x.status, 'accepted');
  w.version += 1;
  C.runCheck(s, A, w.id, 'Engine', 'Evidence changed');
  assert.deepEqual(open(w), ['WAIVER_NOT_APPLIED']);
  const u = ok(C.escalate(s, D, w.id, TMC.mortgage[3].drafts.WAIVER_NOT_APPLIED, 'ava')).task;
  ok(C.closeTask(s, D, u, 'ava', 'Asked by phone instead.'));
  assert.equal(s.tasks[u].withdrawn, true);
});

test('priority keeps impact apart from confidence, and a person can override it with a reason', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-40311');
  assert.ok(c.priority.reasons.some((r) => /Blocks/.test(r)));
  assert.equal(c.exceptions[0].confidence, 'low');
  assert.equal(C.setPriority(s, D, c.id, 'P3', 'short', 'ava').ok, false);
  assert.equal(C.setPriority(s, D, c.id, 'P3', 'Borrower agreed to wait a week.', 'leo').ok, false, 'Leo does not work this case');
  ok(C.setPriority(s, D, c.id, 'P3', 'Borrower agreed to wait a week.', 'ava'));
  assert.equal(C.effectivePriority(c), 'P3');
  ok(C.reclassify(s, D, c.id, c.exceptions[0].id, 'timing', 'Payments said it was a hold.', 'ava'));
  C.runCheck(s, A, c.id, 'Engine', 'Re-check');
  assert.equal(c.exceptions[0].cls, 'timing', 'a person’s classification survives a re-check');
});

test('first action: MS-0011 gives each role one clear next step, in order', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-40311');
  const m = TMC.mortgage[0];
  const P = (pid) => C.primaryAction(s, D, A, c.id, pid);
  assert.deepEqual([P('ava').kind, P('ava').label], ['request', 'Request receipt confirmation']);
  assert.equal(P('leo').kind, 'none');
  const t1 = ok(C.escalate(s, D, c.id, m.drafts.BALANCE_AFTER_PAYOUT, 'ava')).task;
  assert.deepEqual([P('ava').kind, P('ava').label], ['waiting', 'Waiting on Payments']);
  assert.deepEqual([P('leo').kind, P('leo').label], ['claim', 'Claim check']);
  ok(C.claim(s, D, t1, 'leo'));
  assert.deepEqual([P('leo').kind, P('leo').label], ['reply', 'Reply with evidence']);
  assert.equal(P('priya').kind, 'waiting', 'once Leo has it, his lead only sees who it waits on');
  ok(C.reply(s, D, A, t1, 'leo', { answer: 'Received 30 Oct 14:02; hold to 2 Nov.', conclusion: 'confirmed', attach: ['wire'] }));
  assert.deepEqual([P('ava').kind, P('ava').label], ['review', 'Review reply']);
  ok(C.accept(s, D, t1, 'ava'));
  assert.deepEqual([P('ava').kind, P('ava').label], ['request', 'Request settlement decision']);
  const t2 = ok(C.escalate(s, D, c.id, m.drafts.LATE_POSTING, 'ava')).task;
  assert.equal(P('daniel').kind, 'reply');
  ok(C.reply(s, D, A, t2, 'daniel', { answer: 'Settlement date is 30 Oct.', conclusion: 'confirmed', attach: ['settle'] }));
  ok(C.accept(s, D, t2, 'ava'));
  assert.equal(P('ava').kind, 'authority');
  assert.match(P('ava').why, /Daniel Roy/);
  assert.deepEqual([P('daniel').kind, P('daniel').action], ['act', 'apply-adjustment']);
  ok(C.act(s, D, A, c.id, 'apply-adjustment', { by: 'daniel', version: c.version }));
  assert.deepEqual([P('daniel').kind, P('daniel').action], ['act', 'resume']);
  ok(C.act(s, D, A, c.id, 'resume', { by: 'daniel', version: c.version }));
  assert.equal(P('ava').kind, 'done');
});

test('My Work: needs my action, assigned to me, team inbox and waiting all point at the same case', () => {
  const s = desk();
  const c = byKey(s, 'ms:ML-40311');
  const W = (pid) => C.myWork(s, D, A, pid);
  assert.ok(W('ava').needs.some((r) => r.caseId === c.id));
  const t = ok(C.escalate(s, D, c.id, TMC.mortgage[0].drafts.BALANCE_AFTER_PAYOUT, 'ava')).task;
  assert.ok(W('ava').waiting.some((r) => r.caseId === c.id));
  assert.ok(!W('ava').needs.some((r) => r.caseId === c.id));
  assert.ok(W('leo').inbox.some((r) => r.task === t && r.caseId === c.id));
  ok(C.claim(s, D, t, 'leo'));
  assert.ok(!W('priya').inbox.some((r) => r.task === t), 'claimed checks leave the team inbox');
  assert.ok(W('leo').assigned.some((r) => r.task === t && r.caseId === c.id));
  // a check sent straight to a person lands in their Assigned list
  const p = byKey(s, 'payroll:E-1017:DUPLICATE_PAYMENT');
  const t2 = ok(C.escalate(s, D, p.id, TMC.payroll['E-1017:DUPLICATE_PAYMENT'].draft, 'jon')).task;
  assert.ok(W('omar').assigned.some((r) => r.task === t2));
  assert.ok(W('jon').waiting.some((r) => r.caseId === p.id));
});

test('close: each close exception is a case with its own queue; resolving needs a reason and the right person', () => {
  const s = desk();
  const cl = s.order.map((id) => s.cases[id]).filter((c) => c.module === 'close');
  assert.equal(cl.length, TM.close.length);
  assert.ok(cl.every((c) => c.id.startsWith('MC-')));
  const c = byKey(s, 'close:CL-06');
  assert.equal(C.queue(s, D, { module: 'close', me: 'hana' }).length, TM.close.length);
  assert.equal(C.act(s, D, A, c.id, 'resolve', { by: 'hana', reason: 'short', version: c.version }).ok, false);
  assert.equal(C.act(s, D, A, c.id, 'resolve', { by: 'sara', reason: 'JE-1031 posted after Payroll confirmed.', version: c.version }).ok, false);
  ok(C.act(s, D, A, c.id, 'resolve', { by: 'hana', reason: 'JE-1031 posted after Payroll confirmed.', version: c.version }));
  assert.deepEqual(open(c), []);
  assert.equal(C.caseStatus(s, c), 'closed');
});

test('payouts: a short deposit traces to a chargeback; only the store owner decides the dispute; then it is recorded', () => {
  const s = desk();
  C.sync(s, D, A, 'payouts', {});
  const c = byKey(s, 'po:PO-1028');
  assert.deepEqual(open(c), ['DEPOSIT_DIFFERS']);
  assert.equal(C.primaryAction(s, D, A, c.id, 'sam').label, 'Request payout detail');
  const t = ok(C.escalate(s, D, c.id, TMC.payouts[0].drafts.DEPOSIT_DIFFERS, 'sam')).task;
  ok(C.reply(s, D, A, t, 'kai', { answer: 'The payout includes chargeback CB-5521 for 300.00.', conclusion: 'confirmed', attach: ['txns'] }));
  ok(C.accept(s, D, t, 'sam'));
  assert.deepEqual(open(c), ['CHARGEBACK']);
  assert.match(c.exceptions.find((x) => x.code === 'CHARGEBACK').headline, /\$300\.00 chargeback/);
  assert.equal(C.primaryAction(s, D, A, c.id, 'sam').kind, 'authority', 'the bookkeeper cannot decide a dispute');
  assert.equal(C.act(s, D, A, c.id, 'dispute', { by: 'sam', reason: 'Customer received the order.', version: c.version }).ok, false);
  ok(C.act(s, D, A, c.id, 'dispute', { by: 'jada', reason: 'Tracking shows the order was delivered.', version: c.version }));
  assert.deepEqual(open(c), []);
  ok(C.act(s, D, A, c.id, 'record', { by: 'sam', version: c.version }));
  assert.equal(C.caseStatus(s, c), 'closed');
});

test('payouts: a report that does not add up turns into a duplicate refund once the store confirms it', () => {
  const s = desk();
  C.sync(s, D, A, 'payouts', {});
  const c = byKey(s, 'po:PO-1103');
  assert.deepEqual(open(c), ['COMPOSITION_BREAK']);
  const t = ok(C.escalate(s, D, c.id, TMC.payouts[4].drafts.COMPOSITION_BREAK, 'sam')).task;
  ok(C.reply(s, D, A, t, 'kai', { answer: 'Yes, a duplicate click refunded #4471 twice.', conclusion: 'confirmed', attach: ['dbl'] }));
  assert.deepEqual(open(c), ['DUPLICATE_REFUND']);
  const reserve = byKey(s, 'po:PO-1101');
  assert.match(reserve.exceptions[0].headline, /^\$612\.50 of payout/);
});
