// Combines the fetched public data into real-data.js, the snapshot the page loads.
// Order: node scripts/fetch-real.mjs → node scripts/finqa-grader.mjs <finqa test.json> → node scripts/build-real.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('real-data.json', 'utf8'));
const finqa = JSON.parse(readFileSync('finqa-sample.json', 'utf8'));
const fx = r.fx.slice().sort((a, b) => a.d.localeCompare(b.d));
// the last published rate on or before month end (30 Sep 2026 had no Bank of Canada rate)
const sep = fx.filter((o) => o.d <= '2026-09-30').at(-1);
const last = fx.at(-1);
const out = { pulled: r.pulled, companies: r.companies, fx: { series: fx, sep, last }, finqa };
writeFileSync('real-data.js',
  `// Public data snapshot, pulled ${r.pulled} by scripts/fetch-real.mjs and scripts/finqa-grader.mjs.\n` +
  '// Sources: SEC EDGAR XBRL companyfacts API; Bank of Canada Valet API; FinQA test set (MIT, Chen et al. 2021).\n' +
  `window.REAL = ${JSON.stringify(out)};\n`);
console.log('real-data.js written', { companies: out.companies.length, fx: fx.length, sep: sep.d, last: last.d });
