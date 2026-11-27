// Tickmark Hybrid: the data boundary ledger. Every AI call is recorded with what it was for, the data class,
// the policy and mode, where it actually ran (as reported by Firebase AI Logic), how long it took, and the
// exact text that left the device, or a note that nothing did. Kept in this browser only.
const KEY = 'tickmark.hybrid.ledger.v1';
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-200))); } catch { /* private mode: keep in memory */ }
}

let rows = load();

export function record(entry) {
  const row = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  rows = [...rows, row];
  save(rows);
  listeners.forEach((fn) => fn(rows, row));
  return row;
}
export const all = () => rows.slice();
export function clear() { rows = []; save(rows); listeners.forEach((fn) => fn(rows, null)); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Totals for the boundary summary: calls on device, calls in the cloud, characters that left the device.
export function summary() {
  const s = { total: rows.length, onDevice: 0, inCloud: 0, blocked: 0, charsLeft: 0 };
  rows.forEach((r) => {
    if (r.ranOn === 'on_device') s.onDevice++;
    else if (r.ranOn === 'in_cloud') { s.inCloud++; s.charsLeft += (r.leftDevice || '').length; }
    else if (r.ranOn === 'blocked') s.blocked++;
  });
  return s;
}
