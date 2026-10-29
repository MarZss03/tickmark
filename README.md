# Tickmark

[![Tests](https://github.com/MarZss03/tickmark/actions/workflows/test.yml/badge.svg)](https://github.com/MarZss03/tickmark/actions/workflows/test.yml)

Finance controls that show their work. A portfolio case study and working prototype for month-end close, payroll review and financial-model evaluation. It replaces the earlier "Run Replay" page.

Live: https://tickmark-one.vercel.app · Notes: https://tickmark-one.vercel.app/notes

A static site: open `index.html`, or run `node scripts/serve.mjs` and visit http://localhost:5173. It deploys to Vercel as-is, with no build step; every push to `main` redeploys.

## Use it on your own data

Open the workbench and choose **Your data** (or press Ctrl K / ⌘K and type "your data"). It runs the same rules as the sample, on your own CSV files, in a separate tab:

- **Payroll check:** an HRIS file and a payroll register (required), plus an equity vesting file (optional), for a pay period you choose.
- **Bank reconciliation:** a bank statement and the ledger cash account, matched on amount within a date window.

Files are read in your browser and saved only there (localStorage). Nothing is sent to a server. Decisions, the audit log and your files survive a reload; **Reset session** and **Remove my data** clear them. Every table exports to CSV.

| File | Columns (header row, any order; **bold** = required) |
| --- | --- |
| HRIS | **employee_id**, department, **status**, **hire_date**, termination_date, **currency** |
| Payroll register | **employee_id**, **gross**, prior_gross, **currency**, note, equity_value |
| Equity vesting | **employee_id**, **units**, **fmv** |
| Bank statement | **date**, description, **amount** |
| Ledger cash account | **date**, reference, **amount** |

Dates are . Amounts may use thousands separators, a currency sign, or accounting brackets for negatives (). Each upload box has a **Download a template** link with the sample rows in the right shape. Errors name the row and column, as a spreadsheet would.

## Rules

All rules live in  (no DOM; the page and the tests both load it).

| Rule | Fires when | Severity |
| --- | --- | --- |
| MISSING_EMPLOYEE | A payroll row's employee is not in the HRIS file | High, blocks release |
| DUPLICATE_PAYMENT | An employee appears twice in the register for the period | High, blocks release |
| INACTIVE_PAID | Status is terminated / inactive / left / separated and the leaving date is before the period | High, blocks release |
| OUTLIER | Gross differs from prior gross by more than 40% | Medium |
| CURRENCY | Paid currency differs from the HRIS currency | Medium |
| PRORATION | Hired inside the period; expected pay = gross × days worked ÷ days in period | Medium |
| EQUITY_MISSING | A vest in the equity file has no equity value on the payslip | Medium |
| INJECTION | A note contains instruction-like text (English or Chinese, after undoing lookalike characters) | Low; the note is withheld from any model |

Bank matching: each statement line takes the first unused ledger line with the same amount inside the date window; unmatched lines show the nearest candidate within 10%.

## Tests

\TAP version 13
# Subtest: payroll: the sample raises the seven planted exceptions, high severity first
ok 1 - payroll: the sample raises the seven planted exceptions, high severity first
  ---
  duration_ms: 18.6752
  type: 'test'
  ...
# Subtest: payroll: a clean row raises nothing
ok 2 - payroll: a clean row raises nothing
  ---
  duration_ms: 0.2066
  type: 'test'
  ...
# Subtest: payroll: outlier fires above 40%, not at exactly 40%
ok 3 - payroll: outlier fires above 40%, not at exactly 40%
  ---
  duration_ms: 0.4694
  type: 'test'
  ...
# Subtest: payroll: inactive statuses beyond "terminated" are caught; leaving on day one is not
ok 4 - payroll: inactive statuses beyond "terminated" are caught; leaving on day one is not
  ---
  duration_ms: 0.6047
  type: 'test'
  ...
# Subtest: payroll: employee IDs match regardless of case and spaces
ok 5 - payroll: employee IDs match regardless of case and spaces
  ---
  duration_ms: 0.9674
  type: 'test'
  ...
# Subtest: payroll: missing employee and duplicate payment
ok 6 - payroll: missing employee and duplicate payment
  ---
  duration_ms: 0.3267
  type: 'test'
  ...
# Subtest: payroll: proration expects pay for the days worked
ok 7 - payroll: proration expects pay for the days worked
  ---
  duration_ms: 0.4209
  type: 'test'
  ...
# Subtest: payroll: injection is caught in Chinese and with lookalike characters; ordinary notes are not
ok 8 - payroll: injection is caught in Chinese and with lookalike characters; ordinary notes are not
  ---
  duration_ms: 0.1853
  type: 'test'
  ...
# Subtest: payroll: equity vest missing from the payslip
ok 9 - payroll: equity vest missing from the payslip
  ---
  duration_ms: 0.4849
  type: 'test'
  ...
# Subtest: payroll: period label follows the period
ok 10 - payroll: period label follows the period
  ---
  duration_ms: 0.3689
  type: 'test'
  ...
# Subtest: bank: the sample matches 9 of 12 within three days, 6 on the same day
ok 11 - bank: the sample matches 9 of 12 within three days, 6 on the same day
  ---
  duration_ms: 1.219
  type: 'test'
  ...
# Subtest: bank: each ledger line is used once
ok 12 - bank: each ledger line is used once
  ---
  duration_ms: 0.1041
  type: 'test'
  ...
# Subtest: filings: identity and cash roll-forward tie for every company that tags them; Walmart is untestable
ok 13 - filings: identity and cash roll-forward tie for every company that tags them; Walmart is untestable
  ---
  duration_ms: 0.2894
  type: 'test'
  ...
# Subtest: filings: Paychex and Microsoft cross 15%; four companies cross 10%
ok 14 - filings: Paychex and Microsoft cross 15%; four companies cross 10%
  ---
  duration_ms: 0.2497
  type: 'test'
  ...
# Subtest: finqa: every sample gold program reproduces its gold answer
ok 15 - finqa: every sample gold program reproduces its gold answer
  ---
  duration_ms: 0.6367
  type: 'test'
  ...
# Subtest: finqa: grading numbers, percentages, programs and nonsense
ok 16 - finqa: grading numbers, percentages, programs and nonsense
  ---
  duration_ms: 0.1968
  type: 'test'
  ...
# Subtest: journal: balanced, unbalanced, off-register and self-approved
ok 17 - journal: balanced, unbalanced, off-register and self-approved
  ---
  duration_ms: 0.2133
  type: 'test'
  ...
# Subtest: fx: EUR 250,000 revalued from the September close rate to the latest rate
ok 18 - fx: EUR 250,000 revalued from the September close rate to the latest rate
  ---
  duration_ms: 0.0918
  type: 'test'
  ...
# Subtest: csv: quotes, escaped quotes, commas, CRLF, BOM and blank lines
ok 19 - csv: quotes, escaped quotes, commas, CRLF, BOM and blank lines
  ---
  duration_ms: 0.2503
  type: 'test'
  ...
# Subtest: csv: amounts with commas, currency signs and accounting negatives
ok 20 - csv: amounts with commas, currency signs and accounting negatives
  ---
  duration_ms: 0.2215
  type: 'test'
  ...
# Subtest: csv: dates must be real calendar dates
ok 21 - csv: dates must be real calendar dates
  ---
  duration_ms: 0.3791
  type: 'test'
  ...
# Subtest: csv: validation names the row and the column
ok 22 - csv: validation names the row and the column
  ---
  duration_ms: 0.4856
  type: 'test'
  ...
# Subtest: csv: headers are matched loosely (case and spaces)
ok 23 - csv: headers are matched loosely (case and spaces)
  ---
  duration_ms: 0.1358
  type: 'test'
  ...
# Subtest: csv: the sample survives a round trip through the templates and gives the same results
ok 24 - csv: the sample survives a round trip through the templates and gives the same results
  ---
  duration_ms: 3.2417
  type: 'test'
  ...
# Subtest: fingerprint is stable and changes with the data
ok 25 - fingerprint is stable and changes with the data
  ---
  duration_ms: 0.1531
  type: 'test'
  ...
1..25
# tests 25
# suites 0
# pass 25
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 113.7826
25 tests cover every payroll rule and its boundaries, bank matching, the SEC controls, the FinQA grader, journal checks, the FX revaluation, CSV parsing and validation, and a round trip of the sample through the CSV templates. GitHub Actions runs them on every push.

## What is real and what is synthetic

| Part | Data | Source |
| --- | --- | --- |
| Close, payroll, bank lines | Synthetic | `data.js`. Rules in `engine.js` run on it in the browser |
| Payroll engine evaluation (74 cases, recall 98.5%) | From the original Run Replay harness | carried over, not re-run here |
| Controls on public filings | Real | SEC EDGAR XBRL `companyfacts`, 8 companies' latest 10-K |
| FX revaluation (JE-1037) | Real rates, synthetic balance | Bank of Canada Valet API, EUR/CAD and USD/CAD |
| FinQA grader | Real benchmark | FinQA test set, 1,147 questions (MIT licence, Chen et al., 2021) |

Findings the real data produced:

- All 8 filings satisfy Assets = Liabilities + Equity and the cash roll-forward, except that Walmart does not tag total `Liabilities`, so the identity can't be tested from tags alone.
- Revenue grew more than 15% year over year at Paychex (+16.9%) and Microsoft (+17.8%). The page deliberately writes no explanation: a reviewer would take one from the filing itself.
- The deterministic FinQA grader reproduces 1,108 of 1,108 executable gold programs. The other 39 need table operations, which aren't supported yet.
- One gold label (RSG/2018) calls an 82/18 asset allocation a "debt to equity ratio", which is worth questioning.
- 30 Sep 2026 had no Bank of Canada rate, so the September close rate is 29 Sep.

## Refresh the public data

```bash
node scripts/fetch-real.mjs
curl -L https://raw.githubusercontent.com/czyssrs/FinQA/main/dataset/test.json -o finqa-test.json
node scripts/finqa-grader.mjs finqa-test.json
node scripts/build-real.mjs
```

The SEC asks for a contact address in the `User-Agent`; `fetch-real.mjs` sends Martin's.

## Before publishing

- Check the name "Tickmark" for trademark conflicts in your market.
- The 3D mark in the hero is rendered from `blender/mark3d.py` (Blender 5.4): `blender -b -P blender/mark3d.py -- still <out>` and `-- anim <frames dir>/f_`. The frames are transparent, so composite them onto #0a0a0a with ffmpeg before encoding (the page background).

## Pages

- `index.html`: the Work page (intro, hero, results, workbench, live control, contact).
- `notes.html`: every explanation (principles, one exception end to end, scores, what broke, close calendar, data sources, history, letter, credits).
- `engine.js`: every rule, CSV parsing, validation and export. No DOM.
- `app.js`: renders the workbench, records decisions, saves the session, handles uploads and exports.
- `motion.js`: intro, page wipe, reveals, progress bar, counters, magnetic buttons, ⌘K palette, toasts, segmented indicators, spotlight and tilt.

## Credits

Pictures: "Pittsboro Merchant Business Ledger", public domain, via Wikimedia Commons · "HollerithMachine.CHM" by Adam Schuster, CC BY 2.0. Full records are in `assets/credits.json`.
