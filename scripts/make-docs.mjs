// Renders the synthetic finance documents used by Tickmark Hybrid as PNG "scans" (and keeps their text),
// with headless Chrome. Every person, account, firm and number is invented.
// Run: node scripts/make-docs.mjs   (writes assets/docs/*.png and assets/docs/docs.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const OUT = resolve('assets/docs');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Each document: what a person would actually receive, with the customer details a bank must protect.
export const DOCS = [
  {
    id: 'wire-W-88213', docType: 'wire_confirmation', label: 'Incoming wire confirmation W-88213 (scan)',
    bank: 'NORTHSHORE TRUST BANK', title: 'INCOMING WIRE CONFIRMATION',
    lines: [
      ['Wire reference', 'W-88213'],
      ['Received', '2026-10-30 14:02 ET'],
      ['Amount', 'CAD 412,880.00'],
      ['Ordering customer', 'Okafor Law in trust for Priya Raman'],
      ['Ordering account', '00412-7781-554210'],
      ['Beneficiary', 'Demo Bank Mortgage Servicing'],
      ['Beneficiary account', '00219-4410-118734'],
      ['Payment details', 'Payout ML-40311, 14 Birchwood Cres, Toronto ON M4C 2K7'],
      ['Status', 'HELD FOR REVIEW'],
      ['Hold placed', '2026-10-30 14:05 ET (HLD-7720, compliance review)'],
      ['Hold released', '2026-11-02 09:40 ET'],
      ['Credited to beneficiary', '2026-11-02 09:41 ET'],
    ],
    footer: 'Contact: wire.desk@northshore-trust.example  ·  1-800-555-0144  ·  This confirmation is computer generated.',
    truth: { amount: 412880, currency: 'CAD', wire_reference: 'W-88213', received_at: '2026-10-30 14:02', hold_placed_at: '2026-10-30 14:05', hold_released_at: '2026-11-02 09:40' },
  },
  {
    id: 'wire-W-88540', docType: 'wire_confirmation', label: 'Incoming wire confirmation W-88540 (scan)',
    bank: 'LAKEPORT CREDIT UNION', title: 'WIRE RECEIPT ADVICE',
    lines: [
      ['Reference', 'W-88540'],
      ['Date and time received', '2026-11-03 09:12 ET'],
      ['Amount received', 'CAD 289,400.00'],
      ['Sender', 'Haldane & Co. LLP trust account, for Marcus and Elena Whitfield'],
      ['Sender account', '33018-2204-907713'],
      ['Receiver', 'Demo Bank Mortgage Servicing'],
      ['Receiver account', '00219-4410-118734'],
      ['Memo', 'ML-38774 payout, 7 Lakeshore Rd, Mississauga ON L5H 1G3'],
      ['Status', 'COMPLETED, no hold'],
    ],
    footer: 'Questions: payments@lakeport-cu.example  ·  (905) 555-0177',
    truth: { amount: 289400, currency: 'CAD', wire_reference: 'W-88540', received_at: '2026-11-03 09:12', hold_placed_at: '', hold_released_at: '' },
  },
  // ---------- evaluation set: more wire confirmations, varied layouts, date and time formats ----------
  ...[
    ['W-90117', 'HARBOURVIEW SAVINGS', 'WIRE TRANSFER RECEIVED', 'November 4, 2026 at 9:31 AM', 'CAD 156,204.88', 'Mendes & Park LLP in trust for Lucas Ferreira', 'ML-41022, 23 Oakridge Dr, Ottawa ON K2G 4P1', null, null,
      { amount: 156204.88, currency: 'CAD', wire_reference: 'W-90117', received_at: '2026-11-04 09:31', hold_placed_at: '', hold_released_at: '' }],
    ['W-90254', 'NORTHSHORE TRUST BANK', 'INCOMING WIRE CONFIRMATION', '2026-11-04 15:48 ET', 'CAD 98,750.00', 'Quill Legal Professional Corp. for Aisha Rahman', 'Payout ML-39871, 5 Pine Hollow Rd, Barrie ON L4N 7T2', '2026-11-04 15:52 ET (HLD-7801, sanctions screening)', '2026-11-05 10:15 ET',
      { amount: 98750, currency: 'CAD', wire_reference: 'W-90254', received_at: '2026-11-04 15:48', hold_placed_at: '2026-11-04 15:52', hold_released_at: '2026-11-05 10:15' }],
    ['W-90388', 'LAKEPORT CREDIT UNION', 'WIRE RECEIPT ADVICE', '5 Nov 2026, 2:15 p.m. ET', 'CAD 341,000.00', 'Chen Bellamy LLP trust account, for Grace and Wen Chen', 'ML-40990 payout, 88 Bayview Ave, Toronto ON M4G 3B7', null, null,
      { amount: 341000, currency: 'CAD', wire_reference: 'W-90388', received_at: '2026-11-05 14:15', hold_placed_at: '', hold_released_at: '' }],
    ['W-90412', 'FIRST MARITIME BANK', 'INBOUND WIRE NOTICE', '2026-11-06 08:05 ET', 'USD 47,320.15', 'Delacroix Law for Marie-Claude Tremblay', 'Payout ML-38221, 410 Rue Notre-Dame, Gatineau QC J8X 3B1', '2026-11-06 08:07 ET (HLD-7844, foreign currency review)', '2026-11-09 11:30 ET',
      { amount: 47320.15, currency: 'USD', wire_reference: 'W-90412', received_at: '2026-11-06 08:05', hold_placed_at: '2026-11-06 08:07', hold_released_at: '2026-11-09 11:30' }],
    ['W-90533', 'HARBOURVIEW SAVINGS', 'WIRE TRANSFER RECEIVED', 'November 9, 2026 at 4:40 PM', 'CAD 612,450.00', 'Okafor Law in trust for Daniel and Ruth Abara', 'ML-42115, 1200 Lakeshore Blvd W, Toronto ON M6K 1G4', null, null,
      { amount: 612450, currency: 'CAD', wire_reference: 'W-90533', received_at: '2026-11-09 16:40', hold_placed_at: '', hold_released_at: '' }],
    ['W-90601', 'NORTHSHORE TRUST BANK', 'INCOMING WIRE CONFIRMATION', '2026-11-10 11:22 ET', 'CAD 205,118.42', 'Haldane & Co. LLP in trust for Sofia Rossi', 'Payout ML-40455, 17 Willow Way, Oakville ON L6J 2X9', '2026-11-10 11:24 ET (HLD-7902, large-value review)', '2026-11-10 16:05 ET',
      { amount: 205118.42, currency: 'CAD', wire_reference: 'W-90601', received_at: '2026-11-10 11:22', hold_placed_at: '2026-11-10 11:24', hold_released_at: '2026-11-10 16:05' }],
  ].map(([ref, bank, title, received, amount, sender, details, holdOn, holdOff, truth]) => ({
    id: `wire-${ref}`, docType: 'wire_confirmation', label: `Wire confirmation ${ref} (scan)`, bank, title, eval: true,
    lines: [['Wire reference', ref], ['Received', received], ['Amount', amount], ['Ordering customer', sender], ['Ordering account', '0' + ref.slice(2) + '-4412-' + ref.slice(2) + '77'],
      ['Beneficiary', 'Demo Bank Mortgage Servicing'], ['Beneficiary account', '00219-4410-118734'], ['Payment details', details],
      ['Status', holdOn ? 'HELD FOR REVIEW' : 'COMPLETED'], ...(holdOn ? [['Hold placed', holdOn], ['Hold released', holdOff]] : [])],
    footer: 'Contact: wires@example-bank.example  ·  1-800-555-0199', truth,
  })),
  // ---------- evaluation set: payout statements ----------
  ...[
    ['ML-40311', 'October 24, 2026', 'October 30, 2026', '412,120.44', '718.38', '41.18', '0.00', '41.18', '412,880.00', 'Priya Raman', '14 Birchwood Cres, Toronto ON M4C 2K7'],
    ['ML-38774', '2026-10-22', '2026-10-30', '288,612.90', '737.10', '50.00', '0.00', '52.07', '289,400.00', 'Marcus and Elena Whitfield', '7 Lakeshore Rd, Mississauga ON L5H 1G3'],
    ['ML-41022', '28 Oct 2026', '4 Nov 2026', '155,880.12', '274.76', '50.00', '0.00', '23.11', '156,204.88', 'Lucas Ferreira', '23 Oakridge Dr, Ottawa ON K2G 4P1'],
    ['ML-39871', 'October 29, 2026', 'November 5, 2026', '94,210.55', '189.45', '50.00', '4,300.00', '14.02', '98,750.00', 'Aisha Rahman', '5 Pine Hollow Rd, Barrie ON L4N 7T2'],
    ['ML-40990', '2026-10-30', '2026-11-05', '339,980.00', '970.00', '50.00', '0.00', '48.50', '341,000.00', 'Grace and Wen Chen', '88 Bayview Ave, Toronto ON M4G 3B7'],
    ['ML-42115', '2 Nov 2026', '9 Nov 2026', '598,712.33', '1,187.67', '50.00', '12,500.00', '86.40', '612,450.00', 'Daniel and Ruth Abara', '1200 Lakeshore Blvd W, Toronto ON M6K 1G4'],
    ['ML-40455', 'November 3, 2026', 'November 10, 2026', '204,301.20', '767.22', '50.00', '0.00', '29.87', '205,118.42', 'Sofia Rossi', '17 Willow Way, Oakville ON L6J 2X9'],
    ['ML-38221', '2026-10-30', '2026-11-06', '46,880.00', '390.15', '50.00', '0.00', '7.25', '47,320.15', 'Marie-Claude Tremblay', '410 Rue Notre-Dame, Gatineau QC J8X 3B1'],
  ].map(([loan, issued, goodTo, principal, interest, fee, penalty, perDiem, total, borrower, address]) => {
    const iso = (s) => { const d = new Date(/^\d{4}-/.test(s) ? s + 'T00:00:00Z' : s + ' UTC'); return d.toISOString().slice(0, 10); };
    const num = (s) => Number(s.replace(/,/g, ''));
    return {
      id: `stmt-${loan}`, docType: 'payout_statement', label: `Payout statement ${loan} (scan)`, bank: 'DEMO BANK MORTGAGE SERVICING', title: 'MORTGAGE PAYOUT STATEMENT', eval: true,
      lines: [['Mortgage number', loan], ['Borrower', borrower], ['Property', address], ['Statement date', issued], ['Good to', goodTo],
        ['Principal outstanding', principal], ['Interest to good-to date', interest], ['Discharge fee', fee], ['Prepayment charge', penalty], ['Total payout amount', total], ['Per diem after good-to date', perDiem]],
      footer: 'Payout figures are valid only to the good-to date. Questions: payouts@demobank.example  ·  (416) 555-0130',
      truth: { statement_date: iso(issued), good_to: iso(goodTo), principal: num(principal), interest: num(interest), prepayment_charge: num(penalty), total_payout: num(total), per_diem: num(perDiem) },
    };
  }),
];

export const textOf = (d) => [d.bank, d.title, '', ...d.lines.map(([k, v]) => `${k}: ${v}`), '', d.footer].join('\n');

const page = (d) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#d8d4cc}
  .sheet{width:760px;margin:24px auto;background:#fbfaf6;padding:44px 52px;font:15px/1.55 "Courier New",monospace;color:#1d1d1d;
    box-shadow:0 2px 10px rgba(0,0,0,.25);transform:rotate(-.6deg);filter:contrast(1.05) blur(.15px)}
  .bank{font:700 20px/1.2 Georgia,serif;letter-spacing:.06em;border-bottom:2px solid #1d1d1d;padding-bottom:8px}
  .title{font-weight:700;margin:18px 0 14px;letter-spacing:.08em}
  table{border-collapse:collapse;width:100%} td{padding:4px 0;vertical-align:top} td:first-child{width:230px;color:#444}
  .foot{margin-top:22px;border-top:1px dashed #888;padding-top:10px;font-size:12px;color:#555}
  .stamp{position:absolute;right:90px;top:120px;border:3px solid #9a2a2a;color:#9a2a2a;padding:4px 10px;font:700 16px Arial;transform:rotate(-12deg);opacity:.55}
  .wrap{position:relative}
</style><div class="wrap"><div class="sheet"><div class="bank">${d.bank}</div><div class="title">${d.title}</div>
<table>${d.lines.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
<div class="foot">${d.footer}</div></div>${/HELD/.test(textOf(d)) ? '<div class="stamp">HELD</div>' : ''}</div>`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = [];
  for (const d of DOCS) {
    const html = join(tmpdir(), `tm-doc-${d.id}.html`);
    writeFileSync(html, page(d));
    const png = join(OUT, `${d.id}.png`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=860,' + (220 + d.lines.length * 32 + 140), `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
    manifest.push({ id: d.id, docType: d.docType, label: d.label, image: `assets/docs/${d.id}.png`, text: textOf(d), truth: d.truth, eval: d.eval !== false });
    console.log('wrote', png);
  }
  writeFileSync(join(OUT, 'docs.json'), JSON.stringify(manifest, null, 2));
  console.log('wrote', join(OUT, 'docs.json'));
}
