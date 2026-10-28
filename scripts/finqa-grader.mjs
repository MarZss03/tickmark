// Deterministic FinQA grader: executes a FinQA program and compares to an answer within 0.5% relative tolerance.
import { readFileSync, writeFileSync } from 'node:fs';
export function num(t, mem, tableRows) {
  t = t.trim();
  if (t.startsWith('#')) return mem[+t.slice(1)];
  if (t.startsWith('const_')) { const v = t.slice(6); return v === 'm1' ? -1 : +v; }
  let pct = t.endsWith('%'); const v = parseFloat(t.replace(/[%,$]/g, ''));
  return pct ? v / 100 : v;
}
export function run(prog) {
  const steps = prog.split(/\)\s*,\s*/).map((s) => s.replace(/\)$/, ''));
  const mem = [];
  for (const s of steps) {
    const m = s.match(/^(\w+)\((.*)$/); if (!m) return NaN;
    const [, op, args] = m; const [a, b] = args.split(',').map((x) => x.trim());
    if (op.startsWith('table_')) return NaN; // needs the table; counted separately
    const x = num(a, mem), y = num(b, mem);
    const r = { add: x + y, subtract: x - y, multiply: x * y, divide: x / y, exp: x ** y, greater: x > y ? 'yes' : 'no' }[op];
    if (r === undefined) return NaN; mem.push(r);
  }
  return mem.at(-1);
}
export const same = (p, g) => typeof g === 'string' || typeof p === 'string' ? String(p) === String(g) : Math.abs(p - g) <= Math.max(1e-4, Math.abs(g) * 0.005);
if (process.argv[2]) {
  const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  let ok = 0, table = 0, bad = [];
  for (const x of d) {
    if (/table_/.test(x.qa.program)) { table++; continue; }
    const r = run(x.qa.program);
    if (same(r, x.qa.exe_ans)) ok++; else bad.push([x.id, x.qa.program, x.qa.exe_ans, r]);
  }
  console.log({ total: d.length, table, executable: d.length - table, ok, mismatch: bad.length });
  console.log(bad.slice(0, 6));
  // a small, varied sample for the page (question, the figures it needs, gold program and answer)
  const pickIds = [3, 41, 120, 333, 777, 512, 905, 1010];
  const sample = pickIds.map((i) => d[i]).map((x) => ({ id: x.id, q: x.qa.question, prog: x.qa.program, ans: x.qa.exe_ans, steps: x.qa.program.split('),').length, evidence: Object.values(x.qa.gold_inds || {}).slice(0, 2).map((s) => s.slice(0, 220)) }));
  const ops = {}; for (const x of d) for (const o of ['add', 'subtract', 'multiply', 'divide', 'greater', 'exp']) if (x.qa.program.includes(o + '(')) ops[o] = (ops[o] || 0) + 1;
  const steps = { 1: 0, 2: 0, 3: 0, '4+': 0 }; for (const x of d) { const k = x.qa.program.split('),').length; steps[k >= 4 ? '4+' : k]++; }
  writeFileSync('finqa-sample.json', JSON.stringify({ total: d.length, table, ok, mismatch: bad.length, ops, steps, sample }, null, 1));
}
