// Tickmark engine: every deterministic rule, with no DOM. The page loads it as window.TickmarkEngine;
// the tests load it with require(). Amounts, dates and decisions are computed here and nowhere else.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkEngine = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const DAY = 864e5;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const money = (v) => new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const round2 = (v) => Math.round(v * 100) / 100;
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime()) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const big = (v) => (v == null ? '—' : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + ' bn' : (v / 1e6).toFixed(0) + ' m');

  // "1–15 Oct" within a month, "25 Oct–7 Nov" across months
  function periodLabel({ start, end }) {
    const [, m1, d1] = start.split('-').map(Number), [, m2, d2] = end.split('-').map(Number);
    return m1 === m2 ? `${d1}–${d2} ${MONTHS[m1 - 1]}` : `${d1} ${MONTHS[m1 - 1]}–${d2} ${MONTHS[m2 - 1]}`;
  }

  // ---------- payroll control cycle ----------
  const INACTIVE = ['terminated', 'inactive', 'left', 'separated'];
  const INJECTION = /忽略|ignore previous|approve directly|直接批准|system prompt/i;
  // undo common lookalike swaps before matching, so "Ign0re … appr0ve" is caught too
  const normalise = (t) => String(t || '').toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/@/g, 'a');
  const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

  function runPayroll({ hris, payroll, equity = [], period = { start: '2026-10-01', end: '2026-10-15' }, outlierPct = 0.4 }) {
    const key = (id) => String(id).trim().toUpperCase();
    const H = Object.fromEntries(hris.map((h) => [key(h.id), h]));
    const label = periodLabel(period);
    const periodDays = daysBetween(period.start, period.end) + 1;
    const out = [];
    const seen = new Set();
    payroll.forEach((p) => {
      const id = key(p.id), h = H[id];
      if (!h) { out.push({ id, rule: 'MISSING_EMPLOYEE', sev: 'high', blocks: true, ev: 'Not in HRIS' }); return; }
      if (seen.has(id)) out.push({ id, rule: 'DUPLICATE_PAYMENT', sev: 'high', blocks: true, ev: `Two rows for ${label} · ${money(p.gross)} each` });
      seen.add(id);
      if (INACTIVE.includes(String(h.status).toLowerCase()) && h.term && h.term < period.start) out.push({ id, rule: 'INACTIVE_PAID', sev: 'high', blocks: true, ev: `Left ${h.term} · paid ${money(p.gross)}` });
      if (p.prior > 0 && Math.abs(p.gross - p.prior) / p.prior > outlierPct) out.push({ id, rule: 'OUTLIER', sev: 'medium', blocks: false, ev: `${money(p.prior)} → ${money(p.gross)} (${p.gross >= p.prior ? '+' : '−'}${Math.abs(Math.round((p.gross / p.prior - 1) * 1000) / 10)}%)` });
      if (p.ccy !== h.ccy) out.push({ id, rule: 'CURRENCY', sev: 'medium', blocks: false, ev: `Paid in ${p.ccy}, HRIS says ${h.ccy}` });
      if (h.hire > period.start && h.hire <= period.end) {
        const worked = daysBetween(h.hire, period.end) + 1, expected = round2(p.gross * worked / periodDays);
        out.push({ id, rule: 'PRORATION', sev: 'medium', blocks: false, ev: `Hired ${h.hire} · paid ${money(p.gross)}, expected ${money(expected)}`, expected });
      }
      if (INJECTION.test(normalise(p.note))) out.push({ id, rule: 'INJECTION', sev: 'low', blocks: false, ev: 'Instruction found in note · withheld from model' });
    });
    equity.forEach((e) => {
      const p = payroll.find((r) => key(r.id) === key(e.id));
      if (p && !p.equity) out.push({ id: key(e.id), rule: 'EQUITY_MISSING', sev: 'medium', blocks: false, ev: `${e.units} RSU vested · ${money(e.units * e.fmv)} not on payslip` });
    });
    return out.sort((a, b) => SEVERITY_ORDER[a.sev] - SEVERITY_ORDER[b.sev]);
  }

  // ---------- bank reconciliation ----------
  // each bank line takes the first unused ledger line with the same amount inside the date window
  function matchBank(bank, gl, windowDays = 3) {
    const used = new Set();
    const rows = bank.map(([date, desc, amt]) => {
      let hit = -1;
      gl.forEach(([gd, , ga], i) => { if (hit < 0 && !used.has(i) && Math.abs(ga - amt) < 0.005 && Math.abs(daysBetween(date, gd)) <= windowDays) hit = i; });
      if (hit >= 0) {
        used.add(hit);
        const lag = Math.abs(daysBetween(date, gl[hit][0]));
        return { date, desc, amt, gl: gl[hit][1], res: lag ? `matched · ${lag} day${lag > 1 ? 's' : ''}` : 'matched', ok: true };
      }
      let near = null, nd = Infinity;
      gl.forEach(([, gdesc, ga], i) => { if (used.has(i)) return; const d = Math.abs(ga - amt); if (d < nd && d < Math.abs(amt) * 0.1) { nd = d; near = `${gdesc} ${money(ga)}`; } });
      return { date, desc, amt, gl: near || '—', res: near ? `differs by ${money(nd)}` : 'no candidate', ok: false, diff: near ? round2(nd) : null };
    });
    const bankTotal = round2(bank.reduce((a, b) => a + b[2], 0)), glTotal = round2(gl.reduce((a, b) => a + b[2], 0));
    return { rows, matched: rows.filter((r) => r.ok).length, bankTotal, glTotal, unexplained: round2(Math.abs(bankTotal - glTotal)) };
  }

  // ---------- controls on public filings (XBRL company facts) ----------
  function secChecks(c, threshold = 0.15) {
    const e = c.equityTotal ?? c.equity;
    const identity = c.liabilities != null && e != null
      ? { ok: Math.abs(c.assets - c.liabilities - e - (c.temp || 0)) < 0.5, txt: 'ties', note: `${big(c.assets)} = ${big(c.liabilities)} + ${big(e)}` }
      : { ok: null, txt: 'Liabilities not tagged', note: c.lse != null ? `Derived ${big(c.lse - e)} from the liabilities-and-equity total less equity` : 'cannot test' };
    const k = c.cash;
    const diff = k && k.begin != null && k.chg != null ? k.end - k.begin - k.chg : null;
    const roll = diff != null
      ? { ok: Math.abs(diff) < 0.5, txt: Math.abs(diff) < 0.5 ? 'ties' : `off by ${big(diff)}`, note: `${big(k.begin)} opening + ${big(k.chg)} change = ${big(k.end)} closing` }
      : { ok: null, txt: 'not tagged', note: 'cannot test' };
    const g = c.revenue && c.revenuePrior ? c.revenue / c.revenuePrior - 1 : null;
    const flux = g == null ? { ok: null, txt: '—', growth: null } : { ok: Math.abs(g) <= threshold, txt: (g >= 0 ? '+' : '−') + Math.abs(g * 100).toFixed(1) + '%', growth: g };
    return { id: identity, roll, flux };
  }

  // ---------- FinQA grader (same logic as scripts/finqa-grader.mjs) ----------
  function finqaNum(t, mem) {
    t = t.trim();
    if (t.startsWith('#')) return mem[+t.slice(1)];
    if (t.startsWith('const_')) return t === 'const_m1' ? -1 : +t.slice(6);
    const pct = t.endsWith('%'), v = parseFloat(t.replace(/[%,$]/g, ''));
    return pct ? v / 100 : v;
  }
  function runProgram(prog) {
    const mem = [];
    for (const step of String(prog).split(/\)\s*,\s*/).map((x) => x.replace(/\)\s*$/, ''))) {
      const m = step.trim().match(/^(\w+)\((.*)$/); if (!m) return NaN;
      const [a, b] = m[2].split(','); if (b === undefined) return NaN;
      const x = finqaNum(a, mem), y = finqaNum(b, mem);
      const r = { add: x + y, subtract: x - y, multiply: x * y, divide: x / y, exp: x ** y, greater: x > y ? 'yes' : 'no' }[m[1]];
      if (r === undefined) return NaN;
      mem.push(r);
    }
    return mem.at(-1);
  }
  const sameAnswer = (p, g) => (typeof g === 'string' || typeof p === 'string' ? String(p) === String(g) : Math.abs(p - g) <= Math.max(1e-4, Math.abs(g) * 0.005));
  function gradeAnswer(input, gold) {
    const v = String(input).trim();
    const value = /\(/.test(v) ? runProgram(v) : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v.replace(/,/g, ''));
    const readable = typeof value === 'string' || Number.isFinite(value);
    return { value, readable, pass: readable && sameAnswer(value, gold) };
  }

  // ---------- journal entry checks and FX revaluation ----------
  function checkJournal({ debits, credits, register, periodOpen = true, selfApproved = false }) {
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    const dr = sum(debits), cr = sum(credits);
    const ok = {
      balance: Number.isFinite(dr) && Number.isFinite(cr) && Math.abs(dr - cr) < 0.005,
      period: periodOpen,
      evidence: register == null || Math.abs(cr - register) < 0.005,
      four: !selfApproved,
    };
    return { dr, cr, ok, all: Object.values(ok).every(Boolean) };
  }
  const fxRevaluation = (balance, fromRate, toRate) => round2(balance * (toRate - fromRate));

  // ---------- CSV in and out ----------
  function parseCsv(text) {
    const s = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    return rows;
  }
  const csvCell = (v) => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const toCsv = (columns, records) => [columns.join(','), ...records.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

  // "1,234.50", "$1,234.50", "(1,234.50)" for negatives
  function parseAmount(raw) {
    let t = String(raw).trim().replace(/[$\s]/g, '').replace(/,/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    const n = parseFloat(t);
    return neg ? -n : n;
  }

  const TABLES = {
    hris: {
      label: 'HRIS file',
      columns: ['employee_id', 'department', 'status', 'hire_date', 'termination_date', 'currency'],
      required: ['employee_id', 'status', 'hire_date', 'currency'],
      map: (r) => ({ id: r.employee_id, dept: r.department || '—', status: r.status.toLowerCase(), hire: r.hire_date, term: r.termination_date || null, ccy: r.currency.toUpperCase() }),
      dates: ['hire_date', 'termination_date'],
      amounts: [],
      from: (h) => ({ employee_id: h.id, department: h.dept, status: h.status, hire_date: h.hire, termination_date: h.term || '', currency: h.ccy }),
    },
    payroll: {
      label: 'Payroll register',
      columns: ['employee_id', 'gross', 'prior_gross', 'currency', 'note', 'equity_value'],
      required: ['employee_id', 'gross', 'currency'],
      map: (r) => ({ id: r.employee_id, gross: r.gross, prior: r.prior_gross === '' || r.prior_gross == null ? 0 : r.prior_gross, ccy: r.currency.toUpperCase(), note: r.note || '', equity: r.equity_value || 0 }),
      dates: [],
      amounts: ['gross', 'prior_gross', 'equity_value'],
      from: (p) => ({ employee_id: p.id, gross: p.gross.toFixed(2), prior_gross: p.prior ? p.prior.toFixed(2) : '', currency: p.ccy, note: p.note, equity_value: p.equity ? p.equity.toFixed(2) : '' }),
    },
    equity: {
      label: 'Equity vesting file',
      columns: ['employee_id', 'units', 'fmv'],
      required: ['employee_id', 'units', 'fmv'],
      map: (r) => ({ id: r.employee_id, units: r.units, fmv: r.fmv }),
      dates: [],
      amounts: ['units', 'fmv'],
      from: (e) => ({ employee_id: e.id, units: e.units, fmv: e.fmv }),
    },
    bank: {
      label: 'Bank statement',
      columns: ['date', 'description', 'amount'],
      required: ['date', 'amount'],
      map: (r) => [r.date, r.description || '—', r.amount],
      dates: ['date'],
      amounts: ['amount'],
      from: ([date, description, amount]) => ({ date, description, amount: amount.toFixed(2) }),
    },
    gl: {
      label: 'Ledger cash account',
      columns: ['date', 'reference', 'amount'],
      required: ['date', 'amount'],
      map: (r) => [r.date, r.reference || '—', r.amount],
      dates: ['date'],
      amounts: ['amount'],
      from: ([date, reference, amount]) => ({ date, reference, amount: amount.toFixed(2) }),
    },
  };
  const MAX_ROWS = 5000;

  // parse, check and map one uploaded file; errors name the row as a spreadsheet would (header is row 1)
  function loadTable(kind, text) {
    const spec = TABLES[kind];
    const errors = [];
    const grid = parseCsv(text);
    if (!grid.length) return { records: [], errors: [`${spec.label} is empty.`] };
    const header = grid[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const missing = spec.required.filter((c) => !header.includes(c));
    if (missing.length) return { records: [], errors: [`${spec.label} is missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected: ${spec.columns.join(', ')}.`] };
    const body = grid.slice(1);
    if (body.length > MAX_ROWS) return { records: [], errors: [`${spec.label} has ${body.length} rows; the limit is ${MAX_ROWS}.`] };
    if (!body.length) return { records: [], errors: [`${spec.label} has a header but no rows.`] };
    const records = [];
    body.forEach((cells, i) => {
      const rowNo = i + 2;
      const r = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]));
      let bad = false;
      for (const c of spec.required) if (!r[c]) { errors.push(`Row ${rowNo}: ${c} is empty.`); bad = true; }
      for (const c of spec.dates) if (r[c] && !isDate(r[c])) { errors.push(`Row ${rowNo}: ${c} "${r[c]}" is not a date like 2026-10-31.`); bad = true; }
      for (const c of spec.amounts) {
        if (r[c] === undefined || r[c] === '') continue;
        const n = parseAmount(r[c]);
        if (Number.isNaN(n)) { errors.push(`Row ${rowNo}: ${c} "${r[c]}" is not a number.`); bad = true; }
        else r[c] = n;
      }
      if (!bad) records.push(spec.map(r));
    });
    return { records, errors: errors.slice(0, 50).concat(errors.length > 50 ? [`…and ${errors.length - 50} more.`] : []) };
  }
  const tableToCsv = (kind, records) => toCsv(TABLES[kind].columns, records.map(TABLES[kind].from));

  // a short stable fingerprint, so saved decisions stay with the data they were made on
  function fingerprint(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  return {
    money, round2, daysBetween, isDate, big, periodLabel,
    runPayroll, matchBank, secChecks,
    runProgram, sameAnswer, gradeAnswer,
    checkJournal, fxRevaluation,
    parseCsv, toCsv, parseAmount, TABLES, loadTable, tableToCsv, fingerprint,
  };
});
