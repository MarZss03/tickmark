// Tickmark search: one matcher for every case and page. Pure functions, no DOM, so the tests run it in Node.
// A document is { id, kind, title, route, fields: [{ label, text, weight }], amounts: [n], facets: {}, rank }.
// Every word of the query has to match somewhere (AND). IDs match in pieces ("1028", "PO-1028"), amounts
// match by value ("$6,850", "6850.00"), longer words forgive one typo, and a few plain words stand in for
// the system's own ("short" finds "less" and "differs"). Filters: owner:sam  in:payroll  is:open|closed|mine|overdue
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkSearch = api;
})(typeof self !== 'undefined' ? self : this, () => {
  // lower case, accents off, curly apostrophes straight, one character for one, so match positions fit the original text
  const norm = (s) => String(s ?? '').split('').map((ch) => {
    if (ch === '’') return "'";
    const n = ch.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return n.length === 1 ? n : ch;
  }).join('');
  // a word may hold an apostrophe ("payout's" → payouts) or a number its separators ("6,850.00")
  const TOKEN = /[a-z0-9]+(?:'[a-z]+)*(?:[.,][0-9]+)*/g;
  const NUMERIC = /^[0-9]+(?:[.,][0-9]+)*$/;
  const numOf = (t) => (NUMERIC.test(t) ? Number(t.replace(/,/g, '')) : null);

  // words people use for what the records call something else
  const SYN = {
    short: ['less', 'short'],
    missing: ['not', 'no', 'missing'],
    late: ['late', 'overdue', 'after'],
    twice: ['twice', 'duplicate', 'identical'],
    double: ['twice', 'duplicate', 'identical'],
    duplicate: ['twice', 'duplicate', 'identical'],
    chargeback: ['chargeback', 'chargebacks', 'dispute', 'deduction'],
    dispute: ['dispute', 'chargeback'],
    held: ['reserve', 'held', 'hold'],
    hold: ['reserve', 'held', 'hold'],
    fee: ['fee', 'fees'],
    loan: ['loan', 'mortgage'],
    house: ['loan', 'mortgage', 'payout'],
    employee: ['employee', 'pay', 'payroll'],
    salary: ['pay', 'payroll'],
  };
  const FILTERS = ['owner', 'in', 'is'];

  // a field's words with where they sit, so a match can be marked in the text
  function words(text) {
    const n = norm(text), out = [];
    let m; TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(n))) { const t = m[0].replace(/'/g, ''); out.push({ t, at: m.index, end: m.index + m[0].length, n: numOf(t) }); }
    return out;
  }
  // at most one edit (insert, delete, swap a letter) between a and b
  function near(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++;
      else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  // one query part against one word: 3 exact, 1.5 starts the word, 1 one typo away; 0 no match
  function wordScore(q, w, last) {
    if (q.n != null && w.n != null) {
      if (q.n === w.n) return 3;
      // an ID-like number (no comma or decimal) can be typed in part: "102" → "1028"
      return last && !/[.,]/.test(w.t) && !/[.,]/.test(q.t) && w.t.startsWith(q.t) ? 2 : 0;
    }
    if (q.t === w.t) return 3;
    if (last && w.t.startsWith(q.t) && (q.t.length >= 2 || w.t.length === 1)) return 1.5;
    if (q.n == null && q.t.length >= 5 && /^[a-z]+$/.test(q.t)) {
      if (near(q.t, w.t) || (w.t.length > q.t.length && near(q.t, w.t.slice(0, q.t.length)))) return 1;
    }
    return 0;
  }
  // a typed word may be several parts ("PO-1028" → po, 1028); the parts must sit next to each other
  function phrase(parts, ws) {
    let best = null;
    for (let i = 0; i + parts.length <= ws.length; i++) {
      let s = 0;
      for (let k = 0; k < parts.length; k++) {
        const v = wordScore(parts[k], ws[i + k], k === parts.length - 1);
        if (!v) { s = 0; break; }
        s += v;
      }
      if (s && (!best || s > best.s)) best = { s: s / parts.length, at: ws[i].at, end: ws[i + parts.length - 1].end };
    }
    return best;
  }

  function parse(q) {
    const terms = [], filters = [];
    for (const raw of String(q || '').trim().split(/\s+/).filter(Boolean)) {
      const f = /^([a-z]+):(.+)$/i.exec(raw);
      if (f && FILTERS.includes(f[1].toLowerCase())) { filters.push({ key: f[1].toLowerCase(), value: norm(f[2]) }); continue; }
      const parts = words(raw.replace(/^\$/, '')).map(({ t, n }) => ({ t, n }));
      if (parts.length) terms.push({ raw, parts });
    }
    return { terms, filters };
  }

  function facetOk(doc, f) {
    const v = doc.facets && doc.facets[f.key];
    if (v == null) return false;
    const vals = Array.isArray(v) ? v : [v];
    return vals.some((x) => words(x).some((w) => w.t.startsWith(f.value)) || norm(x).startsWith(f.value));
  }

  // one typed word against a document: its best field, how good, and where
  function termHit(doc, term) {
    let best = null;
    const tryParts = (parts, factor, syn) => {
      for (const fd of doc.fields) {
        const ws = fd._w || (fd._w = words(fd.text));
        const m = phrase(parts, ws);
        if (!m) continue;
        const score = m.s * (fd.weight || 1) * factor;
        if (!best || score > best.score) best = { score, field: fd, at: m.at, end: m.end, syn };
      }
    };
    tryParts(term.parts, 1, false);
    // a typed amount also finds the amounts in the records
    const n = term.parts.length === 1 ? term.parts[0].n : null;
    if (n != null && (doc.amounts || []).some((a) => Math.abs(Math.abs(a) - n) < 0.005)) {
      const score = 3 * 4;
      if (!best || score > best.score) best = { score, field: { label: 'Amount', text: doc.money ? doc.money(n) : String(n) }, at: -1, end: -1 };
    }
    if (term.parts.length === 1 && SYN[term.parts[0].t]) {
      for (const s of SYN[term.parts[0].t]) if (s !== term.parts[0].t) tryParts([{ t: s, n: null }], 0.8, true);
    }
    return best;
  }

  function search(docs, q, { limit = 50 } = {}) {
    const p = parse(q);
    if (!p.terms.length && !p.filters.length) return { ...p, results: [] };
    const results = [];
    for (const doc of docs) {
      if (!p.filters.every((f) => facetOk(doc, f))) continue;
      let score = 0;
      const hits = [];
      let all = true;
      for (const term of p.terms) {
        const h = termHit(doc, term);
        if (!h) { all = false; break; }
        score += h.score;
        hits.push(h);
      }
      if (!all) continue;
      // an exact ID wins outright
      if (p.terms.length === 1 && norm(doc.id) === norm(p.terms[0].raw)) score += 100;
      results.push({ doc, score, hits: group(hits) });
    }
    results.sort((a, b) => b.score - a.score || (a.doc.rank || 0) - (b.doc.rank || 0) || String(a.doc.id).localeCompare(String(b.doc.id)));
    return { ...p, results: results.slice(0, limit), total: results.length };
  }
  // the same field matched by several words shows once, with each match marked
  function group(hits) {
    const by = new Map();
    for (const h of hits) {
      const k = h.field.label + '\u0000' + h.field.text;
      if (!by.has(k)) by.set(k, { label: h.field.label, text: h.field.text, marks: [], syn: false });
      const g = by.get(k);
      if (h.at >= 0) g.marks.push([h.at, h.end]);
      g.syn = g.syn || h.syn;
    }
    return [...by.values()];
  }

  // text with its matches wrapped in <mark>; esc makes each piece safe for HTML.
  // Positions come from the normalised text, which keeps one character for one.
  function mark(text, marks, esc) {
    const s = String(text ?? '');
    const m = (marks || []).slice().sort((a, b) => a[0] - b[0]);
    if (!m.length) return esc(s);
    let out = '', i = 0;
    for (const [a, b] of m) { if (a < i) continue; out += esc(s.slice(i, a)) + '<mark>' + esc(s.slice(a, b)) + '</mark>'; i = b; }
    return out + esc(s.slice(i));
  }

  // a long field cut to about n characters around its first match, with the marks moved to fit
  function snippet(text, marks, n = 110) {
    const s = String(text ?? '');
    if (s.length <= n) return { text: s, marks: marks || [] };
    const first = (marks || []).slice().sort((a, b) => a[0] - b[0])[0];
    let a = first ? Math.max(0, first[0] - Math.floor(n / 3)) : 0;
    if (a > 0) { const sp = s.indexOf(' ', a); a = sp > 0 && sp < (first ? first[0] : a + 20) ? sp + 1 : a; }
    let b = Math.min(s.length, a + n);
    if (b < s.length) { const sp = s.lastIndexOf(' ', b); if (sp > (first ? first[1] : a)) b = sp; }
    const pre = a > 0 ? '…' : '', post = b < s.length ? '…' : '';
    const moved = (marks || []).filter(([x, y]) => x >= a && y <= b).map(([x, y]) => [x - a + pre.length, y - a + pre.length]);
    return { text: pre + s.slice(a, b) + post, marks: moved };
  }

  // ---------- the cases as documents, rebuilt for each query so they follow the demo and the viewer ----------
  // Evidence the viewer cannot open is left out, so search never names what the case page would hide.
  const REF = { payouts: 'Payout', mortgage: 'Loan', payroll: 'Employee', close: 'Close item' };
  const RANK = { P1: 0, P2: 1, P3: 2, P4: 3 };
  function caseDocs(state, D, C, { me, modules = {}, store = {}, money = String } = {}) {
    const name = (p) => (D.people[p] ? D.people[p].name : p);
    const team = (t) => (D.teams[t] ? D.teams[t].name : t);
    return state.order.map((id) => {
      const c = state.cases[id];
      const x = c.exceptions.find((y) => y.status === 'open');
      const headline = x ? (x.headline || x.title) : c.title;
      const tasks = c.tasks.map((t) => state.tasks[t]);
      const ref = c.module === 'cash' ? null : String(c.key).split(':')[1];
      const m = modules[c.module] || { label: c.module, short: c.module };
      const f = (label, text, weight) => (text ? [{ label, text: String(text), weight }] : []);
      const sv = c.module === 'payouts' && ref && store[ref];
      const fields = [
        ...f('Case', c.id, 10),
        ...f(REF[c.module] || 'Reference', ref, 8),
        ...f('Finding', headline, 5),
        ...(c.title !== headline ? f('Case', c.title, 4) : []),
        ...c.exceptions.flatMap((y) => f(y.status === 'open' ? 'Exception' : 'Resolved', `${y.short || y.title} · ${String(y.code).replace(/_/g, ' ').toLowerCase()}`, y.status === 'open' ? 4 : 2)),
        ...c.exceptions.filter((y) => y.status === 'open' && y.headline && y.title && y.title !== y.headline).flatMap((y) => f('Finding', y.title, 3)),
        ...f('Owner', name(c.owner), 3),
        ...tasks.flatMap((t) => f('Check', `${t.id} · ${t.assignee ? name(t.assignee) + ', ' : ''}${team(t.team)} · ${t.question}`, 2)),
        ...f('Queue', `${m.label} · ${m.short}`, 2),
        ...c.evidence.filter((e) => C.seesEvidence(D, me, e)).flatMap((e) => f('Evidence', e.label, 2)),
        ...f('Priority', C.effectivePriority(c), 1),
        ...f('Affects', c.affects, 1),
        ...f('Opened because', c.openedBecause, 1),
        ...(sv ? [sv.head, sv.found, sv.maybe, sv.todo].flatMap((t) => f('Store owner view', t, 1.5)) : []),
      ];
      const amounts = [];
      const walk = (v) => { if (typeof v === 'number') { if (Math.abs(v) >= 1 && (!Number.isInteger(v) || Math.abs(v) >= 100)) amounts.push(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      walk(c.records); if (typeof c.amount === 'number') amounts.push(c.amount);
      const rw = C.row(state, D, c);
      const mine = c.owner === me || tasks.some((t) => t.assignee === me && t.status !== 'closed');
      const pri = C.effectivePriority(c);
      return {
        id: c.id, kind: 'case', title: headline, route: 'case/' + c.id, module: c.module, fields, amounts, money,
        facets: { owner: [name(c.owner), c.owner], in: [m.label, m.short, c.module], is: [c.closed ? 'closed' : 'open', ...(mine ? ['mine'] : []), ...(rw.overdue ? ['overdue'] : []), pri.toLowerCase()] },
        rank: (c.closed ? 10 : 0) + (RANK[pri] ?? 3),
      };
    });
  }

  return { search, parse, mark, snippet, near, words, caseDocs, SYN };
});
