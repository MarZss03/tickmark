# Tickmark

[![Tests](https://github.com/MarZss03/tickmark/actions/workflows/test.yml/badge.svg)](https://github.com/MarZss03/tickmark/actions/workflows/test.yml)

Finance controls that show their work. A portfolio case study and working prototype for month-end close, payroll review and financial-model evaluation. It grew out of the earlier "Run Replay" prototype.

Live: https://tickmark-martinzhang.vercel.app · Notes: https://tickmark-martinzhang.vercel.app/notes

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

Dates are `YYYY-MM-DD`. Amounts may use thousands separators, a currency sign, or accounting brackets for negatives (`(1,000.00)`). Each upload box has a **Download a template** link with the sample rows in the right shape. Errors name the row and column, as a spreadsheet would. Files are limited to 2 MB and 5,000 rows.

## Rules

All rules live in `engine.js`, which has no page code: the site and the tests both load it.

| Rule | Fires when | Severity |
| --- | --- | --- |
| MISSING_EMPLOYEE | A payroll row's employee is not in the HRIS file | High, blocks release |
| DUPLICATE_PAYMENT | An employee appears twice in the register for the period | High, blocks release |
| INACTIVE_PAID | Status is terminated / inactive / left / separated / resigned / retired / dismissed / deceased, and the leaving date is before the period or blank | High, blocks release |
| NOT_STARTED | The HRIS start date is after the pay period ends | High, blocks release |
| OUTLIER | Gross differs from prior gross by more than 40% | Medium |
| CURRENCY | Paid currency differs from the HRIS currency | Medium |
| PRORATION | Hired inside the period; expected pay = gross × days worked ÷ days in period | Medium |
| EQUITY_MISSING | A vest in the equity file has no equity value on the payslip | Medium |
| INJECTION | A note contains instruction-like text (English or Chinese, after undoing full-width letters, invisible characters, Cyrillic and Greek lookalikes, and digits for letters) | Low; the note is withheld from any model |

Employee IDs are matched without regard to case or surrounding spaces. Bank matching: each statement line takes the first unused ledger line with the same amount inside the date window; an unmatched line shows the nearest candidate within 10%.

## Stress test

The **Stress test** tab checks the rules themselves. It plants one known error at a time into a copy of the payroll data (the sample, or your own files), re-runs the rules and counts what they catch. 19 plants are errors a rule should raise on that employee; 4 are normal cases that must stay quiet (pay 39% up, leaving on the last day, starting on the first day, an ordinary approval note), which counts false alarms. Plants go only into rows the rules pass today, so every change in the result comes from the plant. A seed picks the employees; the same seed gives the same plants. Results export to CSV and the run lands in the audit log.

The first run caught 11 of 19. The 8 misses were real gaps: a terminated person with no leaving date, the status "resigned", pay before the start date, and an injection note hidden with zero-width, Cyrillic or full-width characters. Those six are fixed. Two misses remain on purpose, and the page says why: pay tripled with the prior period left blank (nothing to compare against), and a reworded instruction (a keyword rule cannot recognise new wording). Today: 17 of 19 caught, 0 false alarms.

## Tests

```bash
node --test "tests/*.test.js"
```

30 tests cover every payroll rule and its boundaries, the stress test (expected misses, no false alarms, same seed same plants, input untouched), bank matching, the SEC controls, the FinQA grader, journal checks, the FX revaluation, CSV parsing and validation, and a round trip of the sample through the CSV templates (same results either way). GitHub Actions runs them, plus a syntax check of the page scripts, on every push.

## What is real and what is synthetic

| Part | Data | Source |
| --- | --- | --- |
| Close, payroll, bank lines | Synthetic | `data.js`. The rules in `engine.js` run on it in the browser |
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

## Files

- `index.html`: the Work page (intro, hero, results, workbench, live control, contact).
- `notes.html`: every explanation (principles, one exception end to end, scores, what broke, close calendar, data sources, history, letter, credits).
- `engine.js`: every rule, the stress test, plus CSV parsing, validation and export. No page code.
- `app.js`: renders the workbench, records decisions, saves the session, handles uploads and exports.
- `motion.js`: intro, page wipe, reveals, progress bar, counters, magnetic buttons, jump palette, toasts, segmented indicators, spotlight and tilt.
- `blender/mark3d.py`: the 3D mark in the hero (Blender 5.4). `blender -b -P blender/mark3d.py -- still <out>` and `-- anim <frames dir>/f_`. The frames are transparent; composite them onto #0a0a0a with ffmpeg before encoding.

## Credits

Pictures: "Pittsboro Merchant Business Ledger", public domain, via Wikimedia Commons · "HollerithMachine.CHM" by Adam Schuster, CC BY 2.0. Full records are in `assets/credits.json`.
