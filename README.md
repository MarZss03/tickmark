# Tickmark

[![Tests](https://github.com/MarZss03/tickmark/actions/workflows/test.yml/badge.svg)](https://github.com/MarZss03/tickmark/actions/workflows/test.yml)

Finance operations staff often see two records that should agree, and don't: the money is in the bank, but the loan still shows a balance. Tickmark helps them work out whether the gap is an entry error, a timing gap or a real business difference, trace it to the source evidence, ask the right team or person, and re-check when the answer comes back.

It started on 27 Oct 2026 as a finance review experiment (controls that show their work, for close, payroll and cash). On 3 Nov 2026, industry research and my mortgage servicing work narrowed it to one problem: settling exceptions whose facts sit with other teams. The [Notes](https://tickmark-martinzhang.vercel.app/notes) tell that story in order. It grew out of the earlier "Run Replay" prototype. All operational data is synthetic.

**Start here:** [Try the payout exception](https://tickmark-martinzhang.vercel.app/#try) opens the main mortgage case with a step-by-step guide: ask Payments, switch roles, read the reply, ask the authorised reviewer, re-check. Or [try as Sam Ortiz](https://tickmark-martinzhang.vercel.app/#try/store): a small online store's payout that reached the bank $300.00 short, opened as the bookkeeper who can act on it.

Live: https://tickmark-martinzhang.vercel.app · Notes: https://tickmark-martinzhang.vercel.app/notes

A static site: open `index.html`, or run `node scripts/serve.mjs` and visit http://localhost:5173. It deploys to Vercel as-is, with no build step; every push to `main` redeploys.

## Workbench: My Work, business queues and Case Review

The workbench opens on **My Work** (`#workbench`): what needs the person acting, checks assigned to them, their team's inbox, and what they are waiting on, across every business. **Work Queues** holds one queue per business, each with its own address and columns: Month-end Close (`#queue/close`), Payroll (`#queue/payroll`), Cash Reconciliation (`#queue/cash`), Mortgage Servicing (`#queue/mortgage`) and Merchant Payouts (`#queue/payouts`). Close, Payroll and Cash keep their existing checks and reports one tab over (`#checks/close`, `#checks/payroll`, `#reports/cash`). **Data & Imports** (`#imports`) is the CSV upload, **Audit Log** (`#audit`) the history, and **Demo & Validation** holds the guided demo (`#try`), public filings, model evaluation and the stress test. Each case has its own address (`#case/MS-0011`); filters are kept per queue while you move around. *Acting as* in the top bar switches the simulated person.

Every case uses one layout. The first screen is the finding in a sentence, the facts on record, what is still pending confirmation and who can supply it, what it holds up, and one primary action for the person acting, chosen from the same rules as every other button: request confirmation, claim a check, reply with evidence, review a reply, add new evidence, a decision they can make, or who the case is waiting on and why. Evidence, checks and activity follow, with the full trace and history folded.

A case answers four questions first: what differs (expected against found, a classification a person can change, and the reasoning marked as inference), where the evidence comes from (each fact, every value found, its system, location, time and version, which sources are independent and which copy another; text read from documents is highlighted where it was read), what it holds up, and what the person acting can do now. Business priority (impact, deadline, amount, waiting time) is shown apart from confidence in the reading, and a person can override it with a reason.

From a case you can send a **check** to a team (anyone in it claims it; the lead can assign) or to a named person (refused, with suggestions, if they lack the authority the question needs). A check carries the question, why it matters, what it affects, the evidence shared, a due time and its own history. The handler can reply with a conclusion and attach evidence they can reach, ask the owner to clarify, or return it with a reason; the owner accepts the reply or sends it back; overdue checks can be chased or passed to the team lead. The case stays with its owner: closing a check only means the question was answered.

When a reply or a new document changes the inputs, the module's checks re-run, before-and-after values go into the timeline, superseded evidence is kept, and approvals that relied on the changed facts are marked for re-review. Actions (confirm reconciled, release pay, reverse hold interest, send a shortfall notice, resume a payout, confirm a cancellation) open only when their conditions hold and the person has the permission, and a decision made from a page showing an older evidence version is refused. Re-scanning the same data updates the open case rather than opening a new one.

| Module | Detection | Example walked end to end |
| --- | --- | --- |
| Cash | the existing bank matcher (`matchBank`) | A legal fee paid 6,850.00, ledger 6,580.00: the invoice and bank agree, the ledger copies one AP entry; AP corrects it; re-check clears it |
| Payroll | the existing payroll rules (`runPayroll`) | E-1017 paid twice: two imports of the same timesheet file; Timekeeping reverses one; release opens |
| Close | the close run's exceptions in `data.js` | Any of the six: ask the team that can answer, then mark resolved with a reason |
| Mortgage | servicing rules in `case-rules.js` | A wire on time, posted three days late after a hold: Payments confirms receipt, an authorised reviewer sets the settlement date, the interest is reversed, discharge preparation resumes. No shortfall notice, because a late posting alone does not trigger one |

**Merchant Payouts** applies the same handling to a small online store (Fernleaf Ceramics, fictional): a payment processor's payouts against the store's bank account. Five payouts cover a deposit $300.00 short that traces to a chargeback (only the store owner can decide the dispute), a payout marked paid that has not arrived, a reserve held back, fees above the plan rate, and a payout report that does not add up because an order was refunded twice. The payout report is shaped like a typical processor summary; it is not any provider's data.

The eleven mortgage files also cover a late wire (estimated shortfall until confirmed, notice, top-up), a moved closing date (old approval goes to re-review), an approved waiver not on the statement, a statement for the wrong registration, a paid-off loan with no final registration receipt (overdue follow-up, a wrong receipt sent back), a cancellation with a wire in transit, an internal refinance, an assignment prepared as a discharge, a reverse mortgage with an estate, and a commercial partial release. Branches without a checked rule go to a person.

**Simulated:** sign-in (switch people with *Acting as*), notices, sending and every bank system. **Deterministic stand-ins:** the document extractor and the drafted questions stand in for a model. Each case separates what the evidence confirms from a possible explanation, which is labelled as not confirmed until the facts it depends on are in. **Not verified:** any lender's real rules for holds, per diem, waivers or cut-off times; the demo rules are labelled as such. **Not measured:** time saved, round trips or error rates with real users.

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

47 tests. `tests/cases.test.js` (17) walks the close, payouts, the cash, payroll and mortgage cases through detection, tracing, escalation, replies, re-checks and decisions, including permissions, duplicate submissions, stale pages, reassignment, overdue checks, clarification, returns and re-review. `tests/engine.test.js` (30) covers every payroll rule and its boundaries, the stress test (expected misses, no false alarms, same seed same plants, input untouched), bank matching, the SEC controls, the FinQA grader, journal checks, the FX revaluation, CSV parsing and validation, and a round trip of the sample through the CSV templates (same results either way). GitHub Actions runs them, plus a syntax check of the page scripts, on every push.

## What is real and what is synthetic

| Part | Data | Source |
| --- | --- | --- |
| Mortgage files, people, emails, wires, registrations | Synthetic | `case-data.js`. Nothing is a real bank, lender, firm or person |
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
- `cases.js`: cases, evidence tracing, priority, checks sent to teams or people, decisions and re-review. No page code.
- `case-rules.js`: what Cash, Payroll and Mortgage each check and allow, reusing `engine.js` for the first two.
- `case-data.js`: synthetic people, teams, documents and mortgage files.
- `review.js`: routes, My Work, the business queues and Case Review.
- `app.js`: renders the workbench, records decisions, saves the session, handles uploads and exports.
- `motion.js`: intro, page wipe, reveals, progress bar, counters, magnetic buttons, jump palette, toasts, segmented indicators, spotlight and tilt.
- `blender/mark3d.py`: the 3D mark in the hero (Blender 5.4). `blender -b -P blender/mark3d.py -- still <out>` and `-- anim <frames dir>/f_`. The frames are transparent; composite them onto #0a0a0a with ffmpeg before encoding.

## Credits

Pictures: "Pittsboro Merchant Business Ledger", public domain, via Wikimedia Commons · "HollerithMachine.CHM" by Adam Schuster, CC BY 2.0. Full records are in `assets/credits.json`.
