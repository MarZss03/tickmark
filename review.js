// Tickmark Workbench: My Work, the business queues and Case Review. The rules live in cases.js and
// case-rules.js; this file routes, renders them, keeps the demo in this browser, and writes to the audit log.
(() => {
  const E = window.TickmarkEngine, C = window.TickmarkCases, TMC = window.TMC;
  const A = window.TickmarkCaseRules(E, window.TM, TMC);
  const D = TMC.dir, S = window.TickmarkSearch;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const app = window.tmApp || {};
  const PERIOD = { start: '2026-10-01', end: '2026-10-15' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- the businesses ----------
  const MODULES = {
    close: { label: 'Month-end Close', short: 'Close', scan: 'Re-run close checks', other: { route: 'checks/close', view: 'close', label: 'Checks' }, intro: 'October 2026 close · business day 3 of 5' },
    payroll: { label: 'Payroll', short: 'Payroll', scan: 'Run payroll checks', other: { route: 'checks/payroll', view: 'payroll', label: 'Checks' }, intro: 'Pay period 1–15 Oct 2026' },
    cash: { label: 'Cash Reconciliation', short: 'Cash', scan: 'Run the bank match', other: { route: 'reports/cash', view: 'cash', label: 'Reports' }, intro: 'Operating account against GL 1010 · October' },
    mortgage: { label: 'Mortgage Servicing', short: 'Mortgage', scan: 'Run servicing checks', intro: 'Payouts, discharges and transfers' },
    payouts: { label: 'Merchant Payouts', short: 'Payouts', scan: 'Match payouts to the bank', intro: 'Payment-processor payouts against the store’s bank account' },
  };
  const CLS = { 'source-error': 'Suspected source error', timing: 'Timing or sync gap', business: 'Real business difference', insufficient: 'Not enough evidence' };
  const STATUS = { open: 'Open', waiting: 'Waiting on a check', 'reply-in': 'Reply to review', resolved: 'Nothing open', closed: 'Closed' };
  const TASK = { open: 'Waiting to be claimed', claimed: 'With the handler', clarify: 'Handler asked a question', 'more-info': 'Sent back for more', returned: 'Returned', replied: 'Reply in', closed: 'Closed' };
  const PRI = { P1: 'neg', P2: 'warn', P3: '', P4: 'ok' };
  const at = (s) => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toUTCString().slice(0, 11).replace(',', '') + ' ' + d.toISOString().slice(11, 16) + ' UTC'; };
  const day = (s) => { if (!s) return '—'; const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? s : d.toUTCString().slice(5, 16).replace(/^0/, ''); };
  const name = (pid) => (D.people[pid] ? D.people[pid].name : pid);
  const team = (t) => (D.teams[t] ? D.teams[t].name : t);
  const money = (v, cur = true) => (cur ? '$' : '') + E.money(Math.abs(v));
  const MONEY_KEYS = ['balance', 'payout_amount', 'amount', 'gross', 'prepay', 'old_balance', 'per_diem', 'deposit', 'fees', 'net'];
  const showVal = (v, mod, key) => (typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 100 && !MONEY_KEYS.includes(key) ? String(v) : money(v, mod !== 'payroll')) : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? day(v) : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(String(v)) ? `${day(v)} ${String(v).slice(11, 16)}` : String(v));

  // ---------- the demo, saved in this browser ----------
  const KEY = 'tickmark:cases:v1', AS = 'tickmark:as', FKEY = 'tickmark:filters';
  const SOURCES = {
    cash: () => ({ bank: window.TM.bank, gl: window.TM.gl, window: +($('#cash-window') ? $('#cash-window').value : 3) }),
    payroll: () => ({ hris: window.TM.hris, payroll: window.TM.payroll, equity: window.TM.equity, period: PERIOD }),
    mortgage: () => ({}),
    close: () => ({ exceptions: window.TM.close }),
    payouts: () => ({}),
  };
  const live = Object.keys(SOURCES).filter((m) => A[m]);
  let state = null;
  function fresh() { const s = C.newState(); for (const m of live) C.sync(s, D, A, m, SOURCES[m]()); return s; }
  try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { state = null; }
  if (!state || state.v !== 1) state = fresh();
  // a session saved before a module existed gets that module's cases, and keeps everything else
  for (const m of live) if (!state.order.some((id) => state.cases[id].module === m)) C.sync(state, D, A, m, SOURCES[m]());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  save();
  let me = 'ava';
  try { me = localStorage.getItem(AS) || 'ava'; } catch {}
  if (!D.people[me]) me = 'ava';
  let filters = {};
  try { filters = JSON.parse(sessionStorage.getItem(FKEY) || '{}') || {}; } catch { filters = {}; }
  const ui = { route: { page: 'mywork' }, form: null, msg: '', busy: false, escTo: null, guided: false };
  const log = (event, detail) => app.log && app.log(name(me), event, detail);
  const cases = () => state.order.map((id) => state.cases[id]);
  const caseByKey = (k) => cases().find((c) => c.key === k);
  const topX = (c) => c.exceptions.find((x) => x.status === 'open');
  const headline = (c) => { const x = topX(c); return x ? (x.headline || x.title) : c.title; };

  // ---------- routes: every page has an address, so refresh and links land in the same place ----------
  function parse(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (h === '' || h === 'home' || h === 'top') return { page: 'home' };
    if (h === 'contact') return { page: 'home', contact: true };
    if (h === 'case-study') { location.replace('notes'); return { page: 'home' }; }
    if (h === 'try') return { page: 'case', try: true };
    if (h === 'try/store') return { page: 'store', explain: true };
    if (h === 'store') return { page: 'store' };
    if (h === 'validation' || h === 'lab') return { page: 'view', view: 'eval', label: 'Model evaluation', demo: true };
    if (h === 'control' || h === 'demo/control') return { page: 'view', view: 'control', label: 'Journal entry control', demo: true };
    if (h === 'search' || h.startsWith('search/')) { let q = h.slice(7); try { q = decodeURIComponent(q); } catch {} return { page: 'search', q }; }
    const [a, b] = h.split('/');
    if (a === 'queue' && MODULES[b]) return { page: 'queue', module: b };
    if (a === 'case' && b) return { page: 'case', id: decodeURIComponent(b) };
    if ((a === 'checks' || a === 'reports') && MODULES[b]) return { page: 'other', module: b };
    if (a === 'imports') return { page: 'view', view: 'mine', label: 'Data & Imports' };
    if (a === 'audit') return { page: 'view', view: 'audit', label: 'Audit Log' };
    if (a === 'demo' && ['filings', 'eval', 'stress'].includes(b)) return { page: 'view', view: { filings: 'sec', eval: 'eval', stress: 'stress' }[b], label: { filings: 'Public filings', eval: 'Model evaluation', stress: 'Stress test' }[b], demo: true };
    return { page: 'mywork' };
  }
  const hashOf = (r) => (r.page === 'home' ? (r.contact ? '#contact' : '#home') : r.page === 'search' ? '#search' + (r.q ? '/' + encodeURIComponent(r.q) : '') : r.page === 'store' ? (r.explain ? '#try/store' : '#store') : r.page === 'queue' ? `#queue/${r.module}` : r.page === 'case' ? (r.try ? '#try' : `#case/${encodeURIComponent(r.id)}`) : r.page === 'other' ? '#' + MODULES[r.module].other.route : r.page === 'view' ? { mine: '#imports', audit: '#audit', sec: '#demo/filings', eval: '#demo/eval', stress: '#demo/stress', control: '#demo/control' }[r.view] : '#workbench');
  // four experiences, one page: the home screen, the workbench, the guided demo, and the lab
  const modeOf = (r) => (r.page === 'home' ? 'home' : (r.page === 'case' && r.try) || (r.page === 'store' && r.explain) ? 'try' : r.page === 'store' ? 'store' : r.page === 'view' && r.demo ? 'lab' : 'app');
  const isTry = () => modeOf(ui.route) === 'try';
  function go(r, { replace = false } = {}) {
    const h = hashOf(r);
    if (location.hash !== h) { try { history[replace ? 'replaceState' : 'pushState'](null, '', h); } catch { location.hash = h; } }
    apply(r);
  }
  let closeRan = false;
  function apply(r) {
    const root = document.documentElement, next = modeOf(r.page === 'case' && r.try ? { page: 'case', try: true } : r);
    if (root.dataset.mode && root.dataset.mode !== next && document.startViewTransition && !document.hidden) { document.startViewTransition(() => applyNow(r)); return; }
    applyNow(r);
  }
  function applyNow(r) {
    if (r.page === 'case' && r.try) { const c = caseByKey(TRY_KEY); r = { page: 'case', id: c.id, try: true }; if (!c.tasks.length && !c.closed) setMe('ava'); }
    ui.guided = !!(r.page === 'case' && r.try);
    if (r.page === 'case' && !state.cases[r.id]) r = { page: 'mywork' };
    if (r.page !== 'case' || r.id !== ui.route.id) { ui.form = null; ui.msg = ''; }
    ui.route = r;
    const mode = modeOf(r), root = document.documentElement, was = root.dataset.mode;
    root.dataset.mode = mode;
    root.classList.toggle('show-contact', !!r.contact);
    if (was && was !== mode && !r.contact) window.scrollTo({ top: 0, behavior: 'instant' });
    if (r.contact) requestAnimationFrame(() => { const ct = $('#contact'); if (ct) ct.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); });
    const view = r.page === 'other' ? MODULES[r.module].other.view : r.page === 'view' ? r.view : 'queue';
    if (app.setView) app.setView(view);
    // the close run fires once, on the page that shows it, not on whatever page is open
    if (view === 'close' && !closeRan) { closeRan = true; const run = $('#run-close'); if (run && run.textContent.trim() === 'Run close controls') setTimeout(() => run.click(), 250); }
    render();
  }
  window.addEventListener('popstate', () => apply(parse(location.hash)));
  window.addEventListener('hashchange', () => apply(parse(location.hash)));
  // from the home screen, the workbench is a different screen, not a scroll away
  const toWorkbench = () => { if (modeOf(ui.route) === 'home') go({ page: 'mywork' }); };
  const toSheet = () => { const s = $('#sheet'); if (!s) return; const top = s.getBoundingClientRect().top; if (top < 60 || top > innerHeight * 0.5) window.scrollTo({ top: top + window.scrollY - 76, behavior: reduced ? 'auto' : 'smooth' }); };

  // ---------- a step, its result, and a fresh render ----------
  function run(fn, okMsg) {
    if (ui.busy) return;
    ui.busy = true;
    try {
      const r = fn();
      if (r && r.ok === false) ui.msg = r.error + (r.suggest ? ` Authorised: ${r.suggest.map((p) => `${p.name} (${team(p.team)})`).join(', ')}.` : '');
      else { ui.msg = ''; ui.form = null; save(); if (okMsg) log(okMsg[0], okMsg[1]); }
    } finally {
      ui.busy = false; render();
      if (!ui.msg && ui.route.page === 'case') { const p = $('.cs-primary'); if (p) flash(p); }
    }
  }
  function flash(el) { el.classList.remove('rq-spot'); void el.offsetWidth; el.classList.add('rq-spot'); }

  // ---------- page head: where you are ----------
  function headHtml(r) {
    if (r.page === 'case' || r.page === 'home') return '';
    if (r.page === 'search') return `<header class="pg-h"><div><h3 class="pg-t">Search</h3><p class="pg-s">Every case in the five queues, as ${esc(name(me))} sees them · demo clock ${esc(at(state.now))}</p></div></header>`;
    if (r.page === 'store' && r.explain) return `${demoBar('Store owner', 1, 1)}<header class="pg-h"><div><h3 class="pg-t">Why is my payout different?</h3><p class="pg-s">You are ${esc(SV.owner)}, who runs ${esc(SV.store)}. Pick a payout, read what the records say, then open the source that settles it.</p></div></header>`;
    if (r.page === 'store') return `<header class="pg-h"><div><h3 class="pg-t">Payouts</h3><p class="pg-s">${esc(SV.store)} · since 28 Oct</p></div><div class="pg-a"><button type="button" class="link-btn sm" data-do="svreset">Reset demo</button></div></header>`;
    if (r.page === 'mywork') return `<header class="pg-h"><div><h3 class="pg-t">My Work</h3><p class="pg-s">${esc(name(me))} · ${esc(team(D.people[me].team))}</p></div>
      <div class="pg-a"><button type="button" class="link-btn sm" data-do="reset">Reset demo</button></div></header>`;
    if (r.page === 'view') return `<header class="pg-h"><div><h3 class="pg-t">${esc(r.label)}</h3>${r.demo ? `<p class="pg-s">Demo Lab · ${{ sec: 'Real public filings from SEC EDGAR, checked by the same kind of rules', eval: 'Scores carried over from Run Replay, and a grader on public FinQA questions', stress: 'Plant known errors into the sample payroll and count what the rules catch', control: 'One journal entry, four checks; change an amount and see what blocks it' }[r.view] || ''}</p>` : ''}</div></header>`;
    const m = MODULES[r.module];
    const n = cases().filter((c) => c.module === r.module && !c.closed && c.exceptions.some((x) => x.status === 'open')).length;
    const tabs = m.other ? `<nav class="pg-tabs" aria-label="${esc(m.label)} pages"><a href="#queue/${r.module}" data-route="queue/${r.module}"${r.page === 'queue' ? ' aria-current="page"' : ''}>Queue</a><a href="#${m.other.route}" data-route="${m.other.route}"${r.page === 'other' ? ' aria-current="page"' : ''}>${m.other.label}</a></nav>` : '';
    return `<header class="pg-h"><div><h3 class="pg-t">${esc(m.label)}</h3><p class="pg-s">${n} open case${n === 1 ? '' : 's'} · ${esc(m.intro)}</p></div>
      <div class="pg-a">${r.page === 'queue' ? `<button type="button" class="b-sec" data-do="scan" data-m="${r.module}">${esc(m.scan)}</button>` : ''}</div></header>${tabs}`;
  }
  // the guided demo has its own bar: where you are in it, and the ways out
  function demoBar(kind, n, total, done) {
    return `<div class="demo-bar" role="region" aria-label="Guided demo"><p><b>Guided demo</b> · ${esc(kind)}${total > 1 ? ` · ${done ? 'done' : `step ${n} of ${total}`}` : ''}</p>
      <div class="demo-acts"><button type="button" class="link-btn sm" data-do="${kind === 'Store owner' ? 'svreset' : 'tryreset'}">Start over</button><a class="link-btn sm" href="${kind === 'Store owner' ? '#store' : '#workbench'}" data-route="${kind === 'Store owner' ? 'store' : 'mywork'}">${kind === 'Store owner' ? 'Normal view' : 'Normal workbench'}</a><a class="link-btn sm" href="#home" data-route="home">Exit demo</a></div></div>`;
  }

  // ---------- My Work ----------
  function myWorkHtml() {
    const w = C.myWork(state, D, A, me);
    const row = (it, kind) => {
      const c = state.cases[it.caseId], t = it.task && state.tasks[it.task];
      const p = it.action || (t ? C.primaryAction(state, D, A, c.id, me) : null);
      const due = t ? t.due : c.due;
      const late = t && C.isOverdue(state, t);
      return `<li><a class="mw-row" href="#case/${encodeURIComponent(c.id)}" data-route="case/${esc(c.id)}">
        <span class="mw-main"><b>${esc(t && kind !== 'waiting' ? t.question : headline(c))}</b><span class="mw-meta">${c.id} · ${esc(MODULES[c.module].short)}${t && kind !== 'waiting' ? ` · ${esc(headline(c))}` : ''}</span></span>
        <span class="mw-next">${p ? esc(p.label) : ''}</span>
        <span class="mw-due${late ? ' late' : ''}">${late ? 'Overdue · ' : ''}${esc(at(due))}</span></a></li>`;
    };
    const sec = (title, items, kind, empty, note) => `<section class="mw-s"><h4 title="${esc(note)}">${title} <span class="count">${items.length}</span></h4>
      ${items.length ? `<ul class="mw-list">${items.map((it) => row(it, kind)).join('')}</ul>` : `<p class="d-empty">${empty}</p>`}</section>`;
    return `<div class="mw">
      ${sec('Needs my action', w.needs, 'needs', 'Nothing waits on you.', 'Cases you own, or decisions only you can make')}
      ${sec('Assigned to me', w.assigned, 'assigned', 'No checks assigned to you.', 'Checks sent to you by name, or ones you claimed')}
      ${sec('Team inbox', w.inbox, 'inbox', `Nothing for ${esc(team(D.people[me].team))} to claim.`, `Checks sent to ${team(D.people[me].team)}; anyone in the team can claim one`)}
      ${sec('Waiting on others', w.waiting, 'waiting', 'You are not waiting on anyone.', 'Your cases and checks that are with someone else')}
    </div>`;
  }


  // ---------- search: every case in every queue, from one box ----------
  // The matcher lives in search.js. Documents are rebuilt per query, so status and checks are current and
  // evidence this viewer cannot open is never searched or shown.
  const searchDocs = () => S.caseDocs(state, D, C, { me, modules: MODULES, store: (TMC.storeView || {}).payouts || {}, money: (v) => money(v) });
  const EXAMPLES = [['PO-1028', 'A payout ID'], ['$300', 'An amount'], ['owner:sam', 'Whose cases'], ['twice', 'A plain word'], ['is:overdue', 'Late checks'], ['in:mortgage birchwood', 'One queue']];
  const FILTER_L = { owner: 'owner', in: 'queue', is: 'is' };
  function searchHtml(q) {
    const ex = `<p class="sr-ex"><span class="c-s">Try</span> ${EXAMPLES.map(([v, l]) => `<button type="button" class="sr-chip" data-do="sq" data-q="${esc(v)}" title="${esc(l)}">${esc(v)}</button>`).join('')}</p>`;
    const how = '<p class="c-s sr-how">Every word has to match. IDs match in part (1028), amounts by value ($6,850 or 6850), longer words forgive one typo. Filters: <code>owner:</code> <code>in:</code> <code>is:open</code> <code>closed</code> <code>mine</code> <code>overdue</code> <code>p1</code></p>';
    if (!String(q || '').trim()) return `<div class="sr-empty"><p>Search every case in all five queues by case or payout ID, loan or employee number, person, amount, or a plain word.</p>${ex}${how}</div>`;
    const r = S.search(searchDocs(), q);
    if (!r.results.length) return `<div class="sr-empty"><p>No case matches “${esc(q)}”.</p>${ex}${how}</div>`;
    const rows = r.results.map(({ doc, hits }) => {
      const c = state.cases[doc.id], [tone, st] = workStatus(c), pri = C.effectivePriority(c);
      const th = hits.find((h) => h.label === 'Finding' && h.text === doc.title);
      const oh = hits.find((h) => h.label === 'Owner');
      const why = hits.filter((h) => h !== th && h !== oh).slice(0, 3).map((h) => { const sn = S.snippet(h.text, h.marks); return `<span><i>${esc(h.label)}</i> ${S.mark(sn.text, sn.marks, esc)}${h.syn ? ' <em>similar word</em>' : ''}</span>`; });
      return `<li><a class="sr-row" href="#case/${encodeURIComponent(c.id)}" data-route="case/${esc(c.id)}">
        <span class="sr-main"><b>${th ? S.mark(doc.title, th.marks, esc) : esc(doc.title)}</b><span class="sr-meta">${c.id} · ${esc(MODULES[c.module].short)} · ${oh ? S.mark(oh.text, oh.marks, esc) : esc(name(c.owner))}${c.closed ? '' : ` · <span class="pill ${PRI[pri]}">${pri}</span>`}</span>${why.length ? `<span class="sr-why">${why.join('')}</span>` : ''}</span>
        <span class="st ${tone}">${esc(st)}</span></a></li>`;
    }).join('');
    const fl = r.filters.length ? ` · ${r.filters.map((f) => `${FILTER_L[f.key]}: ${esc(f.value)}`).join(', ')}` : '';
    return `<p class="sr-n" aria-live="polite">${r.total} case${r.total === 1 ? '' : 's'} for “${esc(q)}”${fl} <span class="c-s">· open first · Enter opens the top one</span></p><ol class="sr-list">${rows}</ol>`;
  }
  // the palette (motion.js) shows the first few cases above its pages
  window.tmSearchCases = (q, n = 5) => {
    const r = S.search(searchDocs(), q, { limit: n });
    return { total: r.total || 0, items: r.results.map(({ doc, hits }) => { const th = hits.find((h) => h.label === 'Finding' && h.text === doc.title); return { id: doc.id, html: th ? S.mark(doc.title, th.marks, esc) : esc(doc.title), sub: esc(`${doc.id} · ${MODULES[doc.module].short}${th || !hits[0] ? '' : ` · ${S.snippet(hits[0].text, [], 34).text}`}`) }; }) };
  };

  // ---------- the store owner's view: one person, one screen, plain language ----------
  // Read-only over the same synthetic payouts. Facts come from the records; a possible reason stays
  // marked as not confirmed until the owner reads the source that settles it.
  const SV = TMC.storeView, SKEY = 'tickmark:store';
  let sv = { sel: 'PO-1028', seen: {} };
  try { sv = { ...sv, ...(JSON.parse(sessionStorage.getItem(SKEY) || '{}') || {}) }; } catch {}
  const saveSv = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(sv)); } catch {} };
  const rawPayout = (id) => (TMC.payouts || []).find((m) => m.key === 'po:' + id);
  // apply a source's corrections to a copy of the payout and bank lines
  function storeRecords(id) {
    const m = rawPayout(id), r = JSON.parse(JSON.stringify(m.records));
    if (sv.seen[id]) {
      const [kind, itemId] = SV.payouts[id].reveal.split(':');
      const item = (m[kind === 'inbox' ? 'inbox' : 'available'] || []).find((i) => i.id === itemId);
      for (const p of (item && item.patch) || []) {
        const keys = p.path.split('.'); let o = r;
        for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[keys[i]]; }
        o[keys[keys.length - 1]] = p.value;
      }
    }
    return r;
  }
  // which records the page read, the settling source once it has been read
  function storeSources(id) {
    const m = rawPayout(id), list = m.evidence.map((e) => e.label);
    if (!(m.records.deposits || []).length && !sv.seen[id]) list.push('bank statement to 4 Nov (no deposit)');
    else if (!m.evidence.some((e) => e.origin === 'bank') && !sv.seen[id]) list.push('bank statement');
    if (sv.seen[id]) { const [kind, itemId] = SV.payouts[id].reveal.split(':'); const it = (m[kind === 'inbox' ? 'inbox' : 'available'] || []).find((i) => i.id === itemId); if (it) list.push(it.evidence.label); }
    return list;
  }
  const daysTo = (d) => Math.round((Date.parse(d + 'T23:59:00Z') - Date.parse(state.now)) / 864e5);
  function storeHtml() {
    const ids = Object.keys(SV.payouts);
    if (!SV.payouts[sv.sel]) sv.sel = ids[0];
    const open = ids.filter((id) => !sv.seen[id]).length;
    const due = ids.filter((id) => sv.seen[id] && SV.payouts[id].deadline);
    const list = ids.map((id) => {
      const v = SV.payouts[id], r = storeRecords(id), p = r.payout, seen = !!sv.seen[id];
      const on = id === sv.sel, chip = seen ? v.chipAfter : v.chip;
      // one payout is shown at a time: a radio group, named in full for screen readers
      return `<li role="none"><button type="button" role="radio" class="sv-p${on ? ' on' : ''}" data-do="sv" data-p="${id}" aria-checked="${on}" tabindex="${on ? 0 : -1}" aria-controls="sv-h" aria-label="${esc(`Payout ${id}, ${day(p.date)}, ${money(p.total)}: ${chip}`)}">
        <span class="sv-pid">${id} · ${esc(day(p.date))}</span><span class="sv-amt">${money(p.total)}</span>
        <span class="st ${seen ? (v.deadline ? 'warn' : 'ok') : v.tone}">${esc(seen ? v.chipAfter : v.chip)}</span></button></li>`;
    }).join('');
    const explain = !!ui.route.explain;
    return `<div class="sv">
      <p class="sv-lead"><b>${open ? `${open} of ${ids.length} need${open === 1 ? 's' : ''} a look` : 'All explained'}</b>${due.length ? ` · ${due.map((id) => `${SV.payouts[id].deadlineLabel.toLowerCase()} ${day(SV.payouts[id].deadline)}`).join(', ')}` : ''}${explain ? '. Each payout compares what the payment processor says it sent with what reached your bank.' : ''}</p>
      <div class="sv-grid"><ul class="sv-list" role="radiogroup" aria-label="Payouts">${list}</ul>${explain ? storeCard(sv.sel) : storePlain(sv.sel)}</div>
      ${importHtml()}
      ${explain ? `<p class="sv-ask">Run a store, or keep books for one? <a href="#contact" data-feedback>Tell me which payout was unclear</a>. It goes to Martin, and changes land in the build log.</p>
      <p class="sv-foot c-s">Simulated: ${esc(SV.store)} is a fictional store, and the payout report and bank statement are synthetic. The wording is written by fixed rules, not a model.</p>` : `<p class="sv-foot c-s">Fictional store · synthetic payouts · <a href="#try/store" data-route="try/store">Guided version</a></p>`}
    </div>`;
  }
  // the everyday view: the numbers, one line on the cause, and the next step; the reasoning on request
  function storePlain(id) {
    const v = SV.payouts[id], r = storeRecords(id), p = r.payout, seen = !!sv.seen[id];
    const dep = (r.deposits || [])[0];
    const row = (l, val, note, cls = '') => `<tr class="${cls}"><td>${esc(l)}${note ? ` <span class="c-s">· ${esc(note)}</span>` : ''}</td><td class="num">${val == null ? '—' : (val < 0 ? '−' : '') + money(val)}</td></tr>`;
    // only the lines that move this payout away from plain sales minus fees
    const lines = [];
    if (p.refunds && r.doubleRefund) lines.push(row('Refunds', p.refunds, 'includes a duplicate'));
    for (const a of p.adjustments || []) lines.push(row(a.type === 'chargeback' ? 'Chargeback' : 'Adjustment', a.amount, a.ref || ''));
    if (p.reserve) lines.push(row('Reserve', p.reserve, r.reserveRelease ? `back ${day(r.reserveRelease)}` : ''));
    const sum = [['Sales', p.charges], ['Refunds', p.refunds || 0], ...(p.adjustments || []).map((a) => ['', a.amount]), ['', p.reserve || 0], ['Fees', p.fees]].reduce((s, x) => s + x[1], 0);
    const off = Math.abs(sum - p.total) > 0.005;
    const gap = off ? sum - p.total : dep ? p.total - dep.amount : p.total;
    const left = v.deadline ? daysTo(v.deadline) : null;
    const caseId = (caseByKey('po:' + id) || {}).id;
    return `<article class="sv-card sv-plain" aria-labelledby="sv-h">
      <h3 class="sv-h" id="sv-h">${esc(seen && v.headAfter ? v.headAfter : v.head)}</h3>
      <table class="tbl sv-wf"><caption class="sr">Payout ${id}</caption><tbody>
        ${row('Payout total', p.total, `sent ${day(p.date)}`, 'sv-tot')}
        ${row('Bank deposit', dep ? dep.amount : null, dep ? day(dep.date) : 'not yet', 'sv-bank')}
        ${row(off ? 'Lines minus payout' : 'Difference', gap, '', Math.abs(gap) > 0.005 ? 'sv-gap' : 'sv-ok')}
        ${lines.join('')}
        ${v.feeNote ? row('Fees', p.fees, seen ? v.feeNote : '') : ''}
      </tbody></table>
      ${seen ? `<p class="sv-cause"><span class="st ok">Confirmed</span> ${esc(v.after)}</p>`
        : `<div class="sv-cause"><p><span class="sl">Possible cause</span>${esc(v.cause)}</p>
          <details class="sv-why"><summary>Not confirmed · View reasoning</summary><p>${esc(v.found)}</p><p>${esc(v.maybe)}</p><p class="c-s">From: ${esc(storeSources(id).join(' · '))}</p></details></div>`}
      <div class="sv-next"><p class="sl">Next</p><p>${esc(seen ? v.nextAfter : v.next)}</p>
        ${v.deadline && seen ? `<p class="sv-dl"><span class="st ${left <= 2 ? 'neg' : 'warn'}">${esc(v.deadlineLabel)} ${esc(day(v.deadline).slice(0, -5))}</span> <span class="c-s">${left} day${left === 1 ? '' : 's'} left</span></p>` : ''}
        <div class="rq-btns">${seen ? '' : `<button type="button" class="b-pri" data-do="svcheck" data-p="${id}">${esc(v.check)}</button>`}${caseId ? `<button type="button" class="b-sec" data-do="svteam" data-c="${caseId}">Open in team workbench</button>` : ''}</div></div>
    </article>`;
  }
  function storeCard(id) {
    const v = SV.payouts[id], m = rawPayout(id), r = storeRecords(id), p = r.payout, seen = !!sv.seen[id];
    const dep = (r.deposits || [])[0];
    const rows = [['Sales', p.charges, `${p.orders} orders`]];
    if (p.refunds) rows.push(['Refunds', p.refunds, r.doubleRefund ? `includes a duplicate on ${r.doubleRefund}` : '']);
    for (const a of p.adjustments || []) rows.push([a.type === 'chargeback' ? `Chargeback ${a.ref}` : 'Adjustment', a.amount, a.dispute ? `dispute ${a.dispute}` : '']);
    if (p.reserve) rows.push(['Held as reserve', p.reserve, r.reserveRelease ? `back ${day(r.reserveRelease)}` : 'release date unknown']);
    rows.push(['Fees', p.fees, seen && v.feeNote ? v.feeNote : '']);
    const lines = rows.reduce((s, x) => s + x[1], 0);
    const off = Math.abs(lines - p.total) > 0.005;
    const gap = dep ? p.total - dep.amount : p.total;
    const row = (l, val, note, cls = '') => `<tr class="${cls}"><td>${esc(l)}${note ? ` <span class="c-s">· ${esc(note)}</span>` : ''}</td><td class="num">${val == null ? '—' : (val < 0 ? '−' : '') + money(val)}</td></tr>`;
    const left = v.deadline ? daysTo(v.deadline) : null;
    const caseId = (caseByKey('po:' + id) || {}).id;
    return `<article class="sv-card" aria-labelledby="sv-h">
      <h3 class="sv-h" id="sv-h">${esc(seen && v.headAfter ? v.headAfter : v.head)}</h3>
      <table class="tbl sv-wf"><caption class="sr">How payout ${id} adds up</caption><tbody>
        ${rows.map((x) => row(x[0], x[1], x[2])).join('')}
        ${off ? row('The lines above add up to', lines, '', 'sv-sub') : ''}
        ${row(`Payout ${id}`, p.total, `sent ${day(p.date)}`, 'sv-tot')}
        ${row('Reached your bank', dep ? dep.amount : null, dep ? day(dep.date) : 'not yet', 'sv-bank')}
        ${row(off ? 'Missing from the payout’s own lines' : 'Difference', off ? lines - p.total : gap, '', Math.abs(off ? lines - p.total : gap) > 0.005 ? 'sv-gap' : 'sv-ok')}
      </tbody></table>
      <p class="sv-src c-s">From: ${esc(storeSources(id).join(' · '))}</p>
      <div class="sv-blk"><p class="sl">What the records say</p><p>${esc(v.found)}</p></div>
      ${seen ? `<div class="sv-blk sv-conf"><p class="sl">Confirmed</p><p>${esc(v.after)}</p></div>`
        : `<div class="sv-blk sv-maybe"><p class="sl">Possible reason · not confirmed</p><p>${esc(v.maybe)}</p><button type="button" class="b-sec" data-do="svcheck" data-p="${id}">${esc(v.check)}</button></div>`}
      <div class="sv-blk sv-do"><p class="sl">What to do</p><p>${esc(seen ? v.todoAfter : v.todo)}</p>
        ${v.deadline && seen ? `<p class="sv-dl"><span class="st ${left <= 2 ? 'neg' : 'warn'}">${left} day${left === 1 ? '' : 's'} left</span> ${esc(v.deadlineLabel)} ${esc(day(v.deadline))}</p>` : ''}</div>
      <p class="sv-more c-s">Keep books with someone else? ${caseId ? `<button type="button" class="link-btn sm" data-do="svteam" data-c="${caseId}">Open ${id} in the team workbench</button>, where your bookkeeper can ask, track and record it.` : ''}</p>
    </article>`;
  }

  // ---------- your own payout: a Shopify "Export payout transactions" CSV, read in this browser only ----------
  const PI = window.TickmarkPayoutImport;
  let imp = { text: null, name: '', bank: '' };
  function importHtml() {
    if (!PI) return '';
    const mny = (v) => (v < 0 ? '−' : '') + money(v);
    let out = imp.err ? `<div class="sv-blk sv-err" role="alert"><p class="sl">Could not read ${esc(imp.name)}</p><p>${esc(imp.err)}</p></div>` : '';
    if (imp.text != null) {
      const r = PI.analyse(imp.text, { bank: imp.bank });
      if (!r.ok) out = `<div class="sv-blk sv-err" role="alert"><p class="sl">Could not read ${esc(imp.name)}</p><p>${esc(r.error)}</p>${r.found ? `<p class="c-s">Columns found: ${esc(r.found.join(', ') || 'none')}. Expected: ${esc(PI.COLUMNS.join(', '))}.</p>` : ''}</div>`;
      else {
        const sales = r.lines.find((l) => l.key === 'sales');
        const c = r.compare;
        const head = sales ? `Sales of ${money(sales.amount)} became a payout of ${mny(r.net)}${c ? (c.ties ? ', and it all reached your bank.' : `; your bank shows ${money(c.bank)}.`) : '.'}` : `This file comes to ${mny(r.net)}.`;
        const row = (l, val, note, cls = '') => `<tr class="${cls}"><td>${esc(l)}${note ? ` <span class="c-s">· ${esc(note)}</span>` : ''}</td><td class="num">${val == null ? '—' : mny(val)}</td></tr>`;
        out = `<article class="sv-card imp-card" aria-labelledby="imp-r">
          <h3 class="sv-h" id="imp-r">${esc(head)}</h3>
          <table class="tbl sv-wf"><caption class="sr">How ${esc(imp.name)} adds up</caption><tbody>
            ${r.lines.map((l) => row(l.label, l.amount, `${l.count} line${l.count === 1 ? '' : 's'}`)).join('')}
            ${row('Fees', r.fees, 'the Fee column')}
            ${row('Payout', r.net, r.payoutDates.length === 1 ? `sum of Net · paid out ${day(r.payoutDates[0])}` : 'sum of Net', 'sv-tot')}
            ${c ? row('Reached your bank', c.bank, 'as you entered it', 'sv-bank') + row('Difference', c.gap, '', c.ties ? 'sv-ok' : 'sv-gap') : ''}
          </tbody></table>
          <p class="sv-src c-s">From: ${esc(imp.name)} · ${r.rows.length} lines · read in this browser, not sent or saved</p>
          <div class="sv-blk"><p class="sl">What the file says</p><ul>${r.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>
          ${c && c.maybe ? `<div class="sv-blk sv-maybe"><p class="sl">Possible reason · not confirmed</p><p>${esc(c.maybe)}</p></div>` : ''}
          ${r.todo.length ? `<div class="sv-blk sv-do"><p class="sl">What to do</p><ul>${r.todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : `<div class="sv-blk sv-conf"><p class="sl">Nothing to do</p><p>Every line is a sale, a refund or a fee.</p></div>`}
        </article>`;
      }
    }
    return `<section class="sv-imp" aria-labelledby="imp-h">
      <h3 class="sv-h" id="imp-h">Check one of your own payouts</h3>
      <p class="c-s">On Shopify: Finance › Payouts › open a payout › Export › <b>Export payout transactions</b>. Shopify emails you the CSV. This page reads it in your browser; nothing is uploaded or saved.</p>
      <div class="imp-in">
        <label class="b-sec imp-file">Choose the CSV<input type="file" accept=".csv,text/csv" data-imp="file" class="sr"></label>
        <button type="button" class="link-btn sm" data-do="impsample">Try a sample file</button>
        <label class="tol">Reached your bank <input type="text" inputmode="decimal" data-imp="bank" value="${esc(imp.bank)}" placeholder="optional, e.g. 3,328.67" aria-describedby="imp-bank-n"></label>
        ${imp.text != null ? '<button type="button" class="link-btn sm" data-do="impclear">Clear</button>' : ''}
      </div>
      <p class="c-s" id="imp-bank-n">Add the deposit from your bank statement to compare. Columns read: ${esc(PI.REQUIRED.join(', '))}, plus the dates, order and payout status when present.</p>
      ${out}
    </section>`;
  }
  const impFocus = () => { const h = $('#imp-r') || $('.sv-err'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); h.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } };

  // ---------- a business queue ----------
  function colsFor(c) {
    const r = c.records || {}, x = topX(c);
    if (c.module === 'close') return [['Period', 'Oct 2026'], ['Blocks', r.blocks ? 'Close sign-off' : '—']];
    if (c.module === 'payroll') return [['Pay period', '1–15 Oct'], ['Employee', (r.hr && r.hr.id) || (r.pay && r.pay[0] && r.pay[0].id) || '—'], ['Pay impact', x && (x.blocks || []).includes('release') ? 'Holds release' : '—']];
    if (c.module === 'cash') { const b = r.bank, g = r.gl && r.gl[0]; return [['Account', 'Operating · GL 1010'], ['Difference', b ? money(g ? Math.abs(Math.abs(b[2]) - Math.abs(g[2])) || 0 : Math.abs(b[2])) : '—']]; }
    if (c.module === 'mortgage') return [['Loan', (r.loans && r.loans[0] && r.loans[0].no) || '—'], ['Key date', r.closing && r.closing.latest ? `Closing ${day(r.closing.latest).slice(0, -5)}` : '—']];
    if (c.module === 'payouts') {
      const p = r.payout, deps = r.deposits || [];
      const hit = p && deps.find((d) => Math.abs(d.amount - p.total) < 0.005);
      const gap = !p ? null : hit ? 0 : deps[0] ? Math.abs(p.total - deps[0].amount) : p.total;
      return [['Payout', p ? `${p.id} · ${day(p.date)}` : '—'], ['Bank gap', gap == null ? '—' : gap === 0 ? 'Ties' : money(gap) + (deps[0] ? '' : ' not received')]];
    }
    return [];
  }
  function workStatus(c) {
    const rw = C.row(state, D, c);
    if (c.closed) return ['ok', c.stage || 'Closed'];
    if (rw.status === 'reply-in') return ['warn', 'Reply to review'];
    if (rw.waitingOn.length) return [rw.overdue ? 'neg' : '', `Waiting on ${rw.waitingOn[0]}`];
    const x = topX(c);
    if (!x) return C.actionsFor(state, D, A, c.id, c.owner).some((a) => a.kind !== 'accept' && a.ready) ? ['warn', 'Ready for the next step'] : ['ok', 'Nothing open'];
    if (x.missing && x.missing.length) return ['warn', 'Missing evidence'];
    const po = C.primaryAction(state, D, A, c.id, c.owner);
    if (po.kind === 'authority') return ['warn', po.label.replace(/^Waiting on/, 'Needs')];
    return ['', 'Needs a decision'];
  }
  function queueHtml(mod) {
    const f = filters[mod] || (filters[mod] = { status: 'active' });
    let list = cases().filter((c) => c.module === mod);
    if (f.status === 'active') list = list.filter((c) => !c.closed);
    else if (f.status === 'closed') list = list.filter((c) => c.closed);
    if (f.priority) list = list.filter((c) => C.effectivePriority(c) === f.priority);
    if (f.code) list = list.filter((c) => c.exceptions.some((x) => x.status === 'open' && x.code === f.code));
    if (f.branch) list = list.filter((c) => c.branch === f.branch);
    if (f.owner) list = list.filter((c) => c.owner === f.owner);
    if (f.waiting) list = list.filter((c) => C.row(state, D, c).waitingTeams.includes(f.waiting));
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((c) => [c.id, c.title, headline(c), JSON.stringify(colsFor(c))].join(' ').toLowerCase().includes(q)); }
    const RANK = { P1: 0, P2: 1, P3: 2, P4: 3 };
    list.sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || RANK[C.effectivePriority(a)] - RANK[C.effectivePriority(b)] || String(a.due).localeCompare(String(b.due)));
    const all = cases().filter((c) => c.module === mod);
    const codes = [...new Set(all.flatMap((c) => c.exceptions.filter((x) => x.status === 'open').map((x) => x.code)))].sort();
    const shortOf = (code) => { for (const c of all) { const x = c.exceptions.find((y) => y.code === code); if (x) return x.short || code; } return code; };
    const opt = (v, l, cur) => `<option value="${esc(v)}"${(cur || '') === v ? ' selected' : ''}>${esc(l)}</option>`;
    const more = !!(f.code || f.branch || f.owner || f.waiting);
    const extraCols = all.length ? colsFor(all[0]).map(([k]) => k) : [];
    return `<div class="q-bar">
        <label class="q-search"><span class="sr">Search ${esc(MODULES[mod].label)}</span><input type="search" data-f="q" placeholder="Search cases, IDs, people" value="${esc(f.q || '')}"></label>
        <label class="tol">Priority <select data-f="priority">${opt('', 'Any', f.priority)}${['P1', 'P2', 'P3'].map((k) => opt(k, k, f.priority)).join('')}</select></label>
        <label class="tol">Status <select data-f="status">${opt('active', 'Open', f.status)}${opt('closed', 'Closed', f.status)}${opt('all', 'All', f.status)}</select></label>
        <details class="q-more"${more ? ' open' : ''}><summary>More filters${more ? ' · on' : ''}</summary><div class="q-more-b">
          <label class="tol">Exception <select data-f="code">${opt('', 'Any', f.code)}${codes.map((k) => opt(k, shortOf(k), f.code)).join('')}</select></label>
          ${mod === 'mortgage' ? `<label class="tol">Transaction <select data-f="branch">${opt('', 'Any', f.branch)}${[...new Map(all.map((c) => [c.branch, c.branchLabel]))].map(([k, l]) => opt(k, l, f.branch)).join('')}</select></label>` : ''}
          <label class="tol">Owner <select data-f="owner">${opt('', 'Anyone', f.owner)}${[...new Set(all.map((c) => c.owner))].map((p) => opt(p, name(p), f.owner)).join('')}</select></label>
          <label class="tol">Waiting on <select data-f="waiting">${opt('', 'Any team', f.waiting)}${Object.keys(D.teams).map((t) => opt(t, team(t), f.waiting)).join('')}</select></label>
          <button type="button" class="link-btn sm" data-do="clearf">Clear filters</button></div></details>
      </div>
      <div class="q-wrap"><table class="tbl q-t"><colgroup><col class="c-find"><col class="c-pri"><col class="c-st"><col class="c-next">${extraCols.map(() => '<col class="c-x">').join('')}<col class="c-due"></colgroup><thead><tr><th scope="col">Finding</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Next step</th>${extraCols.map((k) => `<th scope="col">${esc(k)}</th>`).join('')}<th scope="col">Due</th></tr></thead><tbody>
      ${list.length ? list.map((c) => {
        const [tone, st] = workStatus(c), x = topX(c), pri = C.effectivePriority(c);
        const p = C.primaryAction(state, D, A, c.id, me);
        const next = c.closed ? '—' : p.kind === 'none' || p.kind === 'waiting' ? (x ? x.next : '—') : p.label;
        return `<tr${c.closed ? ' class="q-done"' : ''}>
          <td><a class="q-open" href="#case/${encodeURIComponent(c.id)}" data-route="case/${esc(c.id)}"><b>${esc(headline(c))}</b><span>${c.id}${c.branchLabel ? ' · ' + esc(c.branchLabel) : ''}${x && x.short ? ' · ' + esc(x.short) : ''}</span></a></td>
          <td>${c.closed ? '—' : `<span class="pill ${PRI[pri]}">${pri}</span>`}</td>
          <td><span class="st ${tone}">${esc(st)}</span></td>
          <td>${esc(next)}</td>
          ${colsFor(c).map(([, v]) => `<td>${esc(v)}</td>`).join('')}
          <td class="q-due">${c.closed ? '—' : esc(at(c.due).replace(' UTC', ''))}</td></tr>`;
      }).join('') : `<tr><td colspan="${5 + extraCols.length}" class="d-empty">No cases match. <button type="button" class="link-btn sm" data-do="clearf">Clear filters</button></td></tr>`}
      </tbody></table></div>`;
  }

  // ---------- the guided payout case: each step read from the case's own state ----------
  const TRY_KEY = 'ms:ML-40311', STORE_KEY = 'po:PO-1028';
  const WAIT = ['open', 'claimed', 'more-info'];
  function guideStep(c) {
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const pay = tasks.find((t) => t.team === 'payments');
    const dan = tasks.find((t) => t.original === 'person:daniel' || t.assignee === 'daniel');
    const open = (code) => c.exceptions.some((x) => x.status === 'open' && x.code === code);
    if (c.closed) return { n: 9, done: true };
    if (!pay) return { n: 1, who: 'ava', goal: 'Find out when the money actually reached the bank.', next: 'Press “Request receipt confirmation”, check the drafted question to Payments, and send it.', why: 'The payout posted, yet the loan still shows a balance. Whether the money came late depends on when it reached the bank, and only Payments holds the wire log.' };
    if (WAIT.includes(pay.status)) return { n: 2, who: 'leo', goal: 'Answer the check for Payments.', next: pay.status === 'open' ? 'Press “Claim check”. Then reply with the wire log.' : 'Press “Reply with evidence”. Your wire log is shown and ticked; check the times, then press “Send reply”.', why: 'A check goes to a team, not to the case. Leo answers one question; the case stays with Ava.' };
    if (pay.status === 'replied') return { n: 3, who: 'ava', goal: 'Decide whether the reply answers the question.', next: 'The receipt time is now on record. Read the reply, then press “Reply answers it”.', why: 'The wire log arrived as evidence, so the checks re-ran with it. A person still decides whether it answers the question.' };
    if (!dan) return { n: 4, who: 'ava', goal: 'Get the settlement date decided by someone authorised.', next: 'Press “Request settlement decision”. It goes to Daniel Roy.', why: 'Which date the loan settles on is a decision, not a fact in any system. Only someone with that authority can set it.' };
    if (WAIT.includes(dan.status)) return { n: 5, who: 'daniel', goal: 'Set the settlement date.', next: 'Press “Reply with evidence”. The settlement decision is shown and ticked; check it, then press “Send reply”.', why: 'Daniel’s reply becomes evidence with his name and time on it, so the decision can be traced later.' };
    if (dan.status === 'replied') return { n: 6, who: 'ava', goal: 'Accept the authorised decision.', next: 'Press “Reply answers it”.', why: 'Accepting closes the check. The steps that were waiting for this date can now be tried.' };
    if (open('LATE_POSTING')) return { n: 7, who: 'daniel', goal: 'Correct the balance.', next: 'Press “Reverse the interest charged during our hold”. The checks re-run.', why: 'With the receipt time and settlement date both confirmed, the interest charged while the lender held the money can be reversed. Before that, the correction stayed paused.' };
    return { n: 8, who: 'daniel', goal: 'Restart the paused work.', next: 'Every condition holds. Press “Resume discharge preparation”.', why: 'The checks re-ran after the correction. Every condition for the paused step now holds.' };
  }
  function guideHtml(c) {
    const g = guideStep(c);
    const adv = ui.lastStep != null && g.n > ui.lastStep; ui.lastStep = g.n;
    const steps = `<ol class="gd-steps" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<li class="${i + 1 < g.n ? 'done' : i + 1 === g.n ? 'now' + (adv ? ' gd-adv' : '') : ''}"></li>`).join('')}</ol>`;
    const bar = demoBar('Mortgage payoff', g.n, 8, g.done);
    if (g.done) {
      const facts = C.trace(c).filter((f) => f.status === 'agree' || f.status === 'single').slice(0, 4);
      return `${bar}<section class="gd gd-done" aria-label="What happened">${steps}
        <div class="gd-sum"><div><p class="sl">Confirmed</p><ul>${facts.map((f) => `<li>${esc(f.label)}: <b>${esc(showVal(f.readings[0].value, c.module, f.key))}</b></li>`).join('')}</ul></div>
          <div><p class="sl">Done</p><ul><li>Payments confirmed the receipt time</li><li>Daniel Roy set the settlement date</li><li>The hold interest was reversed</li><li>Discharge preparation resumed; no shortfall notice was sent</li></ul></div>
          <div><p class="sl">Still to do, outside this demo</p><ul><li>Prepare and register the discharge in the registration system</li><li>Other open cases in the queue</li></ul></div></div>
        <div class="rq-btns"><a class="b-pri btn-l" href="#workbench" data-route="mywork">Open the normal workbench</a><a class="b-sec btn-l" href="notes" data-wipe>Why it works this way</a></div></section>`;
    }
    const role = me === g.who;
    return `${bar}<section class="gd" aria-label="This step" aria-live="polite">${steps}
      <p class="gd-who">You are <b>${esc(name(me))}</b>, ${esc(team(D.people[me].team))}.${role ? ` Your goal: ${esc(g.goal)}` : ` This step is for ${esc(name(g.who))} in ${esc(team(D.people[g.who].team))}.`}</p>
      ${role ? `<p class="gd-next">${esc(g.next).replace(/“([^”]+)”/g, '<b>“$1”</b>')}</p>` : `<div class="rq-btns"><button type="button" class="b-pri" data-do="as" data-p="${g.who}">Switch to ${esc(name(g.who).split(' ')[0])}</button><span class="c-s">Switching simulates signing in as them; each person sees only what their role allows.</span></div>`}
      <p class="gd-why"><span class="sl">Why</span>${esc(g.why)}</p></section>`;
  }

  // ---------- case review ----------
  function factLine(c, f, full) {
    const r = f.readings[0];
    const tag = f.status === 'agree' ? ['ok', 'Confirmed'] : f.status === 'conflict' ? ['neg', 'Sources disagree'] : ['', 'On record'];
    return `<li><span class="fk">${esc(f.label)}</span><span class="fv">${esc(f.status === 'conflict' ? f.readings.map((x) => showVal(x.value, c.module, f.key)).join(' vs ') : showVal(r.value, c.module, f.key))}${f.key === 'balance' ? ' <span class="c-s">book balance</span>' : ''}</span><span class="fs" title="${esc(r.label)}">${f.status === 'single' && !full ? '' : `<span class="st ${tag[0]}">${tag[1]}</span>`}${full ? ` ${esc(r.label)}` : ''}</span></li>`;
  }
  // two amounts that should tie: show the difference beside them, computed, not a source
  function gapLine(c, byKey) {
    const a = byKey.payout_total, b = byKey.deposit;
    if (c.module !== 'payouts' || !a || !b || !a.readings.length || !b.readings.length) return '';
    const d = Math.abs(a.readings[0].value - b.readings[0].value);
    return d < 0.005 ? '' : `<li class="cs-gap"><span class="fk">Difference</span><span class="fv">${money(d)}</span><span class="fs"></span></li>`;
  }
  function caseHtml(c) {
    const facts = C.trace(c), byKey = Object.fromEntries(facts.map((f) => [f.key, f]));
    const x = topX(c);
    const keys = x ? (x.facts || []) : facts.map((f) => f.key);
    const known = keys.map((k) => byKey[k]).filter((f) => f && f.readings.length).slice(0, 3);
    const pending = x ? (x.missing || []) : [];
    const acts = C.actionsFor(state, D, A, c.id, me);
    const paused = acts.filter((a) => a.kind !== 'accept' && !a.ready);
    const p = C.primaryAction(state, D, A, c.id, me);
    const pri = C.effectivePriority(c);
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const guided = ui.guided;
    // one line: the sentence that names a cause, not the one restating the problem
    const first = (t) => { const ss = String(t || '').split(/(?<=[.!?])\s+(?=[A-Z0-9$“"(])/); return (ss.find((x) => /\b(may|might|likely|looks?|probably|explains?)\b/i.test(x)) || ss[0]).trim(); };
    const others = c.exceptions.filter((y) => y.status === 'open' && y !== x);
    const due = `${c.dueLabel && c.dueLabel !== 'Due' ? esc(c.dueLabel) : 'Due'} ${esc(day(c.due).slice(0, -5))}`;
    const cause = x && x.cause ? `<div class="cs-cause"><p><span class="sl">${pending.length ? 'Possible cause' : 'Cause'}</span>${esc(guided ? x.cause : first(x.cause))}</p>
        <details class="cs-why"${guided ? ' open' : ''}><summary>${pending.length ? 'Not confirmed · ' : ''}View reasoning</summary>
          ${guided ? '' : `<p>${esc(x.cause)}</p>`}
          <ul class="cs-why-l"><li><span>Classification</span>${esc(CLS[x.cls] || x.cls)}${x.clsBy ? ` (set by ${esc(name(x.clsBy))})` : ''}</li><li><span>Read by</span>${esc(x.by)}</li>${x.confidence ? `<li><span>Confidence in the reading</span>${esc(x.confidence)}</li>` : ''}${pending.length ? `<li><span>What would settle it</span>${esc(pending.map((m) => m.what).join('; '))}</li>` : ''}</ul></details></div>` : '';
    // a case with nothing open can still have a step left; say which
    const idle = !x && !c.closed && p.kind !== 'none' && p.kind !== 'done' ? p.label : '';
    return `${guided ? guideHtml(c) : ''}
      <a class="link-btn sm cs-back" href="#queue/${c.module}" data-route="queue/${c.module}">← ${esc(MODULES[c.module].label)}</a>
      <header class="cs-h"><h3 class="cs-t">${esc(headline(c))}</h3>
        <p class="cs-m">${c.id} · ${esc(MODULES[c.module].label)}${c.branchLabel ? ' · ' + esc(c.branchLabel) : ''}</p>
        <p class="cs-tags"><span class="pill ${c.closed ? 'ok' : PRI[pri]}"${c.priority && !c.closed ? ` title="${esc(c.priority.reasons.join(' · '))}"` : ''}>${c.closed ? 'Closed' : pri}</span>${c.closed ? '' : `<span class="cs-tag">${due}</span>`}<span class="cs-tag">Owner <b>${esc(name(c.owner))}</b></span></p></header>
      <div class="cs-grid">
        <div class="cs-main">
          ${x ? `<section class="cs-sum">
            <div class="cs-blk"><p class="sl">Issue</p><ul class="cs-facts">${known.map((f) => factLine(c, f, guided)).join('') || '<li class="c-s">No recorded facts yet.</li>'}${gapLine(c, byKey)}</ul></div>
            ${pending.length ? `<div class="cs-blk"><p class="sl">Missing evidence</p><ul class="cs-pend">${pending.map((m) => `<li><b>${esc(m.what.replace(/^\w/, (s) => s.toUpperCase()))}</b><span class="c-s">Available from ${esc(m.who)}</span></li>`).join('')}</ul></div>` : ''}
            <div class="cs-blk"><p class="sl">Impact</p><p class="cs-imp">${esc((c.affects || '—').replace(/^\w/, (s) => s.toUpperCase()))}</p>
              ${paused.length ? `<ul class="cs-paused">${paused.map((a) => `<li><span class="st warn">Paused</span> ${esc(a.label)}<span class="c-s"> · needs ${esc((a.prereqs.find((q) => !q.ok) || {}).label || a.permLabel || '')}</span></li>`).join('')}</ul>` : ''}</div>
            ${cause}
            ${others.length ? `<p class="c-s cs-also">Also open: ${esc(others.map((y) => y.short || y.title).join('; '))}</p>` : ''}
          </section>` : `<section class="cs-sum"><div class="cs-blk"><p class="sl">${c.closed ? 'Closed' : 'No open exceptions'}</p><p class="cs-imp">${c.closed ? esc(c.stage || 'Closed') : idle ? `One step left: ${esc(idle)}` : 'Nothing left to do on this case.'}</p><p class="c-s">${c.exceptions.length} exception${c.exceptions.length === 1 ? '' : 's'} recorded. Evidence and activity are kept below.</p></div></section>`}
        </div>
        <aside class="cs-act" aria-label="Next action">${actionHtml(c, p, acts, tasks)}</aside>
      </div>
      <div class="cs-folds">
      ${evidenceHtml(c, facts, keys)}
      ${checksHtml(c, tasks)}
      ${activityHtml(c)}
      </div>`;
  }

  // the action panel: one primary step for this person, then anything paused, then less common actions
  function actionHtml(c, p, acts, tasks) {
    const t = p.task && state.tasks[p.task];
    const area = (id, ph, rows = 3) => `<label class="sr" for="${id}">${ph}</label><textarea id="${id}" rows="${rows}" placeholder="${ph}"></textarea>`;
    let main = '';
    if (p.kind === 'request') main = ui.form === 'esc' ? escalateForm(c) : `<button type="button" class="b-pri cs-primary" data-do="form" data-form="esc">${esc(p.label)}</button><p class="c-s">${esc(p.why)}</p>`;
    else if (p.kind === 'claim') main = `<button type="button" class="b-pri cs-primary" data-do="claim" data-t="${t.id}">Claim check</button><p class="cs-q">“${esc(t.question)}”</p><p class="c-s">Sent by ${esc(name(t.from))} to ${esc(team(t.team))} · due ${esc(at(t.due))}</p>`;
    else if (p.kind === 'reply') {
      const reach = c.available.filter((i) => !i.teams || i.teams.includes(D.people[me].team));
      // the person answering sees what their own records say, so the answer is read off them, not guessed
      const lines = (i) => {
        const fromPatch = (i.patch || []).map((q) => [q.label, typeof q.value === 'object' && q.value ? [q.value.date && day(q.value.date), q.value.ref].filter(Boolean).join(' · ') : showVal(q.value, c.module, '')]);
        const ev = i.evidence || {};
        return fromPatch.length ? fromPatch : Object.entries(ev.facts || {}).map(([k, v]) => [k.replace(/_/g, ' ').replace(/^\w/, (s) => s.toUpperCase()), showVal(v, c.module, k)]);
      };
      const draftAns = reach.length === 1 ? `${(reach[0].evidence || {}).label || reach[0].label}: ${lines(reach[0]).map(([k, v]) => `${k.toLowerCase()} ${v}`).join('; ')}.` : '';
      main = ui.form === 'reply' ? `<div class="cs-form"><p class="cs-q">“${esc(t.question)}”</p>
          ${reach.length ? `<fieldset class="rq-evs"><legend class="sl">What your team’s records show</legend>${reach.map((i) => `<label class="rq-chk rq-ev"><input type="checkbox" value="${i.id}" data-attach${reach.length === 1 ? ' checked' : ''}><span><b>${esc(i.label)}</b>${i.correction ? ' <span class="pill warn">correction</span>' : ''}<span class="c-s">${esc([(i.evidence || {}).system, (i.evidence || {}).loc].filter(Boolean).join(' · '))}</span>
            ${lines(i).length ? `<dl class="rq-ev-f">${lines(i).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}<span class="c-s">Ticked records go with your reply as evidence.</span></span></label>`).join('')}</fieldset>` : '<p class="c-s">Nothing on file for your team to attach. Say what you checked, and choose Cannot confirm if you could not.</p>'}
          <label class="sl" for="rp-a">Your answer</label><textarea id="rp-a" rows="3" placeholder="Your answer">${esc(draftAns)}</textarea>
          <label class="tol">Conclusion <select id="rp-c"><option value="confirmed">Confirmed</option><option value="corrected">Corrected</option><option value="cannot-confirm">Cannot confirm</option></select></label>
          <div class="rq-btns"><button type="button" class="b-pri cs-primary" data-do="reply" data-t="${t.id}">Send reply</button><button type="button" class="b-sec" data-do="form" data-form="">Cancel</button></div></div>`
        : `<button type="button" class="b-pri cs-primary" data-do="form" data-form="reply">Reply with evidence</button><p class="cs-q">“${esc(t.question)}”</p><p class="c-s">From ${esc(name(t.from))} · due ${esc(at(t.due))}${t.requested.length ? ` · asks for ${esc(t.requested.join(', '))}` : ''}</p>`;
    } else if (p.kind === 'review') main = `<p class="sl">Reply from ${esc(name(t.reply.by))}</p><p class="cs-q">${esc(t.reply.answer)}</p>${t.reply.evidence.length ? `<p class="c-s">Attached: ${esc(t.reply.evidence.map((id) => (c.evidence.find((e) => e.id === id) || {}).label).join(', '))}. The checks re-ran with it.</p>` : '<p class="c-s">No evidence attached.</p>'}
        ${ui.form === 'more' ? `<div class="cs-form">${area('tx', 'What is still missing')}<button type="button" class="b-pri" data-do="more" data-t="${t.id}">Send back</button></div>` : `<div class="rq-btns"><button type="button" class="b-pri cs-primary" data-do="acceptT" data-t="${t.id}">Reply answers it</button><button type="button" class="b-sec" data-do="form" data-form="more">Not enough, ask again</button></div>`}`;
    else if (p.kind === 'clarify') main = `<p class="sl">${esc(name(t.assignee))} asks</p><p class="cs-q">“${esc(t.clarify.q)}”</p><div class="cs-form">${area('tx', 'Your answer', 2)}<button type="button" class="b-pri cs-primary" data-do="answer" data-t="${t.id}">Answer the question</button></div>`;
    else if (p.kind === 'returned') main = `<p class="sl">Returned by ${esc(team(t.team))}</p><p class="cs-q">“${esc(t.returnReason)}”</p>${reassignForm(t, true)}`;
    else if (p.kind === 'inbox') main = `<button type="button" class="b-pri cs-primary" data-do="inbox" data-i="${esc(p.item)}">Add the new evidence</button><p class="c-s">${esc(p.why)}. Adding it re-runs the checks.</p>`;
    else if (p.kind === 'act') {
      const a = acts.find((y) => y.id === p.action);
      main = `${a.needsReason ? area('r-' + a.id, 'Reason, kept with the decision (12+ characters)', 2) : ''}<button type="button" class="b-pri cs-primary" data-do="act" data-a="${esc(a.id)}">${esc(a.label)}</button><p class="c-s">${esc(p.why || 'Every condition for this step holds.')}</p>`;
    } else if (p.kind === 'waiting') main = `<p class="cs-wait"><span class="st${p.overdue ? ' neg' : ''}">${p.overdue ? 'Overdue' : 'Waiting'}</span> ${esc(p.label)}</p><p class="cs-q">“${esc(p.why)}”</p><p class="c-s">Due ${esc(at(t.due))}${t.followUp ? ` · follow up ${esc(at(t.followUp))}` : ''}</p>
        ${p.overdue && p.mine && !leadHas(t) ? (() => { const last = t.history[t.history.length - 1]; const sent = last && /^Reminder sent/.test(last.event); return `${sent ? `<p class="cs-done"><span class="st ok">Reminder sent</span> ${esc(at(last.at))}. If nothing comes back, pass it to the team lead.</p>` : ''}<div class="rq-btns">${sent ? '' : `<button type="button" class="b-pri cs-primary" data-do="remind" data-t="${t.id}">Send a reminder</button>`}<button type="button" class="${sent ? 'b-pri cs-primary' : 'b-sec'}" data-do="lead" data-t="${t.id}">Pass to the team lead</button></div>`; })() : ''}
        ${waitHandoff(c, p, t)}`;
    else if (p.kind === 'authority') {
      // the decision belongs to someone else; in this demo, sign in as them to make it
      const nm = p.label.replace(/^Waiting on /, ''), pid = Object.keys(D.people).find((k) => D.people[k].name === nm);
      main = `<p class="cs-wait"><span class="st">Waiting</span> ${esc(p.label)}</p><p class="c-s">${esc(p.why)}</p>${pid ? `<button type="button" class="b-pri cs-primary" data-do="as" data-p="${pid}">Try as ${esc(nm)}</button><p class="c-s">Switching simulates signing in as them.</p>` : ''}`;
    }
    else if (p.kind === 'done') main = `<p class="cs-wait"><span class="st ok">Done</span> ${esc(p.label)}</p><p class="c-s">History and evidence stay below.</p>`;
    else if (!C.onCase(D, me, c) && !c.closed && c.owner !== me) main = `<p class="cs-wait">${esc(p.label)}</p><p class="c-s">You are viewing as ${esc(name(me))}. ${esc(name(c.owner))} owns this case and can act on it.</p><button type="button" class="b-pri cs-primary" data-do="as" data-p="${esc(c.owner)}">Try as ${esc(name(c.owner))}</button><p class="c-s">Switching simulates signing in as them.</p>`;
    else main = `<p class="cs-wait">${esc(p.label)}</p><p class="c-s">${esc(p.why)}</p>`;
    const onCase = C.onCase(D, me, c);
    const extra = acts.filter((a) => a.allowed && a.ready && a.id !== p.action);
    const secondary = onCase && !c.closed ? `<details class="cs-more"><summary>More actions</summary><div class="cs-more-b">
        ${p.kind !== 'request' ? `<button type="button" class="b-sec" data-do="form" data-form="esc">Ask a team or a person</button>` : ''}
        <button type="button" class="b-sec" data-do="recheck">Re-run checks</button>
        <button type="button" class="b-sec" data-do="form" data-form="priority">Change priority</button>
        ${topX(c) ? `<button type="button" class="b-sec" data-do="form" data-form="cls">Change classification</button>` : ''}
        ${extra.map((a) => `<button type="button" class="b-sec" data-do="form" data-form="act:${esc(a.id)}">${esc(a.label)}…</button>`).join('')}
      </div></details>` : '';
    let form = '';
    if (ui.form === 'esc' && p.kind !== 'request') form = escalateForm(c);
    if (ui.form === 'priority') form = `<div class="cs-form"><label class="tol">Priority <select id="pr-l">${['P1', 'P2', 'P3', 'auto'].map((l) => `<option value="${l}">${l === 'auto' ? 'Back to computed' : l}</option>`).join('')}</select></label>${area('pr-r', 'Why (8+ characters)', 2)}<button type="button" class="b-pri" data-do="priority">Save priority</button></div>`;
    if (ui.form === 'cls' && topX(c)) form = `<div class="cs-form"><label class="tol">Classification <select id="cl-v">${Object.entries(CLS).map(([k, l]) => `<option value="${k}"${k === topX(c).cls ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${area('cl-r', 'Why (8+ characters)', 2)}<button type="button" class="b-pri" data-do="cls" data-x="${topX(c).id}">Save classification</button></div>`;
    if (ui.form && ui.form.startsWith('act:')) { const a = acts.find((y) => y.id === ui.form.slice(4)); if (a) form = `<div class="cs-form"><p class="sl">${esc(a.label)}</p>${a.needsReason ? area('r-' + a.id, 'Reason, kept with the decision (12+ characters)', 2) : ''}<button type="button" class="b-pri" data-do="act" data-a="${esc(a.id)}">Confirm</button></div>`; }
    if (ui.guided) main = main.replace(/class="b-pri cs-primary"/, 'class="b-pri cs-primary gd-hl"');
    return `<p class="sl">${main.includes('cs-primary') ? 'Next action' : 'Status'}</p>${main}${form}${secondary}
      <p class="cs-who">Acting as ${esc(name(me))} · ${esc(D.people[me].role)}</p>`;
  }
  // an overdue check already passed to the team lead: chasing again is not the next step
  const leadHas = (t) => t.history.some((h) => /passed to the team lead/i.test(h.event));
  // while a case waits on someone else, say who moves next and let the visitor sign in as them
  function waitHandoff(c, p, t) {
    if (c.closed || ui.guided) return '';
    if (/^Your reply is with/.test(p.label)) return `<p class="c-s">${esc(name(c.owner))} reviews your reply next.</p><button type="button" class="b-pri cs-primary" data-do="as" data-p="${esc(c.owner)}">Continue as ${esc(name(c.owner))}</button>`;
    if (p.overdue && p.mine && !leadHas(t)) return '';
    const pid = t.assignee || Object.keys(D.people).find((k) => D.people[k].team === t.team && C.isLead(D, k, t.team)) || Object.keys(D.people).find((k) => D.people[k].team === t.team);
    if (!pid || pid === me) return '';
    return `<p class="c-s cs-handoff">Nothing more to do here until they answer. In this demo you can answer it yourself:</p><button type="button" class="b-sec" data-do="as" data-p="${esc(pid)}">Answer as ${esc(name(pid))}, ${esc(team(D.people[pid].team))}</button>`;
  }
  function reassignForm(t, primary) {
    return `<div class="cs-form"><label class="tol">Send to <select id="ra-to"><option value="team">A team</option><option value="person">A person</option></select></label>
      <select id="ra-t" aria-label="Team">${Object.entries(D.teams).map(([k, x]) => `<option value="${k}">${esc(x.name)}</option>`).join('')}</select>
      <select id="ra-p" aria-label="Person">${Object.entries(D.people).map(([k, p]) => `<option value="${k}">${esc(p.name)} · ${esc(team(p.team))}</option>`).join('')}</select>
      <label class="sr" for="ra-r">Why it moves</label><textarea id="ra-r" rows="2" placeholder="Why it moves (8+ characters)"></textarea>
      <button type="button" class="${primary ? 'b-pri cs-primary' : 'b-pri'}" data-do="reassign" data-t="${t.id}">Reassign</button></div>`;
  }
  function escalateForm(c) {
    const x = topX(c);
    const draft = (x && c.drafts && c.drafts[x.code]) || {};
    const to = ui.escTo || draft.to || 'team';
    // with no draft, start from the team the missing evidence is said to come from
    const holder = x && (x.missing || [])[0] && Object.keys(D.teams).find((k) => D.teams[k].name === x.missing[0].who);
    const defTeam = draft.team || holder;
    return `<div class="cs-form rq-esc"><p class="sl">${esc(draft.cta || 'Ask a team or a person')}</p>
      <p class="c-s">${draft.question ? 'Drafted from this case’s evidence by a fixed template (a stand-in for an AI draft). Check the question and the recipient.' : 'Write one clear question.'}</p>
      <div class="rq-seg" role="radiogroup" aria-label="Send to"><label><input type="radio" name="es-to" value="team"${to === 'team' ? ' checked' : ''}> A team</label><label><input type="radio" name="es-to" value="person"${to === 'person' ? ' checked' : ''}> A named person</label></div>
      <label class="tol" id="es-team-l"${to === 'team' ? '' : ' hidden'}>Team <select id="es-team">${Object.entries(D.teams).map(([k, t]) => `<option value="${k}"${k === defTeam ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="tol" id="es-person-l"${to === 'person' ? '' : ' hidden'}>Person <select id="es-person">${Object.entries(D.people).map(([k, p]) => `<option value="${k}"${k === draft.person ? ' selected' : ''}>${esc(p.name)} · ${esc(team(p.team))}</option>`).join('')}</select></label>
      ${draft.requires ? `<p class="c-s">Needs someone with ${esc(draft.requires)}.</p>` : ''}
      <label class="sl" for="es-q">Question</label><textarea id="es-q" rows="4">${esc(draft.question || '')}</textarea>
      <label class="sl" for="es-why">Why it matters</label><textarea id="es-why" rows="2">${esc(draft.why || '')}</textarea>
      <div class="es-row"><label class="tol">Due in <select id="es-due"><option value="4">4 hours</option><option value="24" selected>1 day</option><option value="48">2 days</option></select></label>
      <label class="rq-chk"><input type="checkbox" id="es-block"${draft.blocking === false ? '' : ' checked'}> The case waits for this</label></div>
      <p class="c-s">Holds up: ${esc(c.affects)} · Shares this case’s evidence with the recipient</p>
      <div class="rq-btns"><button type="button" class="b-pri cs-primary" data-do="send">Send check</button><button type="button" class="b-sec" data-do="form" data-form="">Cancel</button></div></div>`;
  }

  // evidence: the facts this decision rests on first, the full trace on request
  function evidenceHtml(c, facts, keys) {
    const tag = (f) => (f.status === 'agree' ? ['ok', 'Confirmed'] : f.status === 'single' ? ['', 'On record'] : f.status === 'conflict' ? ['neg', 'Sources disagree'] : ['warn', 'Pending confirmation']);
    const n = c.evidence.filter((e) => !e.superseded).length;
    return `<details class="cs-sec cs-fold"${ui.guided ? ' open' : ''}><summary><h4>Evidence</h4><span class="c-s">${n} source${n === 1 ? '' : 's'} · where each fact came from, which version, and whether sources are independent</span></summary>
        <table class="tbl rq-trace"><thead><tr><th scope="col">Fact</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Independence</th></tr></thead><tbody>
        ${facts.map((f) => f.readings.length ? f.readings.map((r, i) => {
          const e = c.evidence.find((y) => y.id === r.evidence);
          const hidden = e && !C.seesEvidence(D, me, e);
          return `<tr>${i === 0 ? `<td rowspan="${f.readings.length}">${esc(f.label)}<p><span class="st ${tag(f)[0]}">${tag(f)[1]}</span></p></td>` : ''}
            <td>${hidden ? '<span class="c-s">Restricted</span>' : esc(showVal(r.value, c.module, f.key))}</td>
            <td>${esc(r.label)}<p class="c-s">${esc(r.system)} · ${esc(r.loc || '')} · ${esc(at(r.recorded))} · v${r.version}</p></td>
            <td>${r.inferred ? `<span class="st">Extracted from text</span> <span class="c-s">“${esc(r.quote)}”</span>` : ''}${r.copied ? ' <span class="st warn">Copied from another source</span>' : ''}<p class="c-s">${r.copies.length ? `Same upstream as ${esc(r.copies.join(', '))}` : 'Independent'}</p></td></tr>`;
        }).join('') : `<tr><td>${esc(f.label)}<p><span class="st warn">Pending confirmation</span></p></td><td colspan="3" class="c-s">No source has it yet${f.who ? `. ${esc(team(f.who))} can supply it.` : '.'}</td></tr>`).join('')}
        </tbody></table>
        ${docsHtml(c)}
        ${c.evidence.some((e) => e.superseded) ? `<p class="sl">Earlier versions, kept</p><ul class="rq-old">${c.evidence.filter((e) => e.superseded).map((e) => `<li>${esc(e.label)} v${e.version} · replaced ${esc(at(e.superseded))}</li>`).join('')}</ul>` : ''}
      </details>`;
  }
  // documents keep their text; the extracted spans are marked where they were read
  function docsHtml(c) {
    const docs = c.evidence.filter((e) => e.text && C.seesEvidence(D, me, e));
    if (!docs.length) return '';
    return `${docs.map((e) => {
      const spans = Object.values(C.readingsOf(e)).filter((r) => r.span).sort((a, b) => a.span[0] - b.span[0]);
      let html = '', i = 0;
      for (const r of spans) { if (r.span[0] < i) continue; html += esc(e.text.slice(i, r.span[0])) + `<mark>${esc(e.text.slice(r.span[0], r.span[1]))}</mark>`; i = r.span[1]; }
      html += esc(e.text.slice(i));
      return `<p class="sl">${esc(e.label)} · ${esc(e.system)}</p><pre class="rq-doc">${html}</pre>`;
    }).join('')}<p class="c-s">Marked text is what the extractor read. In this demo the extractor is deterministic code that stands in for a model.</p>`;
  }

  // checks: the live ones first, finished ones folded
  function checksHtml(c, tasks) {
    const live = tasks.filter((t) => t.status !== 'closed'), done = tasks.filter((t) => t.status === 'closed');
    const lateN = live.filter((t) => C.isOverdue(state, t)).length;
    return `<details class="cs-sec cs-fold"${ui.guided || ui.form && ui.form.includes(':') ? ' open' : ''}><summary><h4>Checks</h4><span class="c-s">${live.length} open${lateN ? ` · <b class="neg">${lateN} overdue</b>` : ''}${done.length ? ` · ${done.length} finished` : ''}</span></summary>
      ${ui.guided ? `<p class="c-s">The case stays with ${esc(name(c.owner))}; a check only answers its question.</p>` : ''}
      ${live.length ? live.map((t) => taskHtml(c, t)).join('') : '<p class="d-empty">No check is open.</p>'}
      ${done.length ? `<details class="cs-det"><summary>Finished checks (${done.length})</summary>${done.map((t) => taskHtml(c, t)).join('')}</details>` : ''}</details>`;
  }
  function taskHtml(c, t) {
    const mine = t.assignee === me, lead = C.isLead(D, me, t.team), owner = C.onCase(D, me, c), member = D.people[me].team === t.team;
    const b = (doing, label) => `<button type="button" class="b-sec b-sm" data-do="${doing}" data-t="${t.id}">${label}</button>`;
    const btns = [];
    if (['open', 'claimed'].includes(t.status) && lead) btns.push(b('tform-assign', 'Assign within team'));
    if (['claimed', 'more-info'].includes(t.status) && mine) btns.push(b('tform-clarify', 'Ask the owner'));
    if ((mine || (t.status === 'open' && member)) && ['open', 'claimed', 'more-info'].includes(t.status)) btns.push(b('tform-return', 'Return'));
    if (t.status === 'closed' && owner) btns.push(b('tform-more', 'Reopen'));
    if (['open', 'claimed', 'returned', 'more-info', 'clarify'].includes(t.status) && (mine || lead || owner)) btns.push(b('tform-reassign', 'Reassign'));
    if (t.status !== 'closed' && owner) btns.push(b('tform-withdraw', 'Withdraw'));
    const f = ui.form && ui.form.startsWith(t.id + ':') ? ui.form.slice(t.id.length + 1) : null;
    const area = (id, ph) => `<label class="sr" for="${id}">${ph}</label><textarea id="${id}" rows="2" placeholder="${ph}"></textarea>`;
    return `<article class="ck${C.isOverdue(state, t) ? ' late' : ''}">
      <p class="ck-h"><b>${t.id}</b> · ${t.to === 'team' && !t.assignee ? esc(team(t.team)) : `${esc(name(t.assignee))} (${esc(team(t.team))})`} · <span class="st${t.status === 'replied' ? ' warn' : t.status === 'closed' ? ' ok' : ''}">${esc(TASK[t.status])}</span>${t.blocking ? '' : ' <span class="st">Question only</span>'}${C.isOverdue(state, t) ? ' <span class="st neg">Overdue</span>' : ''}<span class="c-s"> · due ${esc(at(t.due))}${t.original !== t.recipient ? ` · first sent to ${esc(t.original.startsWith('team:') ? team(t.original.slice(5)) : name(t.original.slice(7)))}` : ''}</span></p>
      <p class="ck-q">${esc(t.question)}</p>${t.why ? `<p class="c-s">Why: ${esc(t.why)}${t.requested.length ? ` · asks for ${esc(t.requested.join(', '))}` : ''}</p>` : ''}
      ${t.clarify ? `<p class="c-s">Question back: “${esc(t.clarify.q)}”${t.clarify.a ? ` · answer: “${esc(t.clarify.a)}”` : ''}</p>` : ''}
      ${t.returnReason ? `<p class="c-s">Returned: “${esc(t.returnReason)}”</p>` : ''}
      ${t.reply ? `<div class="rq-reply"><p class="sl">Reply from ${esc(name(t.reply.by))} · ${esc(at(t.reply.at))} · ${esc(t.reply.conclusion)}</p><p>${esc(t.reply.answer)}</p>${t.reply.evidence.length ? `<p class="c-s">Attached: ${esc(t.reply.evidence.map((id) => (c.evidence.find((e) => e.id === id) || {}).label).join(', '))}</p>` : ''}</div>` : ''}
      ${btns.length ? `<div class="rq-btns">${btns.join('')}</div>` : ''}
      ${f === 'assign' ? `<div class="cs-form"><select id="as-p" aria-label="Person">${Object.entries(D.people).filter(([, p]) => p.team === t.team).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="b-pri" data-do="assign" data-t="${t.id}">Assign</button></div>` : ''}
      ${f === 'reassign' ? reassignForm(t, false) : ''}
      ${['clarify', 'return', 'more', 'withdraw'].includes(f) ? `<div class="cs-form">${area('tx', { clarify: 'Your question to the owner', return: 'Why you cannot handle it', more: 'What is still missing', withdraw: 'Why it is withdrawn' }[f])}<button type="button" class="b-pri" data-do="${f}" data-t="${t.id}">Send</button></div>` : ''}
      <details class="ck-hist"><summary class="c-s">History (${t.history.length})</summary><ol class="rq-tl">${t.history.map((h) => `<li><span class="c-s">${esc(at(h.at))} · ${esc(name(h.by))}</span> ${esc(h.event)}${h.detail ? ` <span class="c-s">· ${esc(h.detail)}</span>` : ''}</li>`).join('')}</ol></details></article>`;
  }
  // activity: the latest few, the rest folded; decisions show whether they still hold
  function activityHtml(c) {
    const h = c.history.slice().reverse();
    // what changed sits one click down, in words, not as raw records
    const li = (e) => { const chg = e.changes && e.changes.length; return `<li><span class="c-s">${esc(at(e.at))} · ${esc(D.people[e.by] ? name(e.by) : e.by)}</span><br>${esc(e.event)}${e.detail && !chg ? ` <span class="c-s">· ${esc(e.detail)}</span>` : ''}${chg ? `<details class="rq-chg-d"><summary class="c-s">${e.changes.length} value${e.changes.length === 1 ? '' : 's'} changed</summary><ul class="rq-chg">${e.changes.map((x) => `<li>${esc(x.label)}: <s>${esc(C.fmt(x.before))}</s> → ${esc(C.fmt(x.after))}</li>`).join('')}</ul></details>` : ''}</li>`; };
    const stale = c.decisions.filter((d) => d.stale && !d.rereviewed).length;
    return `<details class="cs-sec cs-fold"${ui.guided || stale ? ' open' : ''}><summary><h4>Activity</h4><span class="c-s">${h.length} entr${h.length === 1 ? 'y' : 'ies'}${c.decisions.length ? ` · ${c.decisions.length} decision${c.decisions.length === 1 ? '' : 's'}` : ''}${stale ? ` · <b class="warn">${stale} need${stale === 1 ? 's' : ''} re-review</b>` : ''}</span></summary>
      ${c.decisions.length ? `<ul class="cs-dec">${c.decisions.map((d) => `<li>${d.stale && !d.rereviewed ? '<span class="st warn">Needs re-review</span>' : d.rereviewed ? '<span class="st">Replaced</span>' : '<span class="st ok">Holds</span>'} <b>${esc(d.label)}</b> <span class="c-s">· ${esc(name(d.by))} · ${esc(at(d.at))} · evidence v${d.version}${d.reason ? ` · “${esc(d.reason)}”` : ''}</span></li>`).join('')}</ul>` : ''}
      <ol class="rq-tl">${h.slice(0, 5).map(li).join('')}</ol>
      ${h.length > 5 ? `<details class="cs-det"><summary>Full history (${h.length} entries)</summary><ol class="rq-tl">${h.slice(5).map(li).join('')}</ol></details>` : ''}</details>`;
  }

  // ---------- render ----------
  const WHERE = (r) => (r.page === 'home' ? 'My Work' : r.page === 'search' ? 'Search' : r.page === 'store' ? 'Store owner view' : r.page === 'mywork' ? 'My Work' : r.page === 'queue' ? `Work Queues · ${MODULES[r.module].label}` : r.page === 'other' ? `${MODULES[r.module].label} · ${MODULES[r.module].other.label}` : r.page === 'case' ? `${MODULES[state.cases[r.id].module].label} · ${r.id}` : r.label);
  function render() {
    const r = ui.route;
    const head = $('#wb-head'); if (head) head.innerHTML = headHtml(r);
    const body = $('#rq-body');
    if (body && r.page === 'store') { body.innerHTML = storeHtml(); body.className = 'is-store'; }
    if (body && r.page === 'search') { body.innerHTML = searchHtml(r.q); body.className = 'is-search'; }
    const sIn = $('#wb-s'); if (sIn && document.activeElement !== sIn) sIn.value = r.page === 'search' ? r.q || '' : '';
    if (body && ['mywork', 'queue', 'case'].includes(r.page)) {
      const c = r.page === 'case' && state.cases[r.id];
      // folded sections stay as the person left them while they work on the same case
      const kept = c && body.dataset.shown === c.id ? $$('.cs-fold', body).map((d) => d.open) : null;
      body.dataset.shown = c ? c.id : '';
      body.innerHTML = r.page === 'mywork' ? myWorkHtml() : r.page === 'queue' ? queueHtml(r.module) : caseHtml(c);
      body.className = r.page === 'case' ? 'is-case' : '';
      const key = r.page + '|' + (r.id || r.module || '');
      if (key !== ui.shown) { ui.shown = key; void body.offsetWidth; body.classList.add('rq-enter'); }
      if (c) body.dataset.version = c.version;
      if (kept) $$('.cs-fold', body).forEach((d, i) => { if (kept[i]) d.open = true; });
    }
    const mode = modeOf(r);
    const who = $('.app-top .who'); if (who) who.hidden = r.page === 'store' || mode === 'lab';
    const sf = $('#wb-sf'); if (sf) sf.hidden = mode !== 'app';
    $('#rq-msg').hidden = !ui.msg; $('#rq-msg').textContent = ui.msg;
    $('#wb-where').textContent = WHERE(r);
    // the rail: where you are, and counts that always mean the same thing
    const cur = r.page === 'search' ? 'search' : r.page === 'store' ? 'store' : r.page === 'case' ? `queue/${state.cases[r.id].module}` : r.page === 'other' ? `queue/${r.module}` : r.page === 'queue' ? `queue/${r.module}` : r.page === 'view' ? hashOf(r).slice(1) : 'mywork';
    $$('#wb-nav [data-route]').forEach((a) => { if (a.dataset.route === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const tryLink = $('#wb-nav [data-try-case]'); if (tryLink) { if (ui.guided && r.page === 'case') tryLink.setAttribute('aria-current', 'page'); else tryLink.removeAttribute('aria-current'); }
    const storeLink = $('#wb-nav [data-try-store]'); if (storeLink) { if (r.store) storeLink.setAttribute('aria-current', 'page'); else storeLink.removeAttribute('aria-current'); }
    if (r.store) $$('#wb-nav [data-route]').forEach((a) => a.removeAttribute('aria-current'));
    $('#wb-menu-l').textContent = WHERE(r);
    for (const m of Object.keys(MODULES)) { const el = $(`#wb-nav [data-n="${m}"]`); if (el) { const n = cases().filter((c) => c.module === m && !c.closed && c.exceptions.some((x) => x.status === 'open')).length; el.textContent = n || ''; } }
    const w = C.myWork(state, D, A, me), n = w.needs.length + w.assigned.length + w.inbox.length;
    $('#n-mywork').textContent = n || '';
  }

  // ---------- events ----------
  const val = (s) => ($(s) ? $(s).value : '');
  const T = (id) => state.tasks[id];
  function setMe(p) { me = D.people[p] ? p : 'ava'; try { localStorage.setItem(AS, me); } catch {} $('#rq-as').value = me; ui.form = null; ui.msg = ''; }
  const SETTINGS = [['An online store', ['books', 'store', 'support']], ['A mortgage lender', ['servicing', 'payments', 'approvals', 'statements', 'adjustments', 'registration']], ['A finance team', ['treasury', 'ap', 'ar', 'gl', 'payroll', 'time']]];
  const optP = ([k, p]) => `<option value="${k}"${k === me ? ' selected' : ''}>${esc(p.name)} · ${esc(team(p.team))}</option>`;
  const grouped = SETTINGS.flatMap(([, ts]) => ts);
  $('#rq-as').innerHTML = SETTINGS.map(([l, ts]) => `<optgroup label="${esc(l)}">${Object.entries(D.people).filter(([, p]) => ts.includes(p.team)).map(optP).join('')}</optgroup>`).join('') + Object.entries(D.people).filter(([, p]) => !grouped.includes(p.team)).map(optP).join('');
  $('#rq-as').addEventListener('change', () => { setMe($('#rq-as').value); render(); });
  const saveF = () => { try { sessionStorage.setItem(FKEY, JSON.stringify(filters)); } catch {} };

  // links with data-route move inside the workbench without a page jump
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-route]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); const r = parse('#' + a.dataset.route); if (r.page !== 'case') ui.guided = false; go(r); closeMenu(); if (r.page === 'case' || r.page === 'store') requestAnimationFrame(toSheet); return; }
    const fb = e.target.closest('[data-feedback]');
    if (fb) { e.preventDefault(); const m = $('#ct-msg'); if (m && !m.value) m.value = `About the store owner view (${sv.sel}): `; go({ page: 'home', contact: true }); if (m) setTimeout(() => m.focus({ preventScroll: true }), 400); return; }
    const st = e.target.closest('[data-try-store]');
    if (st) { e.preventDefault(); go({ page: 'store', explain: true }); closeMenu(); return; }
    const t = e.target.closest('[data-try-case]');
    if (t) { e.preventDefault(); go({ page: 'case', try: true }); closeMenu(); requestAnimationFrame(toSheet); return; }
    const c = e.target.closest('button[data-case]');
    if (c) { go({ page: 'case', id: c.dataset.case }); toSheet(); return; }
    const o = e.target.closest('[data-open-view]');
    if (o && o.dataset.openView === 'mine') { go({ page: 'view', view: 'mine', label: 'Data & Imports' }); }
  });
  // phones: the rail folds into a menu
  const closeMenu = () => { $('#wb-menu').setAttribute('aria-expanded', 'false'); $('#wb-nav').classList.remove('open'); };
  $('#wb-menu').addEventListener('click', () => { const open = $('#wb-menu').getAttribute('aria-expanded') !== 'true'; $('#wb-menu').setAttribute('aria-expanded', String(open)); $('#wb-nav').classList.toggle('open', open); });
  $('#wb-q-t').addEventListener('click', () => { const b = $('#wb-q-t'), open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); $('#wb-q').hidden = !open; });

  // the search box above every workbench page: results follow the typing; Enter opens the first; / jumps here
  const sBox = $('#wb-s');
  if (sBox) {
    sBox.addEventListener('input', () => {
      clearTimeout(sBox._t);
      sBox._t = setTimeout(() => go({ page: 'search', q: sBox.value }, { replace: ui.route.page === 'search' }), 140);
    });
    $('#wb-sf').addEventListener('submit', (e) => {
      e.preventDefault(); clearTimeout(sBox._t);
      if (ui.route.page !== 'search' || ui.route.q !== sBox.value) go({ page: 'search', q: sBox.value }, { replace: ui.route.page === 'search' });
      const first = $('.sr-row'); if (first) { sBox.blur(); first.click(); }
    });
    sBox.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { const first = $('.sr-row'); if (first) { e.preventDefault(); first.focus(); } }
      if (e.key === 'Escape' && sBox.value) { e.preventDefault(); sBox.value = ''; go({ page: 'search', q: '' }, { replace: ui.route.page === 'search' }); }
    });
    addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const pal = $('#palette'); if (pal && !pal.hidden) return;
      e.preventDefault(); toWorkbench(); sBox.focus({ preventScroll: true }); sBox.select();
    });
    // arrows move through the results, and back up into the box
    $('#sheet').addEventListener('keydown', (e) => {
      const row = e.target.closest && e.target.closest('.sr-row'); if (!row || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const all = $$('.sr-row'), i = all.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault(); if (i < 0) sBox.focus(); else if (all[i]) all[i].focus();
    });
  }

  // the payout radio group: arrow keys move the selection, as a radio group should
  $('#sheet').addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.sv-p[role="radio"]');
    if (!b || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const all = $$('.sv-p[role="radio"]'), i = all.indexOf(b);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + all.length) % all.length;
    sv.sel = all[j].dataset.p; saveSv(); render();
    const nb = $(`.sv-p[data-p="${sv.sel}"]`); if (nb) nb.focus();
  });
  $('#sheet').addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (f !== 'q') return;
    const mod = ui.route.module; filters[mod].q = e.target.value; saveF();
    clearTimeout(e.target._t); e.target._t = setTimeout(() => { const pos = e.target.selectionStart; render(); const i = $('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200);
  });
  $('#sheet').addEventListener('change', (e) => {
    const im = e.target.dataset.imp;
    if (im === 'file') {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      if (file.size > 5e6) { imp = { ...imp, text: null, name: file.name, err: 'This file is over 5 MB. Export a single payout rather than all transactions.' }; render(); return; }
      const rd = new FileReader();
      rd.onload = () => { imp = { ...imp, text: String(rd.result), name: file.name, err: '' }; log('Read a payout file in the store view', file.name); render(); impFocus(); };
      rd.readAsText(file); return;
    }
    if (im === 'bank') { const had = document.activeElement === e.target; imp.bank = e.target.value.trim(); render(); const nb = $('[data-imp="bank"]'); if (had && nb) { nb.focus({ preventScroll: true }); nb.setSelectionRange(nb.value.length, nb.value.length); } return; }
    const f = e.target.dataset.f;
    if (f && f !== 'q') { filters[ui.route.module][f] = e.target.value || undefined; saveF(); render(); }
    if (e.target.name === 'es-to') { ui.escTo = e.target.value; $('#es-team-l').hidden = ui.escTo !== 'team'; $('#es-person-l').hidden = ui.escTo !== 'person'; }
  });
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]'); if (!b || b.disabled) return;
    const d = b.dataset.do, c = ui.route.page === 'case' && state.cases[ui.route.id], t = b.dataset.t, version = c ? +$('#rq-body').dataset.version : undefined;
    if (d === 'sq') { const v = b.dataset.q; if (sBox) sBox.value = v; return go({ page: 'search', q: v }, { replace: ui.route.page === 'search' }); }
    if (d === 'sv') { sv.sel = b.dataset.p; saveSv(); render(); const h = $('#sv-h'); if (h && innerWidth < 900) h.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); return; }
    if (d === 'svcheck') { sv.seen[b.dataset.p] = true; saveSv(); log('Read a source in the store view', b.dataset.p); render(); return; }
    if (d === 'impsample') { imp = { text: PI.SAMPLE, name: 'sample-payout-transactions.csv', bank: PI.SAMPLE_BANK.toLocaleString('en-US', { minimumFractionDigits: 2 }) }; render(); impFocus(); return; }
    if (d === 'impclear') { imp = { text: null, name: '', bank: '' }; render(); return; }
    if (d === 'svreset') { sv = { sel: 'PO-1028', seen: {} }; saveSv(); render(); return; }
    if (d === 'svteam') { setMe('sam'); go({ page: 'case', id: b.dataset.c }); toSheet(); return; }
    if (d === 'as') { setMe(b.dataset.p); render(); const p = $('.cs-primary'); if (p) { flash(p); p.focus({ preventScroll: true }); } return; }
    if (d === 'reset') { state = fresh(); save(); sv = { sel: 'PO-1028', seen: {} }; saveSv(); log('Reset the demo', 'Back to the starting cases'); return render(); }
    if (d === 'tryreset') { state = fresh(); save(); setMe('ava'); log('Restarted the guided demo', 'Back to the starting cases'); return go({ page: 'case', try: true }, { replace: true }); }
    if (d === 'clearf') { filters[ui.route.module] = { status: 'active' }; saveF(); return render(); }
    if (d === 'scan') {
      // say what the run found, so a run that changes nothing still reads as done
      const m = b.dataset.m; let r = { created: [], updated: [] };
      run(() => { r = C.sync(state, D, A, m, SOURCES[m]()); return { ok: true }; });
      const n = r.created.length, u = r.updated.length;
      return log(`Ran ${MODULES[m].label} checks`, n ? `${n} new case${n === 1 ? '' : 's'}: ${r.created.join(', ')}` : `No new findings · ${u} existing case${u === 1 ? '' : 's'} re-checked`);
    }
    if (d === 'form') {
      ui.form = b.dataset.form || null; ui.escTo = null; render();
      const fm = ui.form && $('.cs-form'); if (fm) { const fld = $('textarea, select, input', fm); if (fld) fld.focus({ preventScroll: true }); if (fm.getBoundingClientRect().bottom > innerHeight) fm.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
      else if (!ui.form) { const p = $('.cs-primary'); if (p) p.focus({ preventScroll: true }); }
      return;
    }
    if (d.startsWith('tform-')) { ui.form = `${t}:${d.slice(6)}`; render(); const fm = $('.ck .cs-form'); if (fm) { const fld = $('textarea, select', fm); if (fld) fld.focus({ preventScroll: true }); } return; }
    if (d === 'priority') return run(() => C.setPriority(state, D, c.id, val('#pr-l'), val('#pr-r'), me), ['Changed priority', `${c.id} → ${val('#pr-l')}`]);
    if (d === 'cls') return run(() => C.reclassify(state, D, c.id, b.dataset.x, val('#cl-v'), val('#cl-r'), me), ['Changed classification', `${b.dataset.x} → ${CLS[val('#cl-v')]}`]);
    if (d === 'recheck') return run(() => ({ ok: true, ...C.runCheck(state, A, c.id, me, 'Re-run by ' + name(me)) }), ['Re-ran checks', c.id]);
    if (d === 'inbox') return run(() => C.attachEvidence(state, D, A, c.id, b.dataset.i, me, { via: 'inbox' }), ['Added new evidence', c.id]);
    if (d === 'act') { const a = b.dataset.a; return run(() => C.act(state, D, A, c.id, a, { by: me, reason: val('#r-' + CSS.escape(a)), version }), ['Decision recorded', `${c.id} · ${a}`]); }
    if (d === 'send') {
      const to = ($('input[name="es-to"]:checked') || {}).value || 'team';
      const x = topX(c), draft = (x && c.drafts && c.drafts[x.code]) || {};
      b.disabled = true;
      return run(() => C.escalate(state, D, c.id, { to, team: val('#es-team'), person: val('#es-person'), question: val('#es-q'), why: val('#es-why'), affects: c.affects, requested: draft.requested, requires: to === 'person' ? draft.requires : null, kind: draft.kind, blocking: $('#es-block').checked, exceptionIds: c.exceptions.filter((y) => y.status === 'open').map((y) => y.id), evidence: c.evidence.map((y) => y.id), due: new Date(new Date(state.now).getTime() + +val('#es-due') * 36e5).toISOString() }, me),
        ['Sent a check', `${c.id} → ${to === 'team' ? team(val('#es-team')) : name(val('#es-person'))}`]);
    }
    if (d === 'claim') return run(() => C.claim(state, D, t, me), ['Claimed a check', t]);
    if (d === 'assign') return run(() => C.assign(state, D, t, me, val('#as-p')), ['Assigned a check', `${t} → ${name(val('#as-p'))}`]);
    if (d === 'reassign') return run(() => C.reassign(state, D, t, me, { to: val('#ra-to'), person: val('#ra-p'), team: val('#ra-t'), reason: val('#ra-r') }), ['Reassigned a check', t]);
    if (d === 'reply') { const attach = $$('[data-attach]:checked').map((i) => i.value); b.disabled = true; return run(() => C.reply(state, D, A, t, me, { answer: val('#rp-a'), conclusion: val('#rp-c'), attach }), ['Replied to a check', `${t} · ${val('#rp-c')}`]); }
    if (d === 'clarify') return run(() => C.askClarify(state, D, t, me, val('#tx')), ['Asked for clarification', t]);
    if (d === 'answer') return run(() => C.answerClarify(state, D, t, me, val('#tx')), ['Answered a question', t]);
    if (d === 'return') return run(() => C.returnTask(state, D, t, me, val('#tx')), ['Returned a check', t]);
    if (d === 'more') return run(() => C.askMore(state, D, t, me, val('#tx')), ['Sent a check back', t]);
    if (d === 'withdraw') return run(() => C.closeTask(state, D, t, me, val('#tx')), ['Withdrew a check', t]);
    if (d === 'acceptT') return run(() => C.accept(state, D, t, me), ['Accepted a reply', `${t} · ${T(t).reply.conclusion}`]);
    if (d === 'remind') return run(() => C.remind(state, D, t, me), ['Sent a reminder (in-app)', t]);
    if (d === 'lead') return run(() => C.escalateToLead(state, D, t, me), ['Passed an overdue check to the lead', t]);
  });

  // ---------- links from the module checks and reports ----------
  window.tmCaseLink = (key) => {
    const c = caseByKey(key);
    return c ? `<button type="button" class="link-btn sm" data-case="${c.id}">${c.id} →</button>` : '';
  };
  window.tmOpenCase = (id) => go({ page: 'case', id });
  window.tmGo = (hash) => go(parse(hash));
  window.tmSyncCash = (win) => { C.sync(state, D, A, 'cash', { bank: window.TM.bank, gl: window.TM.gl, window: win }); save(); render(); };

  // first paint: straight to the address in the URL, with no other panel shown first
  apply(parse(location.hash));
  app.refresh && app.refresh();
})();
