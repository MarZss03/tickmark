// Tickmark casework: synthetic people, documents and mortgage files for the Review Queue.
// Every name, loan, registration number, email and amount here is invented. Nothing is a real bank,
// lender, law firm or person, and the bank rules marked "demo" have not been checked with any lender.
window.TMC = (() => {
  // ---------- people and teams (simulated sign-in) ----------
  const teams = {
    treasury: { name: 'Treasury Operations', lead: 'sara' },
    ap: { name: 'Accounts Payable', lead: 'rina' },
    ar: { name: 'Accounts Receivable', lead: 'amir' },
    gl: { name: 'General Ledger', lead: 'hana' },
    payroll: { name: 'Payroll Operations', lead: 'mei' },
    time: { name: 'Timekeeping', lead: 'omar' },
    servicing: { name: 'Mortgage Servicing', lead: 'grace' },
    payments: { name: 'Payments', lead: 'priya' },
    approvals: { name: 'Servicing Approvals', lead: 'daniel' },
    statements: { name: 'Payout Statements', lead: 'noah' },
    adjustments: { name: 'Settlement Adjustments', lead: 'ines' },
    registration: { name: 'Discharge and Registration', lead: 'kofi' },
    books: { name: 'Bookkeeping (store)', lead: 'sam' },
    store: { name: 'Store Operations', lead: 'jada' },
    support: { name: 'Processor Support (simulated)', lead: 'remy' },
  };
  const people = {
    sara: { name: 'Sara Novak', team: 'treasury', role: 'Treasury analyst, owns cash cases', perms: ['cash.decide', 'cash.confirm'] },
    tom: { name: 'Tom Becker', team: 'ap', role: 'AP clerk', perms: [] },
    rina: { name: 'Rina Shah', team: 'ap', role: 'AP lead', perms: [] },
    amir: { name: 'Amir Haddad', team: 'ar', role: 'AR lead', perms: [] },
    hana: { name: 'Hana Sato', team: 'gl', role: 'GL accountant, owns close exceptions', perms: ['close.decide'] },
    mei: { name: 'Mei Lin', team: 'payroll', role: 'Payroll lead, can release', perms: ['payroll.decide', 'payroll.release'] },
    jon: { name: 'Jon Reyes', team: 'payroll', role: 'Payroll analyst', perms: ['payroll.decide'] },
    omar: { name: 'Omar Diallo', team: 'time', role: 'Keeps the timesheet imports', perms: [] },
    ava: { name: 'Ava Chen', team: 'servicing', role: 'Servicing officer, owns payout cases', perms: ['mortgage.decide'] },
    grace: { name: 'Grace Liu', team: 'servicing', role: 'Servicing lead', perms: ['mortgage.decide'] },
    leo: { name: 'Leo Park', team: 'payments', role: 'Payments analyst', perms: [] },
    priya: { name: 'Priya Nair', team: 'payments', role: 'Payments lead', perms: [] },
    daniel: { name: 'Daniel Roy', team: 'approvals', role: 'Authorised reviewer: settlement dates, resuming payouts', perms: ['mortgage.decide', 'mortgage.settlement-date', 'mortgage.resume'] },
    eliza: { name: 'Eliza Moreau', team: 'approvals', role: 'Approvals analyst (no settlement authority)', perms: ['mortgage.decide'] },
    noah: { name: 'Noah Kim', team: 'statements', role: 'Payout statements lead', perms: [] },
    ines: { name: 'Ines Duarte', team: 'adjustments', role: 'Settlement adjustments lead', perms: [] },
    kofi: { name: 'Kofi Mensah', team: 'registration', role: 'Registration lead', perms: [] },
    lucy: { name: 'Lucy Grant', team: 'registration', role: 'Registration clerk', perms: [] },
    sam: { name: 'Sam Ortiz', team: 'books', role: 'Bookkeeper for Fernleaf Ceramics, owns payout cases', perms: ['payouts.decide'] },
    jada: { name: 'Jada Brooks', team: 'store', role: 'Store owner, decides disputes', perms: ['payouts.decide', 'payouts.approve'] },
    kai: { name: 'Kai Morgan', team: 'store', role: 'Store operations, has the payments dashboard', perms: [] },
    remy: { name: 'Remy Laurent', team: 'support', role: 'Payment processor support (simulated)', perms: [] },
  };

  // ---------- extra evidence for cash differences the matcher already finds ----------
  // keyed by the bank line: date and amount
  const cash = {
    '2026-10-22:-6850': {
      title: 'Legal fee paid 6,850.00; ledger shows 6,580.00', amountLabel: 'Payment',
      evidence: [
        { id: 'ap', label: 'AP entry AP-55102', system: 'AP subledger', origin: 'ap-entry', kind: 'record', recorded: '2026-10-21T15:10:00Z', loc: 'Entry AP-55102 · amount field · keyed by T. Becker', facts: { amount: 6580, payee: 'Lindqvist Law LLP', invoice: 'LGL-0917' } },
        { id: 'inv', label: 'Vendor invoice LGL-0917 (PDF text)', system: 'AP inbox · invoice PDF', origin: 'vendor', kind: 'document', recorded: '2026-10-02T09:00:00Z',
          text: 'LINDQVIST LAW LLP\nInvoice LGL-0917\nDate: 2026-09-30\nFor: September advisory services\nTotal due: CAD 6,850.00\nPayable within 30 days.',
          extract: [{ fact: 'amount', re: 'Total due: CAD ([0-9,]+\\.\\d{2})', number: true }, { fact: 'invoice', re: 'Invoice (LGL-\\d+)' }] },
      ],
      glOrigin: 'ap-entry', glLabel: 'Ledger line · Legal · Sept invoice (posted from AP-55102)',
      factDefs: [{ key: 'amount', label: 'Amount paid', required: true, who: 'ap' }, { key: 'payee', label: 'Payee' }, { key: 'invoice', label: 'Invoice' }],
      draft: { cta: 'Request AP correction', to: 'person', person: 'tom', kind: 'correction', question: 'Please check the amount on Lindqvist Law invoice LGL-0917 and correct AP entry AP-55102 if it was keyed as 6,580.00. Attach the corrected entry.', why: 'The bank paid 6,850.00 and the invoice says 6,850.00; the ledger copies AP-55102 at 6,580.00, which looks like two digits swapped.', requested: ['Corrected AP entry'] },
      available: [
        { id: 'ap-fix', label: 'Corrected AP entry AP-55102 (v2) and its ledger posting', teams: ['ap'], correction: true, supersedes: ['ap', 'gl'],
          evidence: { label: 'AP entry AP-55102 v2 · ledger reposted', system: 'AP subledger', origin: 'ap-entry', kind: 'record', loc: 'Entry AP-55102 v2 · amount field', facts: { amount: 6850, payee: 'Lindqvist Law LLP', invoice: 'LGL-0917' } },
          patch: [{ path: 'gl.0.2', value: -6850, label: 'Ledger amount' }] },
      ],
    },
    '2026-10-20:7400': {
      title: 'Customer receipt 7,400.00 with no ledger line', amountLabel: 'Receipt',
      evidence: [],
      factDefs: [{ key: 'amount', label: 'Amount received', required: true }, { key: 'payer', label: 'Who paid', required: true, who: 'ar' }, { key: 'invoice', label: 'Which invoice', required: true, who: 'ar' }],
      draft: { cta: 'Ask AR who paid', to: 'team', team: 'ar', kind: 'evidence', question: 'Who sent the 7,400.00 received on 20 Oct with no reference, and which invoice does it settle? Please attach the remittance advice.', why: 'The bank line has no reference and no open ledger line matches it, so it cannot be applied.', requested: ['Remittance advice'] },
      available: [
        { id: 'remit', label: 'Remittance advice from Northgate Supply (email)', teams: ['ar'],
          evidence: { label: 'Remittance advice · Northgate Supply', system: 'AR inbox · email', origin: 'customer', kind: 'document',
            text: 'From: accounts@northgate.example\nSubject: Payment sent\nWe paid INV-2324 in full today: CAD 7,400.00 by EFT, payer Northgate Supply Ltd.',
            extract: [{ fact: 'amount', re: 'CAD ([0-9,]+\\.\\d{2})', number: true }, { fact: 'invoice', re: 'paid (INV-\\d+)' }, { fact: 'payer', re: 'payer (Northgate Supply Ltd)' }] },
          patch: [{ path: 'gl.0', value: ['2026-10-20', 'INV-2324 · Northgate Supply', 7400], label: 'Ledger receipt' }] },
      ],
    },
    '2026-10-09:-412.8': {
      title: 'Bank fee 412.80 not in the ledger yet', amountLabel: 'Fee',
      evidence: [{ id: 'je', label: 'Close journal draft JE-1036', system: 'Close journals', origin: 'gl-draft', kind: 'record', recorded: '2026-11-03T16:00:00Z', loc: 'JE-1036 · drafted, not posted', facts: { amount: 412.8 } }],
      draft: { cta: 'Ask GL to post JE-1036', to: 'person', person: 'hana', kind: 'correction', question: 'Draft JE-1036 for the 412.80 bank fee is not posted. Can you post it to 9 Oct so the statement line matches?', why: 'The fee is on the bank statement and in the draft journal, but not in the ledger.', requested: ['Posted JE-1036'] },
      factDefs: [{ key: 'amount', label: 'Fee amount', required: true }],
      available: [
        { id: 'je-post', label: 'JE-1036 posted to 9 Oct', teams: ['gl'], correction: true,
          evidence: { label: 'JE-1036 posted', system: 'General ledger', origin: 'gl-draft', kind: 'record', loc: 'JE-1036 · posted', facts: { amount: 412.8 } }, supersedes: ['je'],
          patch: [{ path: 'gl.0', value: ['2026-10-09', 'Bank fees · JE-1036', -412.8], label: 'Ledger line' }] },
      ],
    },
  };

  // ---------- extra evidence for payroll exceptions the rules already find ----------
  const payroll = {
    'E-1017:DUPLICATE_PAYMENT': {
      title: 'E-1017 paid twice: two imports of the same timesheet export',
      evidence: [
        { id: 'imp7', label: 'Import IMP-1015-07', system: 'Payroll import log', origin: 'export:TS-1015', kind: 'record', recorded: '2026-10-14T16:02:00Z', loc: 'IMP-1015-07 · source file TS-export-1015.csv (sha 9c41e2)', facts: { source_file: 'TS-export-1015.csv · 9c41e2' } },
        { id: 'imp9', label: 'Import IMP-1015-09', system: 'Payroll import log', origin: 'export:TS-1015', kind: 'record', recorded: '2026-10-14T18:47:00Z', loc: 'IMP-1015-09 · source file TS-export-1015.csv (sha 9c41e2)', facts: { source_file: 'TS-export-1015.csv · 9c41e2' } },
        { id: 'ts', label: 'Timesheet TS-E1017-1015', system: 'Timekeeping', origin: 'timekeeping', kind: 'record', recorded: '2026-10-14T12:00:00Z', loc: 'One approved sheet, 80.0 h, approver J. Ortiz', facts: { pay_lines: 1, approved: 'J. Ortiz, 14 Oct' } },
      ],
      register: { origin: 'export:TS-1015', loc: 'Register rows 6 and 30 · both from TS-export-1015.csv' },
      factDefs: [{ key: 'pay_lines', label: 'Pay lines this period', required: true }, { key: 'source_file', label: 'Where the lines came from' }, { key: 'approved', label: 'Timesheet approval', required: true, who: 'time' }],
      draft: { cta: 'Request import check', to: 'person', person: 'omar', kind: 'correction', question: 'E-1017 has two pay lines from imports IMP-1015-07 and IMP-1015-09, which read the same file. Was the second import a re-run? If so, please reverse it and attach the reversal.', why: 'Timekeeping has one approved sheet for E-1017; the register pays two.', requested: ['Reversal of the duplicate import'] },
      available: [
        { id: 'rev', label: 'Reversal of IMP-1015-09 (re-run of the same file)', teams: ['time'], correction: true, supersedes: ['reg'],
          evidence: { label: 'Payroll register after reversal', system: 'Payroll register', origin: 'export:TS-1015', kind: 'record', loc: 'Row 30 reversed by REV-1015-02', facts: { pay_lines: 1 } },
          patch: [{ path: 'pay.1', value: undefined, label: 'Second pay line' }] },
      ],
    },
  };

  // ---------- month-end close: the exceptions in data.js, with what each should be and who can answer ----------
  const close = {
    'CL-02': { expected: 'Within 500.00 of the warehouse', actual: 'Off by 5,250.00', cls: 'business', cause: 'GL 2400 and the metrics warehouse disagree by more than the tolerance. The revenue schedule decides which is right.',
      draft: { cta: 'Ask AR for the revenue schedule', to: 'team', team: 'ar', kind: 'evidence', question: 'Deferred revenue in GL 2400 is 5,250.00 above the metrics warehouse. Which contracts make up the difference? Please attach the October revenue schedule.', why: 'The gap is over the 500.00 tolerance and blocks sign-off.', requested: ['October revenue schedule'] } },
    'CL-05': { expected: 'Posted in October', actual: 'Posted into closed September', cls: 'source-error', cause: 'JE-0977 is dated 2 Oct but sits in the closed September period.',
      draft: { cta: 'Ask AP about JE-0977', to: 'team', team: 'ap', kind: 'correction', question: 'JE-0977 (12,000.00) was posted on 2 Oct into the closed September period. Should it be reversed and reposted in October?', why: 'A posting into a closed period blocks sign-off.', requested: ['Reversal and repost, or the reason it belongs in September'] } },
    'CL-06': { expected: 'Accrual of 51,941.13', actual: 'Booked 0.00', cls: 'timing', cause: 'The payroll register expects October contractor cost; draft JE-1031 is ready but not posted.',
      draft: { cta: 'Ask Payroll to confirm the estimate', to: 'team', team: 'payroll', kind: 'verify', question: 'Can you confirm the October contractor payroll estimate of 51,941.13 so JE-1031 can be posted?', why: 'The accrual is missing and blocks sign-off.', requested: ['Confirmed estimate'] } },
    'CL-01': { expected: 'Receipt on file', actual: 'No receipt', cls: 'insufficient', cause: 'Card spend of 2,480.00 is over the 1,000.00 limit with no receipt.',
      draft: { cta: 'Request the receipt', to: 'team', team: 'ap', kind: 'evidence', question: 'Please get the receipt for the 2,480.00 cloud marketplace charge on card ·· 4410.', why: 'Over the policy limit with no receipt.', requested: ['Receipt'] } },
    'CL-03': { expected: 'One charge', actual: 'Two identical charges', cls: 'source-error', cause: 'Two charges of 1,350.00 from the same merchant on 14 Oct.',
      draft: { cta: 'Ask AP about the second charge', to: 'team', team: 'ap', kind: 'verify', question: 'Were both 1,350.00 design-tool charges on 14 Oct intended, or should one be refunded?', why: 'Looks like a duplicate.', requested: ['Confirmation or refund'] } },
    'CL-04': { expected: 'Owner assigned, due BD2', actual: 'Unassigned on BD3', cls: 'timing', cause: 'The operating bank reconciliation has no owner and is a day late.',
      draft: { cta: 'Ask Treasury to take it', to: 'team', team: 'treasury', kind: 'verify', question: 'The operating bank reconciliation was due on BD2 and has no owner. Can someone in Treasury take it today?', why: 'Late and unassigned.', requested: ['An owner'] } },
  };

  // ---------- mortgage servicing: synthetic files ----------
  const ON = 'Demo Bank|ON|Residential';
  // Rules the demo treats as checked. Everything else goes to a person before anything moves.
  const rules = {
    [`${ON}|Sale`]: { label: 'Residential payout on sale', basis: 'demo', cutoff: '15:00', perDiem: true },
    [`${ON}|External refinance`]: { label: 'Residential payout to another lender', basis: 'demo', cutoff: '15:00', perDiem: true },
    [`${ON}|Internal refinance`]: { label: 'Internal refinance, no external funds', basis: 'demo', cutoff: null, perDiem: false, noStatement: true },
    [`${ON}|Assignment`]: { label: 'Transfer of the charge to a new lender', basis: 'demo', cutoff: '15:00', perDiem: true },
  };
  const mortgage = [
    {
      key: 'ms:ML-40311', title: '14 Birchwood Cres · payout on sale', branch: 'sale', branchLabel: 'Sale', owner: 'ava',
      openedBecause: 'Loan shows a balance after the payout posted', amount: 412880, amountLabel: 'Payout', due: '2026-11-05T19:00:00Z', dueLabel: 'Discharge preparation due', affects: 'discharge preparation',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-10-30', latest: '2026-10-30' },
        loans: [{ no: 'ML-40311', balance: 123.54, perDiem: 41.18 }], request: { status: 'active', registrations: ['ON 2291847'] },
        statement: { v: 1, basis: '2026-10-30', validUntil: '2026-10-30', amount: 412880, registrations: ['ON 2291847'], prepay: 0 },
        funds: [{ id: 'W-88213', amount: 412880, sent: '2026-10-30', bank: null, holdOn: null, holdOff: null, posted: '2026-11-02' }], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'loan', label: 'Loan ML-40311', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: '2026-11-02T13:40:00Z', loc: 'Payments tab · posting 2 Nov · balance', facts: { posted: '2026-11-02', balance: 123.54 } },
        { id: 'stmt', label: 'Payout statement v1', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-10-24T10:00:00Z', loc: 'Statement v1 · good to 30 Oct', facts: { payout_amount: 412880, good_to: '2026-10-30', per_diem: 41.18 } },
        { id: 'law', label: 'Email from Okafor Law, 30 Oct', system: 'Servicing inbox', origin: 'lawyer', kind: 'document', recorded: '2026-10-30T14:21:00Z',
          text: 'From: R. Okafor, Okafor Law (fictional)\nRe: ML-40311 payout, 14 Birchwood Cres\nFunds of $412,880.00 were wired today, 30 Oct 2026, under reference W-88213, per your statement good to 30 October.',
          extract: [{ fact: 'payout_amount', re: 'Funds of \\$([0-9,]+\\.\\d{2})', number: true, origin: 'statement' }, { fact: 'wire_ref', re: 'reference (W-\\d+)' }, { fact: 'sent', re: 'wired today, (\\d+ \\w+ \\d{4})' }] },
      ],
      factDefs: [
        { key: 'bank', label: 'Bank received the funds', required: true, who: 'payments', checked: 'Loan system, payout statement, lawyer email' },
        { key: 'posted', label: 'Posted to the loan' }, { key: 'payout_amount', label: 'Payout amount' },
        { key: 'settlement', label: 'Authorised settlement date', required: true, who: 'approvals', checked: 'No approval on file' },
        { key: 'balance', label: 'Balance on the loan' },
      ],
      drafts: {
        BALANCE_AFTER_PAYOUT: { cta: 'Request receipt confirmation', to: 'team', team: 'payments', kind: 'verify', question: 'Please confirm when the bank received wire W-88213 (412,880.00) for ML-40311, and why it reached the loan on 2 Nov. Attach the records that show both times.', why: 'The loan charges three days of interest after the 30 Oct closing. If the wire arrived on time, the delay is ours and no shortfall notice should go out.', requested: ['Incoming wire record', 'Any hold and its release'] },
        LATE_POSTING: { cta: 'Request settlement decision', to: 'person', person: 'daniel', requires: 'mortgage.settlement-date', kind: 'verify', question: 'Payments confirms W-88213 reached the bank on 30 Oct at 14:02 and sat on a review hold until 2 Nov. Please confirm the settlement date that applies to ML-40311 and the next step for the 123.54.', why: 'Only an authorised reviewer can set the settlement date. Discharge preparation waits on it.', requested: ['Settlement date decision'] },
      },
      available: [
        { id: 'wire', label: 'Incoming wire log: W-88213 with hold and release', teams: ['payments'], touches: ['bank'],
          evidence: { label: 'Wire log W-88213', system: 'Payments · incoming wires', origin: 'bank-wire', kind: 'record', loc: 'W-88213 · value date, hold record HLD-7720', facts: { bank: '2026-10-30 14:02', hold: 'review hold 30 Oct 14:05 – 2 Nov 09:40', payout_amount: 412880 } },
          patch: [{ path: 'funds.0.bank', value: '2026-10-30T14:02', label: 'Bank received' }, { path: 'funds.0.holdOn', value: '2026-10-30T14:05', label: 'Hold placed' }, { path: 'funds.0.holdOff', value: '2026-11-02T09:40', label: 'Hold released' }] },
        { id: 'settle', label: 'Settlement date decision: 30 Oct applies', teams: ['approvals'], touches: ['settlement'],
          evidence: { label: 'Settlement decision SD-3108', system: 'Servicing approvals', origin: 'approvals', kind: 'record', loc: 'SD-3108 · signed by D. Roy', facts: { settlement: '2026-10-30' } },
          patch: [{ path: 'settlement', value: { date: '2026-10-30', by: 'daniel', ref: 'SD-3108' }, label: 'Settlement date' }] },
      ],
    },
    {
      key: 'ms:ML-38774', title: '7 Lakeshore Rd · payout on sale', branch: 'sale', branchLabel: 'Sale', owner: 'ava',
      openedBecause: 'Wire reached the bank after the closing date', amount: 289400, amountLabel: 'Payout', due: '2026-11-06T19:00:00Z', dueLabel: 'Discharge preparation due', affects: 'discharge preparation',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-10-30', latest: '2026-10-30' },
        loans: [{ no: 'ML-38774', balance: 208.28, perDiem: 52.07 }], request: { status: 'active', registrations: ['ON 2187402'] },
        statement: { v: 1, basis: '2026-10-30', validUntil: '2026-10-30', amount: 289400, registrations: ['ON 2187402'], prepay: 0 },
        funds: [{ id: 'W-88540', amount: 289400, sent: '2026-11-02', bank: '2026-11-03T09:12', holdOn: null, holdOff: null, posted: '2026-11-03' }], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'loan', label: 'Loan ML-38774', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: '2026-11-03T11:00:00Z', loc: 'Payments tab · balance', facts: { posted: '2026-11-03', balance: 208.28 } },
        { id: 'wire', label: 'Wire log W-88540', system: 'Payments · incoming wires', origin: 'bank-wire', kind: 'record', recorded: '2026-11-03T09:12:00Z', loc: 'W-88540 · value date', facts: { bank: '2026-11-03 09:12', payout_amount: 289400 } },
        { id: 'stmt', label: 'Payout statement v1', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-10-22T10:00:00Z', loc: 'Statement v1 · good to 30 Oct · per diem 52.07', facts: { payout_amount: 289400, good_to: '2026-10-30', per_diem: 52.07 } },
        { id: 'law', label: 'Email from Haldane & Co, 2 Nov', system: 'Servicing inbox', origin: 'lawyer', kind: 'document', recorded: '2026-11-02T16:30:00Z',
          text: "From: Haldane & Co (fictional)\nRe: ML-38774\nApologies: our client's bank held the funds. We wired $289,400.00 on 2 Nov 2026, reference W-88540.",
          extract: [{ fact: 'payout_amount', re: 'wired \\$([0-9,]+\\.\\d{2})', number: true, origin: 'statement' }, { fact: 'sent', re: 'on (\\d+ \\w+ \\d{4})' }] },
      ],
      factDefs: [{ key: 'bank', label: 'Bank received the funds', required: true }, { key: 'settlement', label: 'Authorised settlement date', required: true, who: 'approvals', checked: 'No approval on file' }, { key: 'per_diem', label: 'Per diem' }, { key: 'balance', label: 'Balance on the loan' }],
      drafts: { LATE_FUNDS: { cta: 'Request settlement decision', to: 'person', person: 'daniel', requires: 'mortgage.settlement-date', kind: 'verify', question: 'W-88540 reached the bank on 3 Nov, four days after the 30 Oct closing on statement v1. Please confirm the settlement date and per diem so the 208.28 shortfall can be sent.', why: 'The shortfall is an estimate until an authorised reviewer confirms the date and rate.', requested: ['Settlement date and per diem'] } },
      available: [
        { id: 'settle', label: 'Settlement decision: 3 Nov at 52.07 per day', teams: ['approvals'], touches: ['settlement'],
          evidence: { label: 'Settlement decision SD-3112', system: 'Servicing approvals', origin: 'approvals', kind: 'record', loc: 'SD-3112 · signed by D. Roy', facts: { settlement: '2026-11-03', per_diem: 52.07 } },
          patch: [{ path: 'settlement', value: { date: '2026-11-03', by: 'daniel', ref: 'SD-3112' }, label: 'Settlement date' }] },
      ],
      inbox: [
        { id: 'topup', label: 'Top-up wire W-88602 for 208.28', note: 'Arrives after the shortfall notice', after: 'noticeSent',
          evidence: { label: 'Wire log W-88602 (top-up)', system: 'Payments · incoming wires', origin: 'bank-wire', kind: 'record', loc: 'W-88602 · posted to ML-38774', facts: { balance: 0 } },
          patch: [{ path: 'funds.1', value: { id: 'W-88602', amount: 208.28, sent: '2026-11-04', bank: '2026-11-04T15:20', posted: '2026-11-04' }, label: 'Top-up' }, { path: 'loans.0.balance', value: 0, label: 'Balance' }], supersedes: ['loan'] },
      ],
    },
    {
      key: 'ms:ML-41902', title: '22 Alder St · payout on sale', branch: 'sale', branchLabel: 'Sale', owner: 'ava',
      openedBecause: 'Statement expires soon and no funds are seen', amount: 356215, amountLabel: 'Payout', due: '2026-11-06T20:00:00Z', dueLabel: 'Statement expires', affects: 'payout on the statement',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-11-06', latest: '2026-11-06', history: [] },
        loans: [{ no: 'ML-41902', balance: 356215, perDiem: 58.4 }], request: { status: 'active', registrations: ['ON 2402215'] },
        statement: { v: 1, basis: '2026-11-06', validUntil: '2026-11-06', amount: 356215, registrations: ['ON 2402215'], prepay: 0 },
        funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'stmt', label: 'Payout statement v1', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-10-28T10:00:00Z', loc: 'Statement v1 · good to 6 Nov', facts: { good_to: '2026-11-06', payout_amount: 356215 } },
        { id: 'req', label: 'Payout request', system: 'Request intake', origin: 'lawyer', kind: 'record', recorded: '2026-10-27T09:00:00Z', loc: 'Request PR-77120 · closing date', facts: { closing: '2026-11-06' } },
      ],
      decisions: [{ id: 'DC-seed-1', action: 'approve-statement', label: 'Approved statement v1 for this payout', by: 'grace', at: '2026-10-28T11:00:00Z', reason: 'Figures and registration match the request.', version: 1, facts: ['closing', 'good_to'], stale: false }],
      factDefs: [{ key: 'closing', label: 'Closing date', required: true }, { key: 'good_to', label: 'Statement good to' }, { key: 'funds', label: 'Funds seen', required: true, who: 'payments', checked: 'Incoming wires to date' }],
      drafts: {
        CLOSING_CHANGED: { cta: 'Request updated statement', to: 'team', team: 'statements', kind: 'correction', question: 'Closing for ML-41902 moved from 6 Nov to 13 Nov. Please reissue the payout statement good to 13 Nov, or confirm v1 can stand.', why: 'Statement v1 and its approval rest on the old date.', requested: ['Statement v2'] },
        STATEMENT_EXPIRING: { cta: 'Ask Payments about funds', to: 'team', team: 'payments', kind: 'verify', question: 'Have any funds or wire confirmations arrived for ML-41902 (payout 356,215.00)? Statement v1 is good only to 6 Nov.', why: 'Nothing is seen yet and the statement is close to expiry.', requested: ['Wire confirmation, if any'], blocking: false },
      },
      inbox: [
        { id: 'move', label: 'Email: closing moved to 13 Nov', touches: ['closing'], due: '2026-11-13T20:00:00Z',
          evidence: { label: 'Email from Pryce Legal, 3 Nov', system: 'Servicing inbox', origin: 'lawyer', kind: 'document',
            text: 'From: Pryce Legal (fictional)\nRe: PR-77120, 22 Alder St\nThe purchaser has asked for more time. Closing is now 13 Nov 2026. Please send an updated statement.',
            extract: [{ fact: 'closing', re: 'Closing is now (\\d+ \\w+ \\d{4})' }] },
          supersedes: ['req'], patch: [{ path: 'closing.latest', value: '2026-11-13', label: 'Closing date' }, { path: 'closing.history.0', value: { from: '2026-11-06', to: '2026-11-13', source: 'Email from Pryce Legal, 3 Nov' }, label: 'Date change' }] },
      ],
      available: [
        { id: 'v2', label: 'Payout statement v2, good to 13 Nov', teams: ['statements'], correction: true, supersedes: ['stmt'],
          evidence: { label: 'Payout statement v2', system: 'Payout statements', origin: 'statement', kind: 'record', loc: 'Statement v2 · good to 13 Nov', facts: { good_to: '2026-11-13', payout_amount: 356623.8 } },
          patch: [{ path: 'statement', value: { v: 2, basis: '2026-11-13', validUntil: '2026-11-13', amount: 356623.8, registrations: ['ON 2402215'], prepay: 0 }, label: 'Statement' }] },
      ],
    },
    {
      key: 'ms:ML-37150', title: '9 Fern Ave · payout to another lender', branch: 'external-refi', branchLabel: 'External refinance', owner: 'ava',
      openedBecause: 'Approved penalty reduction is not on the statement', amount: 3060, amountLabel: 'Waived', due: '2026-11-09T20:00:00Z', dueLabel: 'Closing', affects: 'issuing the final statement',
      records: {
        rule: `${ON}|External refinance`, closing: { original: '2026-11-09', latest: '2026-11-09' },
        loans: [{ no: 'ML-37150', balance: 241900, perDiem: 39.75 }], request: { status: 'active', registrations: ['ON 1977310'] },
        statement: { v: 2, basis: '2026-11-09', validUntil: '2026-11-09', amount: 248020, registrations: ['ON 1977310'], prepay: 6120 },
        waiver: { status: 'approved', original: 6120, approved: 3060, ref: 'A-5521', by: 'daniel', at: '2026-10-29' }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'appr', label: 'Waiver approval A-5521', system: 'Servicing approvals', origin: 'approvals', kind: 'record', recorded: '2026-10-29T15:00:00Z', loc: 'A-5521 · partial reduction · signed D. Roy', facts: { prepay: 3060 } },
        { id: 'stmt', label: 'Payout statement v2', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-10-31T10:00:00Z', loc: 'Statement v2 · prepayment charge line', facts: { prepay: 6120 } },
      ],
      factDefs: [{ key: 'prepay', label: 'Prepayment charge', required: true }],
      drafts: { WAIVER_NOT_APPLIED: { cta: 'Request the waiver applied', to: 'team', team: 'adjustments', kind: 'correction', question: 'Waiver A-5521 cut the prepayment charge on ML-37150 from 6,120.00 to 3,060.00, but statement v2 still shows 6,120.00. Please apply it and attach the statement it lands on.', why: 'The borrower would pay 3,060.00 more than approved.', requested: ['Statement with the approved charge'] } },
      available: [
        { id: 'v3', label: 'Payout statement v3 with A-5521 applied', teams: ['adjustments'], correction: true, supersedes: ['stmt'],
          evidence: { label: 'Payout statement v3', system: 'Payout statements', origin: 'statement', kind: 'record', loc: 'Statement v3 · prepayment charge line', facts: { prepay: 3060 } },
          patch: [{ path: 'statement.prepay', value: 3060, label: 'Prepayment charge' }, { path: 'statement.v', value: 3, label: 'Statement version' }, { path: 'statement.amount', value: 244960, label: 'Statement amount' }, { path: 'waiver.status', value: 'applied', label: 'Waiver' }] },
      ],
    },
    {
      key: 'ms:ML-29988', title: '31 Cedar Lane · discharge after payout', branch: 'sale', branchLabel: 'Sale', owner: 'ava',
      openedBecause: 'Paid off with no final registration receipt', amount: 0, due: '2026-11-04T20:00:00Z', dueLabel: 'Follow-up due', affects: 'closing the file',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-10-09', latest: '2026-10-09' },
        loans: [{ no: 'ML-29988', balance: 0, paidOff: '2026-10-09' }], request: { status: 'active', registrations: ['ON 1188420'] },
        statement: { v: 1, basis: '2026-10-09', validUntil: '2026-10-09', amount: 198300, registrations: ['ON 1188420'], prepay: 0 },
        discharge: { authorized: '2026-10-12', delivered: '2026-10-13', submitted: '2026-10-14', receipt: null }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'loan', label: 'Loan ML-29988', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: '2026-10-09T15:00:00Z', loc: 'Status · paid out 9 Oct', facts: { paid_off: '2026-10-09' } },
        { id: 'auth', label: 'Discharge authorisation', system: 'Discharge and registration', origin: 'registration', kind: 'record', recorded: '2026-10-12T10:00:00Z', loc: 'Authorised 12 Oct · delivered to lawyer 13 Oct', facts: { target: 'ON 1188420' } },
      ],
      factDefs: [{ key: 'receipt', label: 'Registration receipt for ON 1188420', required: true, who: 'registration', checked: 'Registration tracker, servicing inbox' }],
      seedTasks: [{ to: 'team', team: 'registration', kind: 'evidence', question: 'Please get the registration receipt for the discharge of ON 1188420 (ML-29988). It was submitted on 14 Oct.', why: 'The loan is paid off but the file cannot close without the receipt.', requested: ['Registration receipt'], due: '2026-11-02T20:00:00Z', created: '2026-10-28T14:00:00Z' }],
      available: [
        { id: 'wrong', label: 'Registration receipt for ON 1188402', teams: ['registration'],
          evidence: { label: 'Registration receipt R-55120', system: 'Registration tracker', origin: 'land-registry', kind: 'document', text: 'Receipt R-55120 (synthetic)\nInstrument discharged: ON 1188402\nRegistered: 2026-10-16', extract: [{ fact: 'receipt', re: 'discharged: (ON \\d+)' }] },
          patch: [{ path: 'discharge.receipt', value: { ref: 'R-55120', instrument: 'ON 1188402' }, label: 'Receipt' }] },
        { id: 'right', label: 'Registration receipt for ON 1188420', teams: ['registration'],
          evidence: { label: 'Registration receipt R-55133', system: 'Registration tracker', origin: 'land-registry', kind: 'document', text: 'Receipt R-55133 (synthetic)\nInstrument discharged: ON 1188420\nRegistered: 2026-10-16', extract: [{ fact: 'receipt', re: 'discharged: (ON \\d+)' }] },
          patch: [{ path: 'discharge.receipt', value: { ref: 'R-55133', instrument: 'ON 1188420' }, label: 'Receipt' }] },
      ],
    },
    {
      key: 'ms:ML-43310', title: '5 Willow Crt · payout on sale', branch: 'sale', branchLabel: 'Sale', owner: 'grace',
      openedBecause: 'Statement is for a different registration', amount: 181050, amountLabel: 'Payout', due: '2026-11-07T20:00:00Z', dueLabel: 'Closing', affects: 'sending the statement',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-11-07', latest: '2026-11-07' },
        loans: [{ no: 'ML-43310', balance: 181050, perDiem: 29.7 }], request: { status: 'active', registrations: ['ON 3301122'] },
        statement: { v: 1, basis: '2026-11-07', validUntil: '2026-11-07', amount: 181050, registrations: ['ON 3307740'], prepay: 0 }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'req', label: 'Payout request PR-77311', system: 'Request intake', origin: 'lawyer', kind: 'record', recorded: '2026-11-02T09:00:00Z', loc: 'Registration to discharge', facts: { registration: 'ON 3301122' } },
        { id: 'stmt', label: 'Payout statement v1', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-11-03T10:00:00Z', loc: 'Statement v1 · security line', facts: { registration: 'ON 3307740' } },
        { id: 'title', label: 'Title search (parcel 0412-118)', system: 'Title search copy', origin: 'land-registry', kind: 'document', recorded: '2026-11-02T09:30:00Z',
          text: 'Parcel 0412-118 (synthetic)\nCharge ON 3301122 to Demo Bank, 2019\nCharge ON 3307740 to Demo Bank (credit line), 2022', extract: [{ fact: 'registration', re: 'Charge (ON 3301122)' }] },
      ],
      factDefs: [{ key: 'registration', label: 'Registration the statement covers', required: true }],
      drafts: { STATEMENT_REG_MISMATCH: { cta: 'Request corrected statement', to: 'team', team: 'statements', kind: 'correction', question: 'Request PR-77311 asks to discharge ON 3301122; statement v1 names ON 3307740 (the 2022 credit line). Please issue a corrected statement for ON 3301122, or confirm both charges are in scope.', why: 'A statement for the wrong charge could leave a registration in place after payout.', requested: ['Corrected statement'] } },
      available: [
        { id: 'v2', label: 'Payout statement v2 for ON 3301122', teams: ['statements'], correction: true, supersedes: ['stmt'],
          evidence: { label: 'Payout statement v2', system: 'Payout statements', origin: 'statement', kind: 'record', loc: 'Statement v2 · security line', facts: { registration: 'ON 3301122' } },
          patch: [{ path: 'statement.registrations', value: ['ON 3301122'], label: 'Statement registration' }, { path: 'statement.v', value: 2, label: 'Statement version' }] },
      ],
    },
    {
      key: 'ms:ML-42207', title: '18 Spruce Way · discharge request cancelled', branch: 'sale', branchLabel: 'Sale', owner: 'ava',
      openedBecause: 'Cancellation asked while a wire is in transit', amount: 402100, amountLabel: 'Wire in transit', due: '2026-11-05T15:00:00Z', dueLabel: 'Wire expected', affects: 'confirming the cancellation',
      records: {
        rule: `${ON}|Sale`, closing: { original: '2026-11-04', latest: '2026-11-04' },
        loans: [{ no: 'ML-42207', balance: 402100, perDiem: 66.1 }], request: { status: 'cancel-requested', registrations: ['ON 2550918'], cancelAsked: '2026-11-03' },
        statement: { v: 1, basis: '2026-11-04', validUntil: '2026-11-04', amount: 402100, registrations: ['ON 2550918'], prepay: 0 },
        funds: [{ id: 'W-88710', amount: 402100, sent: '2026-11-03', bank: null, posted: null }], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'cancel', label: 'Email: deal collapsed, cancel the payout', system: 'Servicing inbox', origin: 'lawyer', kind: 'document', recorded: '2026-11-03T17:05:00Z', text: 'From: Ito Law (fictional)\nRe: ML-42207\nThe sale has collapsed. Please cancel our payout request. Note our wire W-88710 went out this morning.', extract: [{ fact: 'wire_ref', re: 'wire (W-\\d+)' }] },
        { id: 'sent', label: 'Wire confirmation W-88710 (sender copy)', system: 'Servicing inbox', origin: 'lawyer', kind: 'document', recorded: '2026-11-03T10:15:00Z', text: 'Outgoing wire W-88710 (synthetic)\nAmount: 402,100.00\nSent: 2026-11-03', extract: [{ fact: 'wire_ref', re: 'wire (W-\\d+)' }] },
      ],
      factDefs: [{ key: 'bank', label: 'Wire received or returned', required: true, who: 'payments', checked: 'Incoming wires to date' }],
      drafts: { CANCEL_OPEN_ITEMS: { cta: 'Ask Payments to locate the wire', to: 'team', team: 'payments', kind: 'verify', question: 'The payout for ML-42207 is being cancelled but wire W-88710 (402,100.00) was sent on 3 Nov. Has it arrived? If so, please hold it for return and confirm.', why: 'The cancellation cannot be confirmed while money may land on the loan.', requested: ['Wire status'] } },
      available: [
        { id: 'ret', label: 'W-88710 received and returned to sender', teams: ['payments'],
          evidence: { label: 'Wire log W-88710 · returned', system: 'Payments · incoming wires', origin: 'bank-wire', kind: 'record', loc: 'W-88710 · received 4 Nov 10:02 · returned RT-901', facts: { bank: 'received 4 Nov, returned RT-901' } },
          patch: [{ path: 'funds.0.bank', value: '2026-11-04T10:02', label: 'Bank received' }, { path: 'funds.0.returned', value: 'RT-901', label: 'Returned' }] },
      ],
    },
    {
      key: 'ms:ML-35020', title: '40 Oak St · internal refinance', branch: 'internal-refi', branchLabel: 'Internal refinance', owner: 'grace',
      openedBecause: 'New loan funded; old loan still open', amount: 210450, amountLabel: 'Old loan', due: '2026-11-06T20:00:00Z', dueLabel: 'First payment on new loan', affects: 'closing the old loan',
      records: {
        rule: `${ON}|Internal refinance`, closing: { original: '2026-11-01', latest: '2026-11-01' },
        loans: [{ no: 'ML-35020', balance: 210450, role: 'old' }, { no: 'ML-51220', balance: 260000, role: 'new', funded: '2026-11-01' }], request: { status: 'active', registrations: ['ON 1650092'] },
        refi: { transfer: null, charge: 'keep and amend' }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'new', label: 'Loan ML-51220 (new)', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: '2026-11-01T12:00:00Z', loc: 'Funded 1 Nov', facts: { new_funded: '2026-11-01' } },
        { id: 'old', label: 'Loan ML-35020 (old)', system: 'Loan servicing system', origin: 'loan-system', kind: 'record', recorded: '2026-11-04T08:00:00Z', loc: 'Status · open · balance', facts: { old_balance: 210450 } },
        { id: 'instr', label: 'Refinance instruction', system: 'Credit file', origin: 'credit', kind: 'record', recorded: '2026-10-25T10:00:00Z', loc: 'Charge ON 1650092: keep and amend', facts: { charge: 'keep and amend' } },
      ],
      factDefs: [{ key: 'transfer', label: 'Internal settlement transfer', required: true, who: 'payments', checked: 'Internal transfers to date' }],
      drafts: { REFI_NOT_LINKED: { cta: 'Request transfer record', to: 'team', team: 'payments', kind: 'verify', question: 'ML-51220 funded on 1 Nov to refinance ML-35020, but no internal transfer to the old loan is recorded. Please confirm the transfer and attach it.', why: 'No external funds or payout statement apply here; the internal transfer is the settlement evidence.', requested: ['Internal transfer record'] } },
      available: [
        { id: 'xfer', label: 'Internal transfer IT-4410 to ML-35020', teams: ['payments'],
          evidence: { label: 'Internal transfer IT-4410', system: 'Payments · internal transfers', origin: 'bank-wire', kind: 'record', loc: 'IT-4410 · 1 Nov', facts: { transfer: 'IT-4410 · 210,450.00 · 1 Nov', old_balance: 0 } },
          patch: [{ path: 'refi.transfer', value: 'IT-4410', label: 'Transfer' }, { path: 'loans.0.balance', value: 0, label: 'Old loan balance' }], supersedes: ['old'] },
      ],
    },
    {
      key: 'ms:ML-31877', title: '3 Maple Row · transfer to a new lender', branch: 'assignment', branchLabel: 'Assignment', owner: 'ava',
      openedBecause: 'Assignment asked; discharge prepared', amount: 274300, amountLabel: 'Balance', due: '2026-11-10T20:00:00Z', dueLabel: 'Transfer date', affects: 'releasing documents',
      records: {
        rule: `${ON}|Assignment`, closing: { original: '2026-11-10', latest: '2026-11-10' },
        loans: [{ no: 'ML-31877', balance: 274300 }], request: { status: 'active', registrations: ['ON 2066450'] },
        instructions: { type: 'assignment', to: 'Harbourline Credit Union (fictional)' }, docs: { prepared: 'discharge' }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'instr', label: 'Instruction from the new lender', system: 'Servicing inbox', origin: 'new-lender', kind: 'document', recorded: '2026-11-02T10:00:00Z', text: 'Harbourline Credit Union (fictional)\nPlease prepare an assignment of charge ON 2066450 in our favour on payout.', extract: [{ fact: 'doc_type', re: 'prepare an (assignment)' }] },
        { id: 'docs', label: 'Prepared documents', system: 'Discharge and registration', origin: 'registration', kind: 'record', recorded: '2026-11-03T15:00:00Z', loc: 'Package DP-2290 · document type', facts: { doc_type: 'discharge' } },
      ],
      factDefs: [{ key: 'doc_type', label: 'Document the deal needs', required: true }],
      drafts: { DOC_TYPE_MISMATCH: { cta: 'Request assignment package', to: 'team', team: 'registration', kind: 'correction', question: 'The new lender asked for an assignment of ON 2066450, but package DP-2290 is a discharge. Please prepare the assignment or confirm the instruction changed.', why: 'Releasing a discharge would remove the charge the new lender expects to take over.', requested: ['Assignment package'] } },
      available: [
        { id: 'asg', label: 'Assignment package DP-2291', teams: ['registration'], correction: true, supersedes: ['docs'],
          evidence: { label: 'Prepared documents v2', system: 'Discharge and registration', origin: 'registration', kind: 'record', loc: 'Package DP-2291 · document type', facts: { doc_type: 'assignment' } },
          patch: [{ path: 'docs.prepared', value: 'assignment', label: 'Prepared document' }] },
      ],
    },
    {
      key: 'ms:RM-10044', title: '12 Elm Pl · reverse mortgage, estate', branch: 'reverse', branchLabel: 'Reverse mortgage', owner: 'grace',
      openedBecause: 'Repayment asked by an estate', amount: 168900, amountLabel: 'Balance', due: '2026-11-18T20:00:00Z', dueLabel: 'Estate deadline (as stated)', affects: 'issuing a repayment statement',
      records: {
        rule: 'Demo Bank|ON|Reverse|Estate', closing: { original: null, latest: null }, loans: [{ no: 'RM-10044', balance: 168900 }],
        request: { status: 'active', registrations: ['ON 1440071'], from: 'executor' },
        reverse: { trigger: 'death of the borrower', contract: 'RM agreement 2017', authority: { probate: false, id: true } }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [{ id: 'req', label: 'Request from the executor', system: 'Servicing inbox', origin: 'executor', kind: 'document', recorded: '2026-11-01T10:00:00Z', text: 'From: estate executor (fictional)\nMy father passed away on 12 Oct. As executor I ask for the amount to repay his reverse mortgage. Certificate of appointment to follow.', extract: [{ fact: 'trigger', re: '(passed away) on' }] }],
      factDefs: [{ key: 'authority', label: "Executor's authority (certificate of appointment)", required: true, who: 'servicing', checked: 'Request email, file' }],
      available: [{ id: 'cert', label: 'Certificate of appointment of estate trustee', teams: ['servicing'], evidence: { label: 'Certificate of appointment (copy)', system: 'Servicing inbox', origin: 'court', kind: 'record', loc: 'Certificate · 28 Oct', facts: { authority: 'appointed 28 Oct' } }, patch: [{ path: 'reverse.authority.probate', value: true, label: 'Authority on file' }] }],
    },
    {
      key: 'ms:CL-7001', title: 'Harbour Holdings · partial release', branch: 'commercial', branchLabel: 'Commercial partial release', owner: 'grace',
      openedBecause: 'Release scope differs between instruction and statement', amount: 1240000, amountLabel: 'Release price', due: '2026-11-12T20:00:00Z', dueLabel: 'Sale of 12 Main', affects: 'releasing 12 Main St',
      records: {
        rule: 'Demo Bank|ON|Commercial|Partial release', closing: { original: '2026-11-12', latest: '2026-11-12' },
        loans: [{ no: 'CL-7001', balance: 3850000 }, { no: 'CL-7002', balance: 920000 }], request: { status: 'active', registrations: ['ON 5100231'] },
        release: { instructed: ['12 Main St'], statement: ['12 Main St', '14 Main St', '3 Dock Rd'], keep: ['14 Main St', '3 Dock Rd'] }, funds: [], settlement: null, adjustments: [],
      },
      evidence: [
        { id: 'credit', label: 'Credit approval CA-881', system: 'Commercial credit', origin: 'credit', kind: 'record', recorded: '2026-10-20T10:00:00Z', loc: 'Release 12 Main St at 1,240,000; keep 14 Main and 3 Dock', facts: { scope: '12 Main St' } },
        { id: 'stmt', label: 'Partial release statement v1', system: 'Payout statements', origin: 'statement', kind: 'record', recorded: '2026-11-03T10:00:00Z', loc: 'Properties released', facts: { scope: '12 Main St, 14 Main St, 3 Dock Rd' } },
      ],
      factDefs: [{ key: 'scope', label: 'Properties released', required: true }],
      drafts: { SCOPE_MISMATCH: { cta: 'Request scope decision', to: 'person', person: 'daniel', requires: 'mortgage.resume', kind: 'verify', question: 'Credit approval CA-881 releases only 12 Main St; release statement v1 lists all three properties. Please confirm the scope before anything is sent.', why: 'A full release would discharge security the bank means to keep.', requested: ['Scope decision'] } },
      available: [{ id: 'v2', label: 'Release statement v2: 12 Main St only', teams: ['statements'], correction: true, supersedes: ['stmt'], evidence: { label: 'Partial release statement v2', system: 'Payout statements', origin: 'statement', kind: 'record', loc: 'Properties released', facts: { scope: '12 Main St' } }, patch: [{ path: 'release.statement', value: ['12 Main St'], label: 'Statement scope' }] }],
    },
  ];

  // ---------- merchant payouts: a small online store's processor payouts against its bank account ----------
  // Fernleaf Ceramics is fictional. The payout report is shaped like a typical processor payout summary:
  // charges, refunds, adjustments, reserve, fees, and the total sent to the bank. No real provider's data.
  const pay = (o) => ({ currency: 'CAD', status: 'paid', refunds: 0, adjustments: [], reserve: 0, ...o });
  const payouts = [
    {
      key: 'po:PO-1028', title: 'Payout PO-1028 · 28 Oct', owner: 'sam', branch: 'payout', branchLabel: 'Payout',
      openedBecause: 'Bank deposit differs from the payout total', amount: 4888.04, amountLabel: 'Payout', due: '2026-11-06T22:00:00Z', dueLabel: 'October books close', affects: 'recording October sales in the books',
      records: { payout: pay({ id: 'PO-1028', date: '2026-10-28', charges: 5240.0, refunds: -180.0, fees: -171.96, total: 4888.04, orders: 41 }), deposits: [{ date: '2026-10-30', desc: 'PROCESSOR PAYOUT PO-1028', amount: 4588.04 }], arrival: '2026-10-30' },
      evidence: [
        { id: 'rep', label: 'Payout report PO-1028 (summary)', system: 'Processor dashboard · payout summary', origin: 'processor', kind: 'record', recorded: '2026-10-28T09:00:00Z', loc: 'Summary row · total', facts: { payout_total: 4888.04 } },
        { id: 'bank', label: 'Bank deposit 30 Oct', system: 'Store bank account', origin: 'bank', kind: 'record', recorded: '2026-10-30T12:00:00Z', loc: 'Statement line · PROCESSOR PAYOUT PO-1028', facts: { deposit: 4588.04 } },
      ],
      factDefs: [{ key: 'payout_total', label: 'Payout total' }, { key: 'deposit', label: 'Bank deposit' }, { key: 'adjustments', label: 'Adjustments in the payout', required: true, who: 'store', checked: 'Payout summary, bank statement' }],
      drafts: { DEPOSIT_DIFFERS: { cta: 'Request payout detail', to: 'person', person: 'kai', kind: 'evidence', question: 'PO-1028 says 4,888.04 but the bank received 4,588.04. Can you export the payout’s transactions from the payments dashboard so we can see the 300.00?', why: 'The books cannot record October sales until the payout ties to the bank.', requested: ['Payout transactions export'] } },
      available: [{ id: 'txns', label: 'Payout transactions export PO-1028', teams: ['store'], correction: true, supersedes: ['rep'],
        evidence: { label: 'Payout transactions PO-1028', system: 'Processor dashboard · payout transactions', origin: 'processor', kind: 'record', loc: 'Rows 1–44 · adjustment CB-5521', facts: { payout_total: 4588.04, adjustments: 'Chargeback CB-5521 −300.00 (dispute DP-881)' } },
        patch: [{ path: 'payout.adjustments.0', value: { type: 'chargeback', ref: 'CB-5521', dispute: 'DP-881', amount: -300, due: '2026-11-09' }, label: 'Adjustment' }, { path: 'payout.total', value: 4588.04, label: 'Payout total' }] }],
    },
    {
      key: 'po:PO-1030', title: 'Payout PO-1030 · 30 Oct', owner: 'sam', branch: 'payout', branchLabel: 'Payout',
      openedBecause: 'Payout marked paid; no bank deposit yet', amount: 2311.4, amountLabel: 'Payout', due: '2026-11-06T22:00:00Z', dueLabel: 'October books close', affects: 'recording October sales in the books',
      records: { payout: pay({ id: 'PO-1030', date: '2026-10-30', charges: 2402.0, fees: -90.6, total: 2311.4, orders: 18 }), deposits: [], arrival: '2026-11-03' },
      evidence: [{ id: 'rep', label: 'Payout report PO-1030', system: 'Processor dashboard · payout summary', origin: 'processor', kind: 'record', recorded: '2026-10-30T09:00:00Z', loc: 'Status paid · expected 3 Nov', facts: { payout_total: 2311.4 } }],
      factDefs: [{ key: 'payout_total', label: 'Payout total' }, { key: 'deposit', label: 'Bank deposit', required: true, who: 'store', checked: 'Bank statement to 4 Nov' }],
      drafts: { DEPOSIT_MISSING: { cta: 'Ask the store to check the bank', to: 'team', team: 'store', kind: 'evidence', question: 'PO-1030 (2,311.40) was marked paid on 30 Oct and expected by 3 Nov, but no deposit shows on the statement. Can someone check the bank account and the payout account details?', why: 'Money marked paid but not received may be a bank delay or the wrong account.', requested: ['Bank statement or account details'] } },
      inbox: [{ id: 'stmt', label: 'Bank statement update to 4 Nov', touches: ['deposit'],
        evidence: { label: 'Bank deposit 4 Nov', system: 'Store bank account', origin: 'bank', kind: 'record', loc: 'Statement line · PAYOUT 1030 (held by bank one day)', facts: { deposit: 2311.4 } },
        patch: [{ path: 'deposits.0', value: { date: '2026-11-04', desc: 'PAYOUT 1030', amount: 2311.4 }, label: 'Bank deposit' }] }],
    },
    {
      key: 'po:PO-1101', title: 'Payout PO-1101 · 1 Nov', owner: 'sam', branch: 'payout', branchLabel: 'Payout',
      openedBecause: 'Part of the sales held back as a reserve', amount: 6125.0, amountLabel: 'Sales', due: '2026-11-06T22:00:00Z', dueLabel: 'October books close', affects: 'cash planning for November',
      records: { payout: pay({ id: 'PO-1101', date: '2026-11-01', charges: 6125.0, reserve: -612.5, fees: -201.93, total: 5310.57, orders: 21 }), deposits: [{ date: '2026-11-03', desc: 'PROCESSOR PAYOUT PO-1101', amount: 5310.57 }], arrival: '2026-11-03' },
      evidence: [
        { id: 'rep', label: 'Payout report PO-1101', system: 'Processor dashboard · payout summary', origin: 'processor', kind: 'record', recorded: '2026-11-01T09:00:00Z', loc: 'Reserve line', facts: { payout_total: 5310.57, reserve: '10% rolling reserve, 612.50 held' } },
        { id: 'bank', label: 'Bank deposit 3 Nov', system: 'Store bank account', origin: 'bank', kind: 'record', recorded: '2026-11-03T12:00:00Z', loc: 'Statement line', facts: { deposit: 5310.57 } },
      ],
      factDefs: [{ key: 'reserve', label: 'Reserve held' }, { key: 'reserve_release', label: 'When the reserve is released', required: true, who: 'support', checked: 'Payout summary, account settings' }],
      drafts: { RESERVE_HELD: { cta: 'Ask support when it is released', to: 'team', team: 'support', kind: 'verify', question: 'PO-1101 held 612.50 as a 10% rolling reserve. When will it be released, and why was the reserve applied to this account?', why: 'The store plans November cash on the full amount.', requested: ['Release date and reason'] } },
      available: [{ id: 'rel', label: 'Reserve notice: release 1 Dec', teams: ['support'],
        evidence: { label: 'Reserve notice RS-207', system: 'Processor support (simulated)', origin: 'processor-support', kind: 'document', text: 'Reserve RS-207 (synthetic)\nReason: sales volume up 3x in October\nReserve: 10% rolling\nRelease date: 2026-12-01', extract: [{ fact: 'reserve_release', re: 'Release date: (\\d{4}-\\d{2}-\\d{2})' }] },
        patch: [{ path: 'reserveRelease', value: '2026-12-01', label: 'Reserve release' }] }],
    },
    {
      key: 'po:PO-1102', title: 'Payout PO-1102 · 2 Nov', owner: 'sam', branch: 'payout', branchLabel: 'Payout',
      openedBecause: 'Fees above the agreed rate', amount: 1980.0, amountLabel: 'Sales', due: '2026-11-06T22:00:00Z', dueLabel: 'October books close', affects: 'recording fees in the books',
      records: { payout: pay({ id: 'PO-1102', date: '2026-11-02', charges: 1980.0, fees: -87.12, total: 1892.88, orders: 12, usdOrders: 7 }), deposits: [{ date: '2026-11-04', desc: 'PROCESSOR PAYOUT PO-1102', amount: 1892.88 }], arrival: '2026-11-04', rate: { pct: 0.029, fixed: 0.3 } },
      evidence: [
        { id: 'rep', label: 'Payout report PO-1102', system: 'Processor dashboard · payout summary', origin: 'processor', kind: 'record', recorded: '2026-11-02T09:00:00Z', loc: 'Fees line', facts: { fees: 87.12, payout_total: 1892.88 } },
        { id: 'plan', label: 'Plan: 2.9% + 0.30 per order', system: 'Store account settings', origin: 'plan', kind: 'record', recorded: '2026-01-15T09:00:00Z', loc: 'Billing · payment rates', facts: { fees: 61.02 } },
      ],
      factDefs: [{ key: 'fees', label: 'Fees' }, { key: 'fee_reason', label: 'Why the fees differ', required: true, who: 'support', checked: 'Payout summary, plan' }],
      drafts: { FEE_ABOVE_RATE: { cta: 'Ask support about the fees', to: 'team', team: 'support', kind: 'verify', question: 'PO-1102 charged 87.12 in fees; our plan (2.9% + 0.30) gives 61.02 for 12 orders. Seven orders were in USD. Is the difference currency conversion, and at what rate?', why: 'The books need the right fee split, and an overcharge would need a refund.', requested: ['Fee breakdown'] } },
      available: [{ id: 'fx', label: 'Fee breakdown: currency conversion on 7 USD orders', teams: ['support'],
        evidence: { label: 'Fee breakdown PO-1102', system: 'Processor support (simulated)', origin: 'processor-support', kind: 'record', loc: 'Processing 61.02 · currency conversion 26.10 (1.5% on 1,740.00 USD)', facts: { fees: 87.12, fee_reason: 'Currency conversion 26.10 on USD orders' } },
        patch: [{ path: 'feeExplained', value: 'Currency conversion 26.10', label: 'Fee explanation' }] }],
    },
    {
      key: 'po:PO-1103', title: 'Payout PO-1103 · 3 Nov', owner: 'sam', branch: 'payout', branchLabel: 'Payout',
      openedBecause: 'The payout report does not add up', amount: 3120.0, amountLabel: 'Sales', due: '2026-11-06T22:00:00Z', dueLabel: 'October books close', affects: 'recording October sales in the books',
      records: { payout: pay({ id: 'PO-1103', date: '2026-11-03', charges: 3120.0, refunds: -245.0, fees: -102.48, total: 2527.52, orders: 25 }), deposits: [{ date: '2026-11-04', desc: 'PROCESSOR PAYOUT PO-1103', amount: 2527.52 }], arrival: '2026-11-04' },
      evidence: [
        { id: 'rep', label: 'Payout report PO-1103', system: 'Processor dashboard · payout summary', origin: 'processor', kind: 'record', recorded: '2026-11-03T09:00:00Z', loc: 'Charges 3,120.00 · refunds −245.00 · fees −102.48 · total 2,527.52', facts: { payout_total: 2527.52, refunds: 245 } },
        { id: 'csv', label: 'Store refunds export (CSV)', system: 'Store admin · refunds', origin: 'store-admin', kind: 'record', recorded: '2026-11-03T18:00:00Z', loc: 'Two refunds of 245.00, order #4471, 2 Nov 09:14 and 09:15', facts: { refunds: 490 } },
      ],
      factDefs: [{ key: 'refunds', label: 'Refunds in the payout' }, { key: 'payout_total', label: 'Payout total' }],
      drafts: { COMPOSITION_BREAK: { cta: 'Ask the store about order #4471', to: 'person', person: 'kai', kind: 'verify', question: 'Order #4471 shows two refunds of 245.00 one minute apart, and PO-1103 is 245.00 short of its own lines. Was the customer refunded twice?', why: 'A double refund is money the store needs to recover.', requested: ['Refund history for #4471'] } },
      available: [{ id: 'dbl', label: 'Refund history #4471: refunded twice by mistake', teams: ['store'],
        evidence: { label: 'Refund history #4471', system: 'Store admin · order #4471', origin: 'store-admin', kind: 'record', loc: 'Refund 1 09:14 (customer request) · refund 2 09:15 (duplicate click)', facts: { refunds: 490 } },
        patch: [{ path: 'payout.refunds', value: -490, label: 'Refunds in the payout' }, { path: 'doubleRefund', value: '#4471', label: 'Duplicate refund' }] }],
    },
  ];

  // the store owner's view of the same payouts: one person, plain language.
  // `found` is only what the records say; `maybe` is a possible reason, marked as not confirmed until `check` reads the source.
  const storeView = {
    store: 'Fernleaf Ceramics', owner: 'Jada Brooks',
    payouts: {
      'PO-1028': {
        headAfter: "Payout PO-1028 was $300.00 lower because of a chargeback",
        cause: "A chargeback or another adjustment may explain the $300.00.", next: "Find the $300.00 line in the payout’s transactions.", nextAfter: "Review the dispute and decide whether to respond.",
        chip: '$300.00 short', chipAfter: 'Chargeback · respond by 9 Nov', tone: 'neg',
        head: 'Your bank got $300.00 less than payout PO-1028',
        found: 'The payout summary says $4,888.04. Your bank received $4,588.04 on 30 Oct.',
        maybe: 'The bank amount implies a deduction the summary row does not show. That is usually a chargeback on an earlier order, which comes out of a later payout, or another adjustment. The payout’s transaction list would show it.',
        check: 'Read the payout’s transactions', reveal: 'available:txns',
        after: 'The transaction list has a chargeback: CB-5521, −$300.00, on dispute DP-881. A customer asked their card issuer to reverse a payment.',
        todo: 'Open the payout’s transaction list and look for a $300.00 line. Until you know what it is, the October books cannot be closed.',
        todoAfter: 'Decide whether to fight the dispute. If you have proof of delivery, submit it before the deadline; if not, accept the loss. Then record the payout with the chargeback as its own line.',
        deadline: '2026-11-09', deadlineLabel: 'Dispute evidence due',
      },
      'PO-1030': {
        headAfter: "Payout PO-1030 arrived on 4 Nov, a day late",
        cause: "The bank may be holding the deposit, or it went to an old bank account.", next: "Wait one business day, then check the payout bank account.", nextAfter: "Nothing to do. Record it as arrived 4 Nov.",
        chip: 'Not in your bank yet', chipAfter: 'Arrived 4 Nov, a day late', tone: 'warn',
        head: 'Payout PO-1030 ($2,311.40) is marked paid but has not reached your bank',
        found: 'The payout was sent on 30 Oct and expected by 3 Nov. Your bank statement shows no deposit for it.',
        maybe: 'Banks sometimes hold a deposit for a day. If it still does not arrive, the payout may have gone to an old bank account.',
        check: 'Refresh the bank statement', reveal: 'inbox:stmt',
        after: 'It arrived on 4 Nov for the full $2,311.40. The bank held it for one day.',
        todo: 'Wait one more business day. If it is still missing, check that the bank account on file for payouts is the current one.',
        todoAfter: 'Nothing is missing. Record it with the 4 Nov arrival date.',
      },
      'PO-1101': {
        headAfter: "$612.50 is held as a reserve until 1 Dec",
        cause: "A rolling reserve. The summary does not say when it comes back.", next: "Plan November cash on $5,310.57.", nextAfter: "Plan on $5,310.57. The $612.50 comes back 1 Dec.",
        chip: '$612.50 held back', chipAfter: 'Released 1 Dec', tone: 'warn',
        head: '$612.50 of your 1 Nov sales was held back as a reserve',
        found: 'Your bank received $5,310.57, the full payout. The payout summary shows $612.50 held as a 10% rolling reserve.',
        maybe: 'Processors hold a reserve when sales change quickly, to cover possible refunds and chargebacks. When it comes back is not on the summary.',
        check: 'Read the reserve notice', reveal: 'available:rel',
        after: 'The notice says the reserve was applied because October sales were three times the usual, and it is released on 1 Dec.',
        todo: 'Plan November cash on $5,310.57, not the $5,923.07 you sold.',
        todoAfter: 'Plan November cash on $5,310.57. Expect the $612.50 back on 1 Dec.',
      },
      'PO-1102': {
        headAfter: "The extra $26.10 on PO-1102 is a currency conversion fee",
        cause: "Probably a currency conversion fee on US dollar orders. It may also be an overcharge.", next: "Hold the extra $26.10 until you know what it is.", nextAfter: "Book $26.10 as currency conversion.",
        chip: 'Fees $26.10 above your plan', chipAfter: 'Currency conversion, not an error', tone: 'warn',
        head: 'Fees on payout PO-1102 are $26.10 more than your plan',
        found: 'Your plan is 2.9% + $0.30 per order, which comes to $61.02 for these 12 orders. The payout charged $87.12. Seven of the orders were paid in US dollars.',
        maybe: 'The extra may be a currency conversion fee on the US dollar orders. It may also be an overcharge.',
        check: 'Read the fee breakdown', reveal: 'available:fx', feeNote: 'includes $26.10 currency conversion',
        after: 'The breakdown shows $61.02 processing plus $26.10 currency conversion (1.5% on $1,740.00 USD). No overcharge.',
        todo: 'Do not book the extra as a processing fee until you know what it is.',
        todoAfter: 'Book $26.10 as currency conversion. If US sales keep growing, compare the cost of pricing in USD.',
      },
      'PO-1103': {
        headAfter: "Order #4471 was refunded twice, so PO-1103 is $245.00 lower",
        cause: "Order #4471 may have been refunded twice.", next: "Check order #4471 before recording the payout.", nextAfter: "Contact the customer to recover the second $245.00.",
        chip: 'Report off by $245.00', chipAfter: 'Order #4471 refunded twice', tone: 'neg',
        head: 'Payout PO-1103 is $245.00 less than its own lines add up to',
        found: 'Sales $3,120.00, refunds −$245.00 and fees −$102.48 add up to $2,772.52, but the payout is $2,527.52. Your refunds export shows two refunds of $245.00 on order #4471, one minute apart.',
        maybe: 'The customer may have been refunded twice.',
        check: 'Read the refund history for #4471', reveal: 'available:dbl',
        after: 'The order history shows the second refund was a duplicate click, one minute after the first.',
        todo: 'Check order #4471 before recording the payout.',
        todoAfter: 'Contact the customer to recover the second $245.00, then record the payout with both refunds.',
      },
    },
  };

  return { dir: { teams, people }, close, cash, payroll, mortgage, payouts, rules, storeView };
})();
