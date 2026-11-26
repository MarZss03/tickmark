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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = [];
  for (const d of DOCS) {
    const html = join(tmpdir(), `tm-doc-${d.id}.html`);
    writeFileSync(html, page(d));
    const png = join(OUT, `${d.id}.png`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=860,' + (220 + d.lines.length * 32 + 140), `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
    manifest.push({ id: d.id, docType: d.docType, label: d.label, image: `assets/docs/${d.id}.png`, text: textOf(d), truth: d.truth });
    console.log('wrote', png);
  }
  writeFileSync(join(OUT, 'docs.json'), JSON.stringify(manifest, null, 2));
  console.log('wrote', join(OUT, 'docs.json'));
}
