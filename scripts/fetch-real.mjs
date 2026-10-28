// Pulls public data into real-data.js as a dated snapshot. Run: node scripts/fetch-real.mjs
import { writeFileSync } from 'node:fs';
const UA = { 'User-Agent': 'Tickmark portfolio research zhangsanshi2003@gmail.com', 'Accept': 'application/json' };
const get = async (u, h = UA) => { const r = await fetch(u, { headers: h }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const cos = [['ADP', 8670], ['Paychex', 723531], ['Workday', 1327811], ['Intuit', 896878], ['Apple', 320193], ['Microsoft', 789019], ['JPMorgan Chase', 19617], ['Walmart', 104169]];
const out = { pulled: new Date().toISOString().slice(0, 10), companies: [] };
const pick = (facts, tag, filter) => (facts['us-gaap']?.[tag]?.units?.USD || []).filter(filter);
for (const [name, cik] of cos) {
  try {
    const j = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
    const f = j.facts;
    // latest 10-K
    const tenK = pick(f, 'Assets', (x) => x.form === '10-K' && x.fp === 'FY').sort((a, b) => b.end.localeCompare(a.end))[0];
    if (!tenK) throw new Error('no 10-K');
    const accn = tenK.accn, end = tenK.end;
    const at = (tag, e = end) => pick(f, tag, (x) => x.accn === accn && x.end === e && !x.start)[0]?.val ?? null;
    const dur = (tag) => pick(f, tag, (x) => x.accn === accn && x.end === end && x.start && (new Date(x.end) - new Date(x.start)) / 864e5 > 350)[0] || null;
    const revTags = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'];
    let rev = null, revTag = null; for (const t of revTags) { const d = dur(t); if (d) { rev = d; revTag = t; break; } }
    const revPrior = revTag ? pick(f, revTag, (x) => x.accn === accn && x.start && x.end < end && (new Date(x.end) - new Date(x.start)) / 864e5 > 350).sort((a, b) => b.end.localeCompare(a.end))[0] : null;
    const cashTags = ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'];
    const chgTags = ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease'];
    let cash = null;
    for (const t of cashTags) {
      const endV = at(t); if (endV == null) continue;
      const begin = pick(f, t, (x) => x.accn === accn && !x.start && x.end < end).sort((a, b) => b.end.localeCompare(a.end))[0];
      let chg = null, chgTag = null; for (const c of chgTags) { const d = dur(c); if (d) { chg = d.val; chgTag = c; break; } }
      const fx = dur('EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents')?.val ?? null;
      cash = { tag: t, end: endV, begin: begin?.val ?? null, beginDate: begin?.end ?? null, chg, chgTag, fx };
      break;
    }
    out.companies.push({ name, cik, form: '10-K', fy: tenK.fy, end, accn, filed: tenK.filed,
      assets: at('Assets'), liabilities: at('Liabilities'), equity: at('StockholdersEquity'),
      equityTotal: at('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'),
      lse: at('LiabilitiesAndStockholdersEquity'), temp: at('TemporaryEquityCarryingAmountAttributableToParent'),
      revenue: rev?.val ?? null, revTag, revenuePrior: revPrior?.val ?? null,
      netIncome: dur('NetIncomeLoss')?.val ?? null, cash });
    console.log('ok', name, end);
  } catch (e) { console.log('fail', name, e.message); }
  await new Promise((r) => setTimeout(r, 250));
}
// Bank of Canada exchange rates
try {
  const fx = await get('https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json?recent=30', { 'Accept': 'application/json' });
  out.fx = fx.observations.map((o) => ({ d: o.d, usd: +o.FXUSDCAD?.v, eur: +o.FXEURCAD?.v })).filter((o) => o.usd);
  console.log('ok fx', out.fx.length, out.fx.at(-1));
} catch (e) { console.log('fail fx', e.message); }
writeFileSync('real-data.json', JSON.stringify(out, null, 1));
