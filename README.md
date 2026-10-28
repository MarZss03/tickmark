# Tickmark

Finance controls that show their work. A portfolio case study and working prototype for month-end close, payroll review and financial-model evaluation. It replaces the earlier "Run Replay" page.

Live: https://tickmark-one.vercel.app · Notes: https://tickmark-one.vercel.app/notes

A static site: open `index.html`, or run `node scripts/serve.mjs` and visit http://localhost:5173. It deploys to Vercel as-is, with no build step; every push to `main` redeploys.

## What is real and what is synthetic

| Part | Data | Source |
| --- | --- | --- |
| Close, payroll, bank lines | Synthetic | `data.js`. Rules run on it in the browser (`app.js`) |
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
- `motion.js`: intro, page wipe, reveals, progress bar, counters, magnetic buttons, ⌘K palette, toasts, segmented indicators, spotlight and tilt.

## Credits

Pictures: "Pittsboro Merchant Business Ledger", public domain, via Wikimedia Commons · "HollerithMachine.CHM" by Adam Schuster, CC BY 2.0. Full records are in `assets/credits.json`.
