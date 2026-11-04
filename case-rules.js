// Tickmark casework: what each module checks, what it can do, and what each action needs.
// Cash and Payroll reuse engine.js (matchBank, runPayroll) unchanged; Mortgage has its own rules here.
// No DOM. The page calls TickmarkCaseRules(engine, TM, TMC); the tests do the same through require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TickmarkCaseRules = factory;
})(typeof self !== 'undefined' ? self : this, (E, TM, TMC) => {
  const money = E.money;
  const day = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00Z').toUTCString().slice(5, 11).replace(/^0/, '') : '—');
  const when = (s) => (s && s.length > 10 ? `${day(s)} ${s.slice(11, 16)}` : day(s));
  const teamName = (t) => (TMC.dir.teams[t] ? TMC.dir.teams[t].name : t || 'the owning team');
  const systemsOf = (c) => [...new Set(c.evidence.filter((e) => !e.superseded).map((e) => e.system))].join(', ');
  const missingOf = (c, facts, keys) => keys.filter((k) => facts[k] && facts[k].status === 'pending' && facts[k].required)
    .map((k) => ({ what: facts[k].label, checked: facts[k].checked || systemsOf(c), who: teamName(facts[k].who) }));
  // how many independent sources agree with a value
  const backers = (fact, value) => (fact ? new Set(fact.readings.filter((r) => Math.abs(Number(r.value) - Math.abs(value)) < 0.005).map((r) => r.origin)).size : 0);
  const swapped = (a, b) => { const x = String(Math.round(Math.abs(a) * 100)), y = String(Math.round(Math.abs(b) * 100)); return x.length === y.length && x !== y && [...x].sort().join('') === [...y].sort().join(''); };
  // a reply counts as open until the owner has checked it answers the question
  const openTasksBlocking = (ctx) => ctx.openTasks.filter((t) => t.blocking);
  const noBlockingTasks = (ctx) => {
    const n = openTasksBlocking(ctx).length, unread = openTasksBlocking(ctx).filter((t) => t.status === 'replied').length;
    return { ok: !n, label: !n ? 'No blocking check is out' : unread === n ? `Review ${n === 1 ? 'the reply' : `${n} replies`} first` : `Waiting on ${n} blocking check${n > 1 ? 's' : ''}` };
  };
  const nothingOpen = (c, action) => {
    const open = c.exceptions.filter((x) => x.status === 'open' && (x.blocks || []).includes(action));
    return { ok: !open.length, label: open.length ? `Still open: ${open.map((x) => x.short || x.title).join('; ')}` : 'No open exception blocks this' };
  };
  const staleOk = (c) => { const s = c.decisions.filter((d) => d.stale && !d.rereviewed); return { ok: !s.length, label: s.length ? `Needs re-review first: ${s.map((d) => d.label).join('; ')}` : 'No earlier approval is waiting for re-review' }; };
  const rereview = (c) => (c.decisions.some((d) => d.stale && !d.rereviewed) ? [{
    id: 'rereview', label: 'Re-approve on the current evidence', perm: c.module + '.decide', needsReason: true, facts: [],
    prereqs: [{ ok: !c.exceptions.some((x) => x.status === 'open' && x.code !== 'STATEMENT_EXPIRING'), label: 'The changed facts are settled' }],
  }] : []);
  const rereviewApply = (c, at) => { c.decisions.filter((d) => d.stale && !d.rereviewed).forEach((d) => { d.rereviewed = at; }); return { detail: 'Earlier approval replaced by this one', recheck: false }; };

  // ---------- cash: bank lines the matcher could not match ----------
  const cash = {
    detect({ bank, gl, window }) {
      const rec = E.matchBank(bank, gl, window);
      return rec.rows.filter((r) => !r.ok).map((r) => {
        const k = `${r.date}:${r.amt}`;
        const x = TMC.cash[k] || {};
        const line = bank.find((b) => b[0] === r.date && b[2] === r.amt);
        const cand = gl.filter((g) => Math.abs(g[2] - r.amt) < Math.abs(r.amt) * 0.1).sort((a, b) => Math.abs(a[2] - r.amt) - Math.abs(b[2] - r.amt))[0];
        const draft = TM.journals.find((j) => Math.abs(j.dr - Math.abs(r.amt)) < 0.005);
        const evidence = [{ id: 'bank', label: `Bank statement line ${day(r.date)}`, system: 'Bank statement · Operating', origin: 'bank', kind: 'record', recorded: r.date + 'T23:59:00Z', loc: `Statement ${r.date} · "${r.desc}"`, facts: { amount: Math.abs(r.amt) } }];
        if (cand) evidence.push({ id: 'gl', label: x.glLabel || `Ledger line ${cand[1]}`, system: 'General ledger · GL 1010 cash', origin: x.glOrigin || 'ledger', kind: 'record', recorded: cand[0] + 'T23:59:00Z', loc: `GL 1010 · ${cand[0]} · ${cand[1]}`, facts: { amount: Math.abs(cand[2]) } });
        return {
          key: 'cash:' + k, title: x.title || `${r.desc} ${money(r.amt)} not matched`, owner: 'sara',
          openedBecause: `Bank line not matched within ±${window} days`, amount: Math.abs(r.amt), amountLabel: x.amountLabel || 'Amount',
          due: '2026-11-06T22:00:00Z', dueLabel: 'October cash sign-off (BD5)', affects: 'the October cash sign-off',
          records: { bank: line, gl: cand ? [cand] : [], window, draft: draft && !cand ? draft.id : null },
          evidence: evidence.concat(x.evidence || []), factDefs: x.factDefs || [{ key: 'amount', label: 'Amount', required: true }],
          available: x.available || [], drafts: x.draft ? { AMOUNT_DIFF: x.draft, NO_LEDGER_LINE: x.draft, NOT_POSTED: x.draft } : {},
        };
      });
    },
    check(c, { facts }) {
      const r = c.records;
      const row = E.matchBank([r.bank], r.gl, r.window).rows[0];
      if (row.ok) return [];
      const bankAmt = Math.abs(r.bank[2]);
      const base = { blocks: ['confirm'], impact: 'signoff', facts: c.factDefs.map((d) => d.key), draftKey: null };
      if (r.gl.length) {
        const ledger = Math.abs(r.gl[0][2]);
        const support = backers(facts.amount, bankAmt);
        return [{ ...base, code: 'AMOUNT_DIFF', by: 'Matcher + extractor', short: 'Amount differs',
          title: `Bank paid ${money(bankAmt)}; ledger has ${money(ledger)}`, expected: money(bankAmt), actual: money(ledger),
          cls: support >= 2 ? 'source-error' : 'business', confidence: support >= 2 ? 'high' : 'medium',
          cause: swapped(bankAmt, ledger) ? `Two digits look swapped (${money(ledger)} for ${money(bankAmt)}). ${support} independent sources back ${money(bankAmt)}; the ledger copies one entry.` : `${support} independent source${support === 1 ? '' : 's'} back the bank amount.`,
          next: 'Ask the team that keyed the ledger entry to check and correct it', missing: missingOf(c, facts, ['amount']) }];
      }
      if (r.draft) return [{ ...base, code: 'NOT_POSTED', by: 'Matcher', short: 'Not posted yet', title: `${money(bankAmt)} is on the bank statement; journal ${r.draft} is drafted, not posted`, expected: 'A ledger line for the fee', actual: `Draft ${r.draft} only`, cls: 'timing', confidence: 'high', cause: 'The fee is known and drafted; the ledger has not caught up.', next: 'Ask General Ledger to post the journal', missing: [] }];
      const miss = missingOf(c, facts, c.factDefs.map((d) => d.key));
      return [{ ...base, code: 'NO_LEDGER_LINE', by: 'Matcher', short: 'No ledger line', title: `${money(bankAmt)} on the bank statement has no ledger line`, expected: 'A ledger line within the window', actual: 'None', cls: 'insufficient', confidence: 'low', cause: 'No reference on the bank line and nothing close in the ledger. It cannot be applied until someone says what it is.', next: 'Ask the team that knows the counterparty', missing: miss }];
    },
    actions(c, ctx) {
      if (c.closed) return [];
      return [
        { id: 'confirm', label: 'Confirm reconciled', perm: 'cash.confirm', facts: ['amount'], prereqs: [nothingOpen(c, 'confirm'), noBlockingTasks(ctx)] },
        { id: 'recheck-tomorrow', label: 'Re-check tomorrow', perm: 'cash.decide', facts: [], prereqs: [{ ok: c.exceptions.some((x) => x.status === 'open'), label: c.exceptions.some((x) => x.status === 'open') ? 'Something is still open' : 'Nothing is open to re-check' }] },
        ...rereview(c),
      ];
    },
    apply(c, id, { now }) {
      if (id === 'confirm') { c.stage = 'Reconciled'; c.closed = now; return { detail: 'Line reconciled for the October sign-off', recheck: false }; }
      if (id === 'recheck-tomorrow') { c.followUp = new Date(new Date(now).getTime() + 864e5).toISOString(); return { detail: `Follow-up ${c.followUp.slice(0, 10)}`, recheck: false }; }
      if (id === 'rereview') return rereviewApply(c, now);
      return null;
    },
  };

  // ---------- payroll: exceptions the payroll rules raise ----------
  const PAY_CLS = { DUPLICATE_PAYMENT: 'source-error', MISSING_EMPLOYEE: 'timing', INACTIVE_PAID: 'timing', NOT_STARTED: 'timing', OUTLIER: 'business', CURRENCY: 'source-error', PRORATION: 'business', EQUITY_MISSING: 'timing', INJECTION: 'business' };
  const PAY_SHORT = { DUPLICATE_PAYMENT: 'Paid twice', MISSING_EMPLOYEE: 'Not in HRIS', INACTIVE_PAID: 'Paid after leaving', NOT_STARTED: 'Paid before starting', OUTLIER: 'Pay jump', CURRENCY: 'Currency differs', PRORATION: 'Not prorated', EQUITY_MISSING: 'Equity missing', INJECTION: 'Instruction in a note' };
  const key = (id) => String(id).trim().toUpperCase();
  const payroll = {
    detect({ hris, payroll: rows, equity, period }) {
      return E.runPayroll({ hris, payroll: rows, equity, period }).map((x) => {
        const k = `${x.id}:${x.rule}`;
        const extra = TMC.payroll[k] || {};
        const pay = rows.filter((p) => key(p.id) === x.id);
        const hr = hris.find((h) => key(h.id) === x.id) || null;
        const evidence = [{ id: 'reg', label: 'Payroll register', system: `Payroll register · ${E.periodLabel(period)}`, origin: extra.register ? extra.register.origin : 'payroll-register', kind: 'record', recorded: '2026-10-14T19:00:00Z', loc: extra.register ? extra.register.loc : `Rows for ${x.id}`, facts: { pay_lines: pay.length, gross: pay[0] ? pay[0].gross : 0 } }];
        if (hr) evidence.push({ id: 'hris', label: `HRIS record ${x.id}`, system: 'HRIS', origin: 'hris', kind: 'record', recorded: '2026-10-14T08:00:00Z', loc: `${x.id} · status, hire and leaving dates`, facts: { status: hr.status, currency: hr.ccy } });
        return {
          key: 'payroll:' + k, title: extra.title || `${x.id} · ${PAY_SHORT[x.rule]}`, owner: 'jon', openedBecause: `Payroll rule ${x.rule} fired`,
          amount: pay.reduce((a, p) => a + p.gross, 0), amountLabel: 'Gross', due: '2026-11-05T22:00:00Z', dueLabel: 'Payroll release cutoff', affects: 'releasing this pay',
          records: { hr, pay, equity: (equity || []).filter((e) => key(e.id) === x.id), period },
          evidence: evidence.concat(extra.evidence || []), factDefs: (extra.factDefs || [{ key: 'pay_lines', label: 'Pay lines this period' }]).concat([{ key: 'gross', label: 'Gross pay' }, { key: 'status', label: 'HRIS status' }, { key: 'currency', label: 'HRIS currency' }]),
          available: extra.available || [], drafts: extra.draft ? { [x.rule]: extra.draft } : {},
        };
      });
    },
    check(c, { facts }) {
      const r = c.records;
      return E.runPayroll({ hris: r.hr ? [r.hr] : [], payroll: r.pay, equity: r.equity, period: r.period }).map((x) => ({
        code: x.rule, by: 'Payroll rule', short: PAY_SHORT[x.rule], title: x.ev, expected: x.rule === 'DUPLICATE_PAYMENT' ? '1 pay line' : x.rule === 'PRORATION' ? money(x.expected) : '—',
        actual: x.rule === 'DUPLICATE_PAYMENT' ? `${r.pay.length} pay lines` : x.ev, cls: PAY_CLS[x.rule] || 'business',
        confidence: x.rule === 'DUPLICATE_PAYMENT' && facts.source_file && facts.source_file.readings.length > 1 && facts.source_file.independent === 1 ? 'high' : 'medium',
        cause: x.rule === 'DUPLICATE_PAYMENT' && facts.source_file ? 'Both pay lines come from imports of the same file, and Timekeeping holds one approved sheet. The second import looks like a re-run.' : '',
        next: x.blocks ? 'Resolve before release' : 'Decide before release', blocks: x.blocks ? ['release'] : [], impact: x.blocks ? 'release' : 'info',
        facts: c.factDefs.map((d) => d.key), missing: missingOf(c, facts, c.factDefs.map((d) => d.key)),
      }));
    },
    actions(c, ctx) {
      if (c.closed) return [];
      return [{ id: 'release', label: 'Release this pay', perm: 'payroll.release', facts: ['pay_lines'], prereqs: [nothingOpen(c, 'release'), noBlockingTasks(ctx)] }, ...rereview(c)];
    },
    apply(c, id, { now }) {
      if (id === 'release') { c.stage = 'Released to the second approver (simulated)'; c.closed = now; return { detail: 'Pay goes to the four-eyes approver', recheck: false }; }
      if (id === 'rereview') return rereviewApply(c, now);
      return null;
    },
  };

  // ---------- mortgage servicing ----------
  const hoursTo = (now, d) => (new Date(d + 'T23:59:00Z') - new Date(now)) / 36e5;
  const mortgage = {
    detect() { return TMC.mortgage.map((m) => JSON.parse(JSON.stringify(m))); },
    check(c, { now, facts }) {
      const r = c.records, out = [], rule = TMC.rules[r.rule];
      const loan = r.loans[0], funds = r.funds || [], fund = funds[0], closing = r.closing && r.closing.latest;
      const add = (x) => out.push({ facts: [], missing: [], blocks: ['resume'], impact: 'payout', by: 'Servicing rule', confidence: null, ...x });
      if (!rule) add({ code: 'RULE_TO_VERIFY', short: 'Rule not verified', title: `No checked rule for ${r.rule.split('|').slice(2).join(' · ')}`, expected: 'A checked rule for this lender, province, product and purpose', actual: 'None on file', cls: 'insufficient', cause: 'Tickmark does not guess which policy applies. A person confirms it before anything moves.', next: 'Confirm the policy with Servicing Approvals', impact: 'info' });
      if (r.request.status === 'active' && fund && fund.posted && loan.balance > 0) {
        if (!fund.bank) {
          add({ code: 'BALANCE_AFTER_PAYOUT', short: 'Balance after payout', title: `Loan shows ${money(loan.balance)} owing after the payout posted ${day(fund.posted)}`, expected: money(0), actual: money(loan.balance), cls: 'insufficient', confidence: 'low', by: 'Servicing rule + extractor',
            cause: `Posted ${day(fund.posted)}, after the ${day(closing)} closing. Either the wire was late (the borrower owes per diem) or it waited on our side (the bank owes the interest). The bank receipt time decides which.`,
            next: 'Ask Payments when the bank received the wire', facts: ['bank', 'posted', 'balance'], missing: missingOf(c, facts, ['bank']) });
        } else {
          const late = fund.bank.slice(0, 10) > closing || (fund.bank.slice(0, 10) === closing && rule && rule.cutoff && fund.bank.slice(11, 16) > rule.cutoff);
          if (!late) {
            add({ code: 'LATE_POSTING', short: 'Posted late after our hold', cls: 'timing', confidence: 'high', by: 'Servicing rule', facts: ['bank', 'posted', 'settlement', 'balance'],
              title: r.settlement ? `Settlement date ${day(r.settlement.date)} confirmed; ${money(loan.balance)} of interest still on the loan` : `Funds reached the bank ${when(fund.bank)}; posted to the loan ${day(fund.posted)} after a hold`,
              expected: `Interest stops ${day(closing)}`, actual: `${money(loan.balance)} charged after it`,
              cause: `The bank had the money before the ${rule && rule.cutoff ? rule.cutoff + ' ' : ''}cut-off on the closing date. The delay is the review hold (${fund.holdOn ? when(fund.holdOn) : '?'} to ${fund.holdOff ? when(fund.holdOff) : '?'}), not the borrower. A late posting alone does not trigger a shortfall notice.`,
              next: r.settlement ? 'Authorised reviewer reverses the interest charged during the hold' : 'Authorised reviewer confirms the settlement date', missing: missingOf(c, facts, ['settlement']) });
          } else {
            const days = E.daysBetween(closing, fund.bank.slice(0, 10));
            const est = E.round2(days * loan.perDiem);
            add({ code: 'LATE_FUNDS', short: 'Funds arrived late', cls: 'business', confidence: 'high', by: 'Servicing rule', facts: ['bank', 'settlement', 'per_diem', 'balance'],
              title: r.settlement ? `Shortfall ${money(est)} confirmed for ${days} days` + (r.noticeSent ? '; waiting for the top-up' : '') : `Funds reached the bank ${days} days after closing; shortfall about ${money(est)} (estimate)`,
              expected: money(0), actual: `${money(loan.balance)} owing`,
              cause: `${days} days × ${money(loan.perDiem)} per diem from statement v${r.statement.v}. ${r.settlement ? `Settlement date ${day(r.settlement.date)} set by an authorised reviewer (${r.settlement.ref}).` : 'An estimate until an authorised reviewer confirms the date and rate.'}`,
              next: !r.settlement ? 'Authorised reviewer confirms date and per diem' : r.noticeSent ? 'Wait for the top-up, then re-check' : 'Send the shortfall notice', missing: missingOf(c, facts, ['settlement']) });
          }
        }
      }
      if (r.request.status === 'active' && r.statement && loan.balance > 0 && !loan.paidOff && !funds.some((f) => f.bank || f.posted) && hoursTo(now, r.statement.validUntil) <= 72) {
        const sent = funds.find((f) => f.sent);
        add({ code: 'STATEMENT_EXPIRING', short: 'Statement expiring, no funds', title: `Statement v${r.statement.v} good to ${day(r.statement.validUntil)}; ${sent ? `sender says ${sent.id} went out, the bank has not confirmed it` : 'no wire or confirmation seen'}`,
          expected: 'Funds before the statement expires', actual: sent ? 'Wire sent, not received' : 'Nothing seen', cls: sent ? 'timing' : 'insufficient', impact: 'closing', blocks: [], facts: ['funds', 'good_to'],
          cause: 'The statement figures stop holding after this date.', next: sent ? 'Ask Payments to look for the wire' : 'Ask Payments whether anything has arrived; follow up with the lawyer', missing: missingOf(c, facts, ['funds']) });
      }
      if (r.statement && closing && r.statement.basis !== closing) add({ code: 'CLOSING_CHANGED', short: 'Closing moved', title: `Closing moved to ${day(closing)}; statement v${r.statement.v} is calculated to ${day(r.statement.basis)}`, expected: `Statement to ${day(closing)}`, actual: `Statement to ${day(r.statement.basis)}`, cls: 'business', confidence: 'high', impact: 'closing', facts: ['closing', 'good_to'], blocks: ['resume'],
        cause: `Changed from ${day((r.closing.history || [])[0] ? r.closing.history[0].from : r.closing.original)} by ${(r.closing.history || [])[0] ? r.closing.history[0].source : 'a newer record'}. Anything approved on the old date needs another look.`, next: 'Reissue the statement, or confirm v1 stands' });
      if (r.request.status === 'cancel-requested') {
        const live = funds.filter((f) => !f.returned);
        if (live.length) add({ code: 'CANCEL_OPEN_ITEMS', short: 'Cancel with money moving', title: live[0].bank ? `Cancellation asked; ${live[0].id} reached the bank ${when(live[0].bank)}` : `Cancellation asked while ${live[0].id} (${money(live[0].amount)}) is in transit`, expected: 'No money moving', actual: live[0].bank ? 'Received, not returned' : 'In transit', cls: 'business', confidence: 'high', facts: ['bank'], blocks: ['confirm-cancel'], cause: 'A cancellation can only be confirmed once money that was sent is located and returned.', next: 'Ask Payments to find and return the wire', missing: missingOf(c, facts, ['bank']) });
      }
      if (r.waiver && ['approved', 'applied'].includes(r.waiver.status) && r.statement.prepay !== r.waiver.approved) add({ code: 'WAIVER_NOT_APPLIED', short: 'Waiver not applied', title: `Waiver ${r.waiver.ref} approved at ${money(r.waiver.approved)}; statement v${r.statement.v} still charges ${money(r.statement.prepay)}`, expected: money(r.waiver.approved), actual: money(r.statement.prepay), cls: 'source-error', confidence: 'high', facts: ['prepay'], blocks: ['resume'], impact: 'closing', cause: 'The approval and the statement disagree; the approval is the later, authorised record.', next: 'Ask Settlement Adjustments to apply it' });
      if (r.statement && r.statement.registrations.join() !== r.request.registrations.join()) add({ code: 'STATEMENT_REG_MISMATCH', short: 'Wrong registration', title: `Request is for ${r.request.registrations.join(', ')}; statement v${r.statement.v} names ${r.statement.registrations.join(', ')}`, expected: r.request.registrations.join(', '), actual: r.statement.registrations.join(', '), cls: 'source-error', confidence: 'high', facts: ['registration'], blocks: ['resume'], impact: 'closing', cause: 'The title search shows both charges on the parcel; the statement picked the other one.', next: 'Hold the statement; ask for a corrected version' });
      if (r.discharge && r.discharge.authorized) {
        const rc = r.discharge.receipt, target = r.request.registrations[0];
        if (!rc || rc.instrument !== target) add({ code: 'MISSING_FINAL_RECEIPT', short: 'No final receipt', title: rc ? `Receipt ${rc.ref} is for ${rc.instrument}, not ${target}` : `Paid off ${day(loan.paidOff)}; no registration receipt for ${target}`, expected: `Receipt for ${target}`, actual: rc ? rc.instrument : 'None', cls: rc ? 'source-error' : 'insufficient', confidence: rc ? 'high' : null, facts: ['receipt'], blocks: ['resume'], impact: 'info', cause: `Authorised ${day(r.discharge.authorized)}, delivered ${day(r.discharge.delivered)}, submitted ${day(r.discharge.submitted)}.`, next: 'Registration follows up until the right receipt is attached', missing: missingOf(c, facts, ['receipt']) });
      }
      if (r.instructions && r.docs && r.docs.prepared !== r.instructions.type) add({ code: 'DOC_TYPE_MISMATCH', short: 'Wrong document type', title: `Instruction asks for an ${r.instructions.type}; package is a ${r.docs.prepared}`, expected: r.instructions.type, actual: r.docs.prepared, cls: 'source-error', confidence: 'high', facts: ['doc_type'], blocks: ['resume'], cause: 'A discharge ends the charge; an assignment hands it to the new lender. They are not interchangeable.', next: 'Ask Registration to prepare the right package' });
      if (r.refi && !r.refi.transfer) add({ code: 'REFI_NOT_LINKED', short: 'Old loan still open', title: `New loan ${r.loans[1].no} funded ${day(r.loans[1].funded)}; old loan ${loan.no} still shows ${money(loan.balance)}`, expected: 'Old loan closed by an internal transfer', actual: 'No transfer recorded', cls: 'timing', confidence: 'medium', facts: ['transfer'], blocks: ['resume'], cause: `Internal refinance: no external wire or payout statement. Charge instruction: ${r.refi.charge}.`, next: 'Ask Payments for the internal transfer', missing: missingOf(c, facts, ['transfer']) });
      if (r.release && r.release.statement.join() !== r.release.instructed.join()) add({ code: 'SCOPE_MISMATCH', short: 'Release scope differs', title: `Approval releases ${r.release.instructed.join(', ')}; statement releases ${r.release.statement.join(', ')}`, expected: r.release.instructed.join(', '), actual: r.release.statement.join(', '), cls: 'source-error', confidence: 'high', facts: ['scope'], blocks: ['resume'], cause: `Security to keep: ${r.release.keep.join(', ')}.`, next: 'Authorised reviewer confirms scope; Statements corrects it' });
      if (r.reverse && !r.reverse.authority.probate) add({ code: 'MANUAL_REVIEW', short: 'Authority not on file', title: "Executor's authority not on file", expected: 'Certificate of appointment', actual: 'Request email only', cls: 'insufficient', facts: ['authority'], blocks: ['resume'], impact: 'info', cause: `Trigger: ${r.reverse.trigger}. Contract: ${r.reverse.contract}. Repayment figures go only to someone with authority.`, next: 'Collect the certificate; an authorised reviewer checks it', missing: missingOf(c, facts, ['authority']) });
      return out;
    },
    actions(c, ctx) {
      if (c.closed) return [];
      const r = c.records, list = [];
      const open = (code) => c.exceptions.some((x) => x.status === 'open' && x.code === code);
      const fund = (r.funds || [])[0];
      if (open('LATE_POSTING')) list.push({ id: 'apply-adjustment', label: 'Reverse the interest charged during our hold', perm: 'mortgage.settlement-date', facts: ['settlement', 'bank'],
        prereqs: [{ ok: !!r.settlement, label: r.settlement ? `Settlement date on file (${r.settlement.ref})` : 'Settlement date confirmed by an authorised reviewer' }] });
      if (open('LATE_POSTING') || open('LATE_FUNDS') || open('BALANCE_AFTER_PAYOUT')) {
        const late = fund && fund.bank && (fund.bank.slice(0, 10) > r.closing.latest);
        list.push({ id: 'send-notice', label: 'Send shortfall notice (simulated)', perm: 'mortgage.decide', facts: ['bank', 'settlement'],
          prereqs: [{ ok: !!late, label: !fund || !fund.bank ? 'Bank receipt time known' : late ? `Funds reached the bank after closing (${when(fund.bank)})` : `Funds reached the bank on time (${when(fund.bank)}); a late posting alone does not trigger a notice` },
            { ok: !!r.settlement, label: 'Authorised settlement date on file' }, { ok: !r.noticeSent, label: r.noticeSent ? 'Already sent' : 'Not sent before' }] });
      }
      if (r.request.status === 'cancel-requested') list.push({ id: 'confirm-cancel', label: 'Confirm the cancellation', perm: 'mortgage.decide', needsReason: true, facts: ['bank'], prereqs: [nothingOpen(c, 'confirm-cancel'), noBlockingTasks(ctx)] });
      else list.push({ id: 'resume', label: `Resume ${c.affects}`, perm: 'mortgage.resume', facts: [], prereqs: [nothingOpen(c, 'resume'), noBlockingTasks(ctx), staleOk(c)] });
      return list.concat(rereview(c));
    },
    apply(c, id, { now }) {
      const r = c.records;
      if (id === 'apply-adjustment') {
        const amt = r.loans[0].balance;
        r.adjustments.push({ type: 'interest reversal', amount: amt, at: now });
        r.loans[0].balance = 0;
        c.evidence.filter((e) => e.origin === 'loan-system' && !e.superseded).forEach((e) => { e.superseded = now; });
        c.evidence.push({ id: 'adj', label: 'Interest reversal on the loan', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: now, version: 2, loc: 'Adjustment · interest reversal', facts: { balance: 0 } });
        return { detail: `${money(amt)} reversed; balance 0.00`, changes: [{ label: 'Balance', before: amt, after: 0 }] };
      }
      if (id === 'send-notice') { r.noticeSent = now; c.stage = 'Shortfall notice sent (simulated)'; return { detail: 'Notice drafted from the confirmed figures; sending is simulated', recheck: true }; }
      if (id === 'confirm-cancel') { r.request.status = 'cancelled'; c.stage = 'Cancelled; history kept'; c.closed = now; return { detail: 'Cancellation confirmed', recheck: false }; }
      if (id === 'resume') { c.stage = `Resumed: ${c.affects}`; c.closed = now; return { detail: 'Every condition for this step holds', recheck: false }; }
      if (id === 'rereview') return rereviewApply(c, now);
      return null;
    },
  };

  return { cash, payroll, mortgage };
});
