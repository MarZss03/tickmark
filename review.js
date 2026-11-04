// Tickmark Review Queue and Case Review: the page's casework. The rules live in cases.js and
// case-rules.js; this file renders them, keeps the demo in this browser, and writes to the audit log.
(() => {
  const E = window.TickmarkEngine, C = window.TickmarkCases, TMC = window.TMC;
  const A = window.TickmarkCaseRules(E, window.TM, TMC);
  const D = TMC.dir;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const app = window.tmApp || {};
  const PERIOD = { start: '2026-10-01', end: '2026-10-15' };

  const MOD = { cash: 'Cash', payroll: 'Payroll', mortgage: 'Mortgage' };
  const CLS = { 'source-error': 'Suspected source error', timing: 'Timing or sync gap', business: 'Real business difference', insufficient: 'Not enough evidence' };
  const STATUS = { open: 'Open', waiting: 'Waiting on a check', 'reply-in': 'Reply to review', resolved: 'Nothing open', closed: 'Closed' };
  const TASK = { open: 'Waiting to be claimed', claimed: 'With the handler', clarify: 'Handler asked a question', 'more-info': 'Sent back for more', returned: 'Returned', replied: 'Reply in', closed: 'Closed' };
  const FACT = { agree: ['ok', 'Independent sources agree'], single: ['', 'One source'], conflict: ['neg', 'Sources disagree'], pending: ['warn', 'To confirm'] };
  const PRI = { P1: 'neg', P2: 'warn', P3: '', P4: 'ok' };
  const at = (s) => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toUTCString().slice(0, 11).replace(',', '') + ' ' + d.toISOString().slice(11, 16); };
  const name = (pid) => (D.people[pid] ? D.people[pid].name : pid);
  const team = (t) => (D.teams[t] ? D.teams[t].name : t);

  // ---------- the demo, saved in this browser ----------
  const KEY = 'tickmark:cases:v1', AS = 'tickmark:as';
  let state = null;
  function fresh() {
    const s = C.newState();
    C.sync(s, D, A, 'cash', { bank: window.TM.bank, gl: window.TM.gl, window: +($('#cash-window') ? $('#cash-window').value : 3) });
    C.sync(s, D, A, 'payroll', { hris: window.TM.hris, payroll: window.TM.payroll, equity: window.TM.equity, period: PERIOD });
    C.sync(s, D, A, 'mortgage', {});
    return s;
  }
  try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { state = null; }
  if (!state || state.v !== 1) state = fresh();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  save();
  let me = 'ava';
  try { me = localStorage.getItem(AS) || 'ava'; } catch {}
  if (!D.people[me]) me = 'ava';
  const ui = { open: null, view: 'all', f: {}, form: null, msg: '', busy: false };
  const log = (event, detail) => app.log && app.log(name(me), event, detail);

  // ---------- a step, its result, and a fresh render ----------
  function run(fn, okMsg) {
    if (ui.busy) return;
    ui.busy = true;
    try {
      const r = fn();
      if (r && r.ok === false) { ui.msg = r.error + (r.suggest ? ` Authorised: ${r.suggest.map((p) => `${p.name} (${team(p.team)})`).join(', ')}.` : ''); }
      else { ui.msg = ''; ui.form = null; save(); if (okMsg) log(okMsg[0], okMsg[1]); }
    } finally {
      ui.busy = false; render();
      // in the guided case, each finished step brings the next instruction back into view
      const c = ui.open && state.cases[ui.open];
      if (!ui.msg && c && c.key === TRY_KEY && $('.rq-guide')) window.scrollTo({ top: $('.rq-guide').getBoundingClientRect().top + window.scrollY - 84, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  // ---------- queue ----------
  const VIEWS = [['all', 'All open'], ['mine', 'My cases'], ['assigned', 'Checks assigned to me'], ['team', 'My team to claim'], ['waiting', 'Waiting on other teams']];
  function queueHtml() {
    const base = { me, view: ui.view === 'all' ? null : ui.view, ...ui.f, status: ui.f.status || 'active' };
    const rows = C.queue(state, D, base);
    const all = state.order.map((id) => state.cases[id]);
    const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
    const codes = [...new Set(all.flatMap((c) => c.exceptions.filter((x) => x.status === 'open').map((x) => x.code)))].sort();
    const counts = Object.fromEntries(VIEWS.map(([v]) => [v, C.queue(state, D, { me, view: v === 'all' ? null : v, status: 'active' }).length]));
    return `<div class="rq-views" role="tablist" aria-label="Queue views">${VIEWS.map(([v, l]) => `<button type="button" role="tab" class="b-sec${ui.view === v ? ' sel' : ''}" aria-selected="${ui.view === v}" data-do="view" data-v="${v}">${l} <span class="count">${counts[v]}</span></button>`).join('')}</div>
      <div class="rq-filters">
        <label class="tol">Module <select data-f="module">${opt('', 'All', ui.f.module || '')}${Object.entries(MOD).map(([k, l]) => opt(k, l, ui.f.module)).join('')}</select></label>
        <label class="tol">Type <select data-f="code">${opt('', 'All', ui.f.code || '')}${codes.map((k) => opt(k, k, ui.f.code)).join('')}</select></label>
        <label class="tol">Priority <select data-f="priority">${opt('', 'All', ui.f.priority || '')}${['P1', 'P2', 'P3'].map((k) => opt(k, k, ui.f.priority)).join('')}</select></label>
        <label class="tol">Status <select data-f="status">${opt('active', 'Not closed', ui.f.status || 'active')}${Object.entries(STATUS).map(([k, l]) => opt(k, l, ui.f.status)).join('')}</select></label>
        <label class="tol">Case owner <select data-f="owner">${opt('', 'Anyone', ui.f.owner || '')}${[...new Set(all.map((c) => c.owner))].map((p) => opt(p, name(p), ui.f.owner)).join('')}</select></label>
        <label class="tol">Waiting team <select data-f="team">${opt('', 'Any', ui.f.team || '')}${Object.keys(D.teams).map((t) => opt(t, team(t), ui.f.team)).join('')}</select></label>
        <label class="tol">Check assigned to <select data-f="assignee">${opt('', 'Anyone', ui.f.assignee || '')}${Object.keys(D.people).map((p) => opt(p, name(p), ui.f.assignee)).join('')}</select></label>
      </div>
      <table class="tbl rq-t"><thead><tr><th scope="col">Case</th><th scope="col">What was found</th><th scope="col">Why it is first</th><th scope="col">Who has it</th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr>
        <td><button type="button" class="rq-open" data-do="open" data-id="${r.id}"><span class="rq-id">${r.id}</span> <span class="pill">${MOD[r.module]}</span>${r.branch ? ` <span class="pill">${esc(r.branch)}</span>` : ''}<span class="rq-title">${esc(r.title)}</span></button></td>
        <td>${r.found.length ? `${esc(r.found[0])}${r.found.length > 1 ? ` <span class="c-s">+${r.found.length - 1} more</span>` : ''}<p class="c-s">${esc([...new Set(r.by)].join(', '))}</p>` : `<span class="c-s">${esc(r.stage || 'Nothing open')}</span>`}</td>
        <td><span class="pill ${PRI[r.priority]}">${r.priority}${r.auto ? '' : ' · set by a person'}</span><p class="c-s">${esc(r.reasons.slice(0, 2).join(' · '))}</p></td>
        <td>${esc(r.ownerName)}<p class="c-s">${r.waitingOn.length ? `Waiting on ${esc(r.waitingOn.join(', '))}` : esc(STATUS[r.status])}${r.next ? ` · follow up ${esc(at(r.next))}` : ''}${r.overdue ? ' <span class="pill neg">Overdue</span>' : ''}</p></td></tr>`).join('') : '<tr><td colspan="4" class="d-empty">Nothing here for this view.</td></tr>'}
      </tbody></table>`;
  }

  // ---------- the guided payout case: each step read from the case's own state ----------
  const TRY_KEY = 'ms:ML-40311';
  const caseByKey = (k) => state.order.map((id) => state.cases[id]).find((c) => c.key === k);
  const WAIT = ['open', 'claimed', 'more-info'];
  function guideStep(c) {
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const pay = tasks.find((t) => t.team === 'payments');
    const dan = tasks.find((t) => t.original === 'person:daniel' || t.assignee === 'daniel');
    const open = (code) => c.exceptions.some((x) => x.status === 'open' && x.code === code);
    if (c.closed) return { n: 8, done: true, text: 'Done. The timeline below keeps every step, with before-and-after values, and the shortfall notice was never sent. The same handling runs on payroll and cash:' };
    if (!pay) return { n: 1, who: 'ava', at: '[data-form="esc"]', text: 'Read the four answers below: the balance is a fact, its cause is not confirmed yet. Click “Ask a team or a person…”. The question to Payments is already drafted; send it.' };
    if (WAIT.includes(pay.status)) return { n: 2, who: 'leo', at: pay.status === 'open' ? '[data-do="claim"]' : '[data-do="form-reply"]', text: pay.status === 'open' ? 'You are Leo Park in Payments. Under “Checks sent from this case”, click Claim, then Reply: tick the wire log and send.' : 'Click Reply on the Payments check, tick the wire log and send.' };
    if (pay.status === 'replied') return { n: 3, who: 'ava', at: '[data-do="acceptT"]', text: 'Payments replied and the checks re-ran. The receipt time is now a confirmed fact; the settlement date is still open, so the shortfall notice stays locked. Click “Reply answers it”.' };
    if (!dan) return { n: 4, who: 'ava', at: '[data-form="esc"]', text: 'Click “Ask a team or a person…” again. The draft now goes to Daniel Roy, the authorised reviewer. Pick Eliza Moreau first if you want to see a refusal.' };
    if (WAIT.includes(dan.status)) return { n: 5, who: 'daniel', at: '[data-do="form-reply"]', text: 'As Daniel, click Reply on his check, tick the settlement decision and send.' };
    if (dan.status === 'replied') return { n: 6, who: 'ava', at: '[data-do="acceptT"]', text: 'Daniel set the settlement date. Click “Reply answers it” to accept.' };
    if (open('LATE_POSTING')) return { n: 7, who: 'daniel', at: '[data-a="apply-adjustment"]', text: 'Only Daniel holds settlement authority. Click “Reverse the interest charged during our hold”; the checks re-run.' };
    return { n: 8, who: 'daniel', at: '[data-a="resume"]', text: 'Every condition now holds. Click “Resume discharge preparation”.' };
  }
  function guideHtml(c) {
    const g = guideStep(c);
    const others = ['payroll:E-1017:DUPLICATE_PAYMENT', 'cash:2026-10-22:-6850'].map((k) => caseByKey(k)).filter(Boolean);
    return `<div class="card rq-guide" aria-live="polite"><div class="c-head"><p class="c-t">${g.done ? 'Walkthrough done' : `Walkthrough · step ${g.n} of 8`}</p><button type="button" class="link-btn sm" data-do="tryreset">Start over</button></div>
      <ol class="rq-steps" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<li class="${i + 1 < g.n || g.done ? 'done' : i + 1 === g.n ? 'now' : ''}"></li>`).join('')}</ol>
      <p class="rq-gtext">${esc(g.text).replace(/“([^”]+)”/g, '<b>“$1”</b>')}</p>
      ${g.done ? `<div class="rq-btns">${others.map((o) => `<button type="button" class="b-sec" data-do="open" data-id="${o.id}">${esc(o.title)} →</button>`).join('')}</div>`
        : g.who && g.who !== me ? `<div class="rq-btns"><button type="button" class="b-pri" data-do="as" data-p="${g.who}">Act as ${esc(name(g.who))}</button><span class="c-s">Switching people simulates signing in as them.</span></div>`
        : `<div class="rq-btns"><button type="button" class="b-pri" data-do="goto" data-at="${esc(g.at)}">Show me where</button><span class="c-s">Acting as ${esc(name(me))}.</span></div>`}</div>`;
  }

  // ---------- case review ----------
  function caseHtml(c) {
    const facts = C.trace(c);
    const open = c.exceptions.filter((x) => x.status === 'open');
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const acts = C.actionsFor(state, D, A, c.id, me);
    const pri = C.effectivePriority(c);
    const conflicts = facts.filter((f) => f.status === 'conflict'), pending = facts.filter((f) => f.status === 'pending' && f.required);
    const sources = c.evidence.filter((e) => !e.superseded);
    const origins = new Set(sources.map((e) => e.origin));
    const st = C.caseStatus(state, c);
    const onCase = C.onCase(D, me, c);
    const actBtn = (a) => {
      const why = !a.allowed ? `${name(me)} is not authorised (${a.perm})` : a.prereqs.filter((p) => !p.ok).map((p) => p.label).join('; ');
      return `<div class="rq-act"><button type="button" class="${a.kind === 'accept' ? 'b-sec' : 'b-pri'}" data-do="act" data-a="${esc(a.id)}"${a.allowed && a.ready ? '' : ' disabled'}>${esc(a.label)}</button>
        ${a.needsReason && a.allowed && a.ready ? `<label class="sr" for="r-${esc(a.id)}">Reason</label><textarea id="r-${esc(a.id)}" placeholder="Reason, kept with the decision (12+ characters)"></textarea>` : ''}
        <ul class="rq-pre">${a.prereqs.map((p) => `<li class="${p.ok ? 'ok' : 'no'}">${esc(p.label)}</li>`).join('')}${a.allowed ? '' : `<li class="no">${esc(why)}</li>`}</ul></div>`;
    };
    return `<button type="button" class="link-btn" data-do="back">← Review queue</button>
      <div class="rq-head">
        <div><p class="c-s">${c.id} · ${MOD[c.module]}${c.branchLabel ? ' · ' + esc(c.branchLabel) : ''} · owner ${esc(name(c.owner))}</p><h3 class="rq-h">${esc(c.title)}</h3>
          <p class="c-s"><span class="pill">${esc(STATUS[st])}</span>${c.stage ? ` <span class="pill ok">${esc(c.stage)}</span>` : ''} · evidence version ${c.version} · last check ${esc(at(c.lastCheck))}</p></div>
        <div class="rq-pri"><p class="sl">Business priority</p><p><span class="pill ${PRI[pri]}">${pri}</span> ${c.priorityOverride ? `<span class="c-s">set by ${esc(name(c.priorityOverride.by))}: “${esc(c.priorityOverride.reason)}”</span>` : ''}</p>
          <p class="c-s">${esc((c.priority ? c.priority.reasons : []).join(' · '))}</p>
          ${onCase ? `<button type="button" class="link-btn sm" data-do="form" data-form="priority">Change priority</button>` : ''}</div>
      </div>
      ${c.key === TRY_KEY ? guideHtml(c) : ''}
      ${ui.form === 'priority' ? `<div class="rq-form"><label class="tol">Priority <select id="pr-l">${['P1', 'P2', 'P3', 'auto'].map((l) => `<option value="${l}">${l === 'auto' ? 'Back to computed' : l}</option>`).join('')}</select></label><label class="sr" for="pr-r">Reason</label><textarea id="pr-r" placeholder="Why (8+ characters)"></textarea><button type="button" class="b-pri" data-do="priority">Save</button></div>` : ''}

      <div class="rq-four">
        <section class="card"><p class="c-t"><span class="rq-q">1</span>What differs</p>
          ${open.length ? open.map((x) => `<div class="rq-x"><p class="rq-find"><b>${esc(x.title)}</b></p>
            <dl class="rq-ev"><div><dt>Expected</dt><dd class="${String(x.expected).length > 14 ? 'rq-long' : ''}">${esc(x.expected)}</dd></div><div><dt>Found</dt><dd class="${x.expected !== x.actual ? 'rq-off' : ''}${String(x.actual).length > 14 ? ' rq-long' : ''}">${esc(x.actual)}</dd></div></dl>
            <p class="c-s">${esc(x.by)} · <span class="pill">${esc(CLS[x.cls] || x.cls)}</span>${x.clsBy ? ` set by ${esc(name(x.clsBy))}` : ''}${x.confidence ? ` · confidence in the reading: ${esc(x.confidence)}` : ''}${x.seen > 1 ? ` · seen ${x.seen} times, one case` : ''}</p>
            ${x.missing && x.missing.length ? `<p class="rq-pend"><b>Not confirmed yet:</b> ${esc(x.missing.map((m) => m.what).join('; '))}</p>` : ''}
            ${x.cause ? `<p class="rq-inf"><span class="sl">${x.missing && x.missing.length ? 'Possible explanation · not confirmed' : 'Explanation from the evidence above'}</span>${esc(x.cause)}</p>` : ''}
            ${onCase ? `<button type="button" class="link-btn sm" data-do="form" data-form="cls:${x.id}">Change classification</button>` : ''}
            ${ui.form === 'cls:' + x.id ? `<div class="rq-form"><select id="cl-v">${Object.entries(CLS).map(([k, l]) => `<option value="${k}"${k === x.cls ? ' selected' : ''}>${l}</option>`).join('')}</select><textarea id="cl-r" placeholder="Why (8+ characters)"></textarea><button type="button" class="b-pri" data-do="cls" data-x="${x.id}">Save</button></div>` : ''}</div>`).join('') : `<p class="d-empty">Nothing open. ${c.exceptions.filter((x) => x.status !== 'open').length} exception${c.exceptions.length === 1 ? '' : 's'} closed or accepted; history below.</p>`}
        </section>
        <section class="card"><p class="c-t"><span class="rq-q">2</span>Where the evidence comes from</p>
          <p>${sources.length} sources, ${origins.size} independent</p>
          ${conflicts.length ? `<p class="rq-bad">Disagree: ${esc(conflicts.map((f) => f.label + (f.leading ? ` (most independent sources say ${/^\d+\.\d\d$/.test(f.leading) ? E.money(+f.leading) : f.leading})` : '')).join('; '))}</p>` : '<p class="c-s">No conflicting values.</p>'}
          ${pending.length ? pending.map((f) => `<p class="rq-pend"><b>To confirm: ${esc(f.label)}.</b> Checked: ${esc(f.checked || [...new Set(sources.map((e) => e.system))].join(', '))}. Who can supply it: ${esc(team(f.who) || 'the owning team')}.</p>`).join('') : '<p class="c-s">Nothing required is missing.</p>'}
        </section>
        <section class="card"><p class="c-t"><span class="rq-q">3</span>What it holds up</p>
          <p>${esc((c.affects || '—').replace(/^\w/, (m) => m.toUpperCase()))}</p><p class="c-s">${esc(c.dueLabel || 'Due')}: ${esc(at(c.due))}</p>
          ${tasks.filter((t) => C.OPEN_TASK.includes(t.status)).map((t) => `<p class="c-s">${t.blocking ? 'Must wait for' : 'Question to'} ${esc(t.assignee ? name(t.assignee) : team(t.team))} · ${esc(TASK[t.status])}${C.isOverdue(state, t) ? ' <span class="pill neg">Overdue</span>' : ''}</p>`).join('')}
        </section>
        <section class="card"><p class="c-t"><span class="rq-q">4</span>What you can do now</p><p class="c-s">Acting as ${esc(name(me))}, ${esc(D.people[me].role)}</p>
          ${onCase && !c.closed ? `<div class="rq-btns"><button type="button" class="${acts.some((a) => a.allowed && a.ready && a.kind !== 'accept') ? 'b-sec' : 'b-pri'}" data-do="form" data-form="esc">Ask a team or a person…</button><button type="button" class="b-sec" data-do="recheck">Re-run checks</button></div>` : ''}
          ${acts.length ? acts.map(actBtn).join('') : `<p class="c-s">${c.closed ? 'Closed. History stays below.' : 'No action for this case.'}</p>`}
        </section>
      </div>
      ${ui.form === 'esc' ? escalateForm(c) : ''}
      ${c.inbox.length && onCase ? `<div class="card"><div class="c-head"><p class="c-t">New data for this case</p><p class="c-s">Adding it re-runs the checks</p></div>${c.inbox.map((i) => `<div class="rq-row"><span>${esc(i.label)}${i.note ? ` <span class="c-s">${esc(i.note)}</span>` : ''}</span><button type="button" class="b-sec b-sm" data-do="inbox" data-i="${i.id}">Add to case</button></div>`).join('')}</div>` : ''}
      <div class="card"><div class="c-head"><p class="c-t">Evidence trace</p><p class="c-s">Each fact, every value found, where it sits and what it copies</p></div>
        <table class="tbl rq-trace"><thead><tr><th scope="col">Fact</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Independence</th></tr></thead><tbody>
        ${facts.map((f) => f.readings.length ? f.readings.map((r, i) => {
          const e = c.evidence.find((x) => x.id === r.evidence);
          const hidden = e && !C.seesEvidence(D, me, e);
          return `<tr>${i === 0 ? `<td rowspan="${f.readings.length}"><b>${esc(f.label)}</b><p><span class="pill ${FACT[f.status][0]}">${FACT[f.status][1]}</span></p></td>` : ''}
            <td>${hidden ? '<span class="c-s">Restricted</span>' : esc(typeof r.value === 'number' ? (Number.isInteger(r.value) && Math.abs(r.value) < 100 ? String(r.value) : E.money(r.value)) : r.value)}</td>
            <td>${esc(r.label)}<p class="c-s">${esc(r.system)} · ${esc(r.loc || '')} · ${esc(at(r.recorded))} · v${r.version}</p></td>
            <td>${r.inferred ? `<span class="pill">Extracted from text</span> <span class="c-s">“${esc(r.quote)}”</span>` : ''}${r.copied ? ' <span class="pill warn">Copied from another source</span>' : ''}${r.copies.length ? `<p class="c-s">Same upstream as ${esc(r.copies.join(', '))}</p>` : '<p class="c-s">Independent</p>'}</td></tr>`;
        }).join('') : `<tr><td><b>${esc(f.label)}</b><p><span class="pill warn">To confirm</span></p></td><td colspan="3" class="c-s">No source has it yet${f.who ? `. ${esc(team(f.who))} can supply it.` : '.'}</td></tr>`).join('')}
        </tbody></table>
        ${docsHtml(c)}
        ${c.evidence.some((e) => e.superseded) ? `<p class="sl">Earlier versions, kept</p><ul class="rq-old">${c.evidence.filter((e) => e.superseded).map((e) => `<li>${esc(e.label)} v${e.version} · replaced ${esc(at(e.superseded))}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="card"><div class="c-head"><p class="c-t">Checks sent from this case</p><p class="c-s">The case stays with ${esc(name(c.owner))}; a check only answers its question</p></div>
        ${tasks.length ? tasks.map((t) => taskHtml(c, t)).join('') : '<p class="d-empty">No checks yet.</p>'}</div>
      <div class="two">
        <div class="card"><p class="c-t">Decisions</p>${c.decisions.length ? c.decisions.map((d) => `<p>${d.stale && !d.rereviewed ? '<span class="pill warn">Needs re-review</span> ' : d.rereviewed ? '<span class="pill">Replaced</span> ' : '<span class="pill ok">Holds</span> '}<b>${esc(d.label)}</b><br><span class="c-s">${esc(name(d.by))} · ${esc(at(d.at))} · on evidence v${d.version}${d.reason ? ` · “${esc(d.reason)}”` : ''}</span></p>`).join('') : '<p class="d-empty">None yet.</p>'}</div>
        <div class="card"><p class="c-t">Timeline</p><ol class="rq-tl">${c.history.slice().reverse().map((h) => `<li><span class="c-s">${esc(at(h.at))} · ${esc(D.people[h.by] ? name(h.by) : h.by)}</span><br>${esc(h.event)}${h.detail ? ` <span class="c-s">· ${esc(h.detail)}</span>` : ''}${h.changes && h.changes.length ? `<ul class="rq-chg">${h.changes.map((x) => `<li>${esc(x.label)}: <s>${esc(C.fmt(x.before))}</s> → ${esc(C.fmt(x.after))}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol></div>
      </div>`;
  }
  // documents keep their text; the extracted spans are marked where they were read
  function docsHtml(c) {
    const docs = c.evidence.filter((e) => e.text && C.seesEvidence(D, me, e));
    if (!docs.length) return '';
    return `<details class="rq-docs"><summary>Read the source documents (${docs.length})</summary>${docs.map((e) => {
      const spans = Object.values(C.readingsOf(e)).filter((r) => r.span).sort((a, b) => a.span[0] - b.span[0]);
      let html = '', i = 0;
      for (const r of spans) { if (r.span[0] < i) continue; html += esc(e.text.slice(i, r.span[0])) + `<mark>${esc(e.text.slice(r.span[0], r.span[1]))}</mark>`; i = r.span[1]; }
      html += esc(e.text.slice(i));
      return `<p class="sl">${esc(e.label)} · ${esc(e.system)}</p><pre class="rq-doc">${html}</pre>`;
    }).join('')}<p class="c-s">Marked text is what the extractor read. In this demo the extractor is deterministic and stands in for a model.</p></details>`;
  }
  function escalateForm(c) {
    const x = c.exceptions.find((e) => e.status === 'open');
    const draft = (x && c.drafts && c.drafts[x.code]) || {};
    const to = ui.escTo || draft.to || 'team';
    return `<div class="card rq-esc"><div class="c-head"><p class="c-t">Ask a team or a person</p><p class="c-s">${draft.question ? 'Drafted by a fixed template from this case’s evidence. It stands in for an AI draft; check the question and the recipient before sending.' : 'Write one clear question.'}</p></div>
      <div class="rq-seg" role="radiogroup" aria-label="Send to"><label><input type="radio" name="es-to" value="team"${to === 'team' ? ' checked' : ''}> A team (anyone in it can claim)</label><label><input type="radio" name="es-to" value="person"${to === 'person' ? ' checked' : ''}> A named person</label></div>
      <div class="rq-grid">
        <label class="tol" id="es-team-l"${to === 'team' ? '' : ' hidden'}>Team <select id="es-team">${Object.entries(D.teams).map(([k, t]) => `<option value="${k}"${k === draft.team ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="tol" id="es-person-l"${to === 'person' ? '' : ' hidden'}>Person <select id="es-person">${Object.entries(D.people).map(([k, p]) => `<option value="${k}"${k === draft.person ? ' selected' : ''}>${esc(p.name)} · ${esc(team(p.team))}</option>`).join('')}</select></label>
        <label class="tol">Due in <select id="es-due"><option value="4">4 hours</option><option value="24" selected>1 day</option><option value="48">2 days</option></select></label>
        <label class="tol"><input type="checkbox" id="es-block"${draft.blocking === false ? '' : ' checked'}> The case must wait for this</label>
      </div>
      ${draft.requires ? `<p class="c-s">Needs someone with ${esc(draft.requires)}.</p>` : ''}
      <label class="sl" for="es-q">Question</label><textarea id="es-q" rows="3">${esc(draft.question || '')}</textarea>
      <label class="sl" for="es-why">Why it matters</label><textarea id="es-why" rows="2">${esc(draft.why || '')}</textarea>
      <p class="c-s">Affects: ${esc(c.affects)} · Asks for: ${esc((draft.requested || []).join(', ') || 'an answer')} · Shares the evidence on this case with the recipient</p>
      <div class="rq-btns"><button type="button" class="b-pri" data-do="send">Send check</button><button type="button" class="b-sec" data-do="form" data-form="">Cancel</button></div></div>`;
  }
  function taskHtml(c, t) {
    const mine = t.assignee === me, lead = C.isLead(D, me, t.team), owner = C.onCase(D, me, c), member = D.people[me].team === t.team;
    const reachable = c.available.filter((i) => !i.teams || i.teams.includes(D.people[me].team));
    const b = (doing, label, cls = 'b-sec') => `<button type="button" class="${cls} b-sm" data-do="${doing}" data-t="${t.id}">${label}</button>`;
    const btns = [];
    if (t.status === 'open' && member) btns.push(b('claim', 'Claim'));
    if (['open', 'claimed'].includes(t.status) && lead) btns.push(b('form-assign', 'Assign within team'));
    if (['claimed', 'more-info'].includes(t.status) && mine) btns.push(b('form-reply', 'Reply', 'b-pri'), b('form-clarify', 'Ask the owner'));
    if ((mine || (t.status === 'open' && member)) && ['open', 'claimed', 'more-info'].includes(t.status)) btns.push(b('form-return', 'Return'));
    if (t.status === 'clarify' && owner) btns.push(b('form-answer', 'Answer the question', 'b-pri'));
    if (t.status === 'replied' && owner) btns.push(b('acceptT', 'Reply answers it', 'b-pri'), b('form-more', 'Not enough, ask again'));
    if (t.status === 'closed' && owner) btns.push(b('form-more', 'Reopen'));
    if (['open', 'claimed', 'returned', 'more-info', 'clarify'].includes(t.status) && (mine || lead || owner)) btns.push(b('form-reassign', 'Reassign'));
    if (C.isOverdue(state, t)) btns.push(b('remind', 'Send a reminder'), b('lead', 'Pass to the team lead'));
    if (t.status !== 'closed' && owner) btns.push(b('form-withdraw', 'Withdraw'));
    const f = ui.form && ui.form.startsWith(t.id + ':') ? ui.form.slice(t.id.length + 1) : null;
    const area = (id, ph) => `<label class="sr" for="${id}">${ph}</label><textarea id="${id}" placeholder="${ph}"></textarea>`;
    return `<div class="rq-task${C.isOverdue(state, t) ? ' late' : ''}">
      <div class="rq-row"><p><b>${t.id}</b> · ${t.to === 'team' && !t.assignee ? esc(team(t.team)) : `${esc(name(t.assignee))} (${esc(team(t.team))})`} · <span class="pill">${esc(TASK[t.status])}</span>${t.blocking ? '' : ' <span class="pill">Question only</span>'}${C.isOverdue(state, t) ? ' <span class="pill neg">Overdue</span>' : ''}</p><p class="c-s">due ${esc(at(t.due))}${t.followUp ? ` · follow up ${esc(at(t.followUp))}` : ''}${t.original !== t.recipient ? ` · first sent to ${esc(t.original.startsWith('team:') ? team(t.original.slice(5)) : name(t.original.slice(7)))}` : ''}</p></div>
      <p>${esc(t.question)}</p>${t.why ? `<p class="c-s">Why: ${esc(t.why)} · Affects: ${esc(t.affects)}${t.requested.length ? ` · Asked for: ${esc(t.requested.join(', '))}` : ''}</p>` : ''}
      ${t.clarify ? `<p class="c-s">Question back: “${esc(t.clarify.q)}”${t.clarify.a ? ` · Answer: “${esc(t.clarify.a)}”` : ''}</p>` : ''}
      ${t.returnReason ? `<p class="c-s">Returned: “${esc(t.returnReason)}”</p>` : ''}
      ${t.reply ? `<div class="rq-reply"><p class="sl">Reply from ${esc(name(t.reply.by))} · ${esc(at(t.reply.at))} · ${esc(t.reply.conclusion)}</p><p>${esc(t.reply.answer)}</p>${t.reply.evidence.length ? `<p class="c-s">Attached: ${esc(t.reply.evidence.map((id) => (c.evidence.find((e) => e.id === id) || {}).label).join(', '))}</p>` : ''}</div>` : ''}
      <div class="rq-btns">${btns.join('')}</div>
      ${f === 'reply' ? `<div class="rq-form">${area('rp-a', 'Your answer')}<label class="tol">Conclusion <select id="rp-c"><option value="confirmed">Confirmed</option><option value="corrected">Corrected</option><option value="cannot-confirm">Cannot confirm</option></select></label>
        ${reachable.length ? `<fieldset><legend class="sl">Attach evidence you can reach</legend>${reachable.map((i) => `<label class="rq-chk"><input type="checkbox" value="${i.id}" data-attach> ${esc(i.label)}${i.correction ? ' <span class="pill warn">correction</span>' : ''}</label>`).join('')}</fieldset>` : '<p class="c-s">Nothing on file for your team to attach.</p>'}
        <button type="button" class="b-pri" data-do="reply" data-t="${t.id}">Send reply</button></div>` : ''}
      ${f === 'assign' ? `<div class="rq-form"><select id="as-p">${Object.entries(D.people).filter(([, p]) => p.team === t.team).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="b-pri" data-do="assign" data-t="${t.id}">Assign</button></div>` : ''}
      ${f === 'reassign' ? `<div class="rq-form"><select id="ra-to"><option value="person">Person</option><option value="team">Team</option></select><select id="ra-p">${Object.entries(D.people).map(([k, p]) => `<option value="${k}">${esc(p.name)} · ${esc(team(p.team))}</option>`).join('')}</select><select id="ra-t">${Object.entries(D.teams).map(([k, x]) => `<option value="${k}">${esc(x.name)}</option>`).join('')}</select>${area('ra-r', 'Why it moves (8+ characters)')}<button type="button" class="b-pri" data-do="reassign" data-t="${t.id}">Reassign</button></div>` : ''}
      ${['clarify', 'answer', 'return', 'more', 'withdraw'].includes(f) ? `<div class="rq-form">${area('tx', { clarify: 'Your question to the owner', answer: 'Your answer', return: 'Why you cannot handle it', more: 'What is still missing', withdraw: 'Why it is withdrawn' }[f])}<button type="button" class="b-pri" data-do="${f}" data-t="${t.id}">Send</button></div>` : ''}
      <details><summary class="c-s">History (${t.history.length})</summary><ol class="rq-tl">${t.history.map((h) => `<li><span class="c-s">${esc(at(h.at))} · ${esc(name(h.by))}</span> ${esc(h.event)}${h.detail ? ` <span class="c-s">· ${esc(h.detail)}</span>` : ''}</li>`).join('')}</ol></details></div>`;
  }

  // ---------- render ----------
  function render() {
    const body = $('#rq-body'); if (!body) return;
    const c = ui.open && state.cases[ui.open];
    $('#rq-clock').textContent = `Demo clock ${at(state.now)}`;
    $('#rq-msg').hidden = !ui.msg; $('#rq-msg').textContent = ui.msg;
    body.innerHTML = c ? caseHtml(c) : queueHtml();
    if (c) body.dataset.version = c.version;
    const n = C.queue(state, D, { me, status: 'active' }).length;
    const badge = $('#rq-count'); if (badge) badge.textContent = n;
  }

  // ---------- events ----------
  const val = (s) => ($(s) ? $(s).value : '');
  const T = (id) => state.tasks[id];
  $('#rq-as').innerHTML = Object.entries(D.people).map(([k, p]) => `<option value="${k}"${k === me ? ' selected' : ''}>${esc(p.name)} · ${esc(team(p.team))}</option>`).join('');
  $('#rq-as').addEventListener('change', () => { me = $('#rq-as').value; try { localStorage.setItem(AS, me); } catch {} ui.form = null; ui.msg = ''; render(); });
  $('#rq-run').addEventListener('click', () => run(() => {
    const out = [
      C.sync(state, D, A, 'cash', { bank: window.TM.bank, gl: window.TM.gl, window: +($('#cash-window') ? $('#cash-window').value : 3) }),
      C.sync(state, D, A, 'payroll', { hris: window.TM.hris, payroll: window.TM.payroll, equity: window.TM.equity, period: PERIOD }),
      C.sync(state, D, A, 'mortgage', {}),
    ];
    const made = out.reduce((a, r) => a + r.created.length, 0), upd = out.reduce((a, r) => a + r.updated.length, 0);
    ui.msg = ''; return { ok: true, made, upd };
  }, ['Ran checks across Payroll, Cash and Mortgage', 'Open cases updated in place; new findings open new cases']));
  $('#rq-reset').addEventListener('click', () => { state = fresh(); ui.open = null; ui.form = null; ui.msg = ''; save(); log('Reset the review demo', 'Back to the starting cases'); render(); });

  $('#rq-body').addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (f) { ui.f[f] = e.target.value || undefined; render(); }
    if (e.target.name === 'es-to') { ui.escTo = e.target.value; $('#es-team-l').hidden = ui.escTo !== 'team'; $('#es-person-l').hidden = ui.escTo !== 'person'; }
  });
  $('#rq-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]'); if (!b || b.disabled) return;
    const d = b.dataset.do, c = ui.open && state.cases[ui.open], t = b.dataset.t, version = c ? +$('#rq-body').dataset.version : undefined;
    if (d === 'view') { ui.view = b.dataset.v; return render(); }
    if (d === 'open') { ui.open = b.dataset.id; ui.form = null; ui.msg = ''; ui.escTo = null; render(); $('#rq-body').scrollIntoView({ block: 'start' }); return; }
    if (d === 'back') { ui.open = null; ui.form = null; ui.msg = ''; return render(); }
    if (d === 'as') { setMe(b.dataset.p); return render(); }
    if (d === 'goto') return spot($('#rq-body ' + b.dataset.at));
    if (d === 'tryreset') { state = fresh(); save(); log('Restarted the payout walkthrough', 'Demo back to its starting cases'); return tryPayout(); }
    if (d === 'form') { ui.form = b.dataset.form || null; ui.escTo = null; render(); return ui.form === 'esc' && spot($('.rq-esc')); }
    if (d.startsWith('form-')) { ui.form = `${t}:${d.slice(5)}`; render(); return spot($('.rq-task .rq-form')); }
    if (d === 'priority') return run(() => C.setPriority(state, D, c.id, val('#pr-l'), val('#pr-r'), me), ['Changed priority', `${c.id} → ${val('#pr-l')}`]);
    if (d === 'cls') return run(() => C.reclassify(state, D, c.id, b.dataset.x, val('#cl-v'), val('#cl-r'), me), ['Changed classification', `${b.dataset.x} → ${CLS[val('#cl-v')]}`]);
    if (d === 'recheck') return run(() => ({ ok: true, ...C.runCheck(state, A, c.id, me, 'Re-run by ' + name(me)) }), ['Re-ran checks', c.id]);
    if (d === 'inbox') return run(() => C.attachEvidence(state, D, A, c.id, b.dataset.i, me, { via: 'inbox' }), ['Added new evidence', c.id]);
    if (d === 'act') {
      const a = b.dataset.a;
      return run(() => C.act(state, D, A, c.id, a, { by: me, reason: val('#r-' + CSS.escape(a)), version }), ['Decision recorded', `${c.id} · ${a}`]);
    }
    if (d === 'send') {
      const to = ($('input[name="es-to"]:checked') || {}).value || 'team';
      const x = c.exceptions.find((y) => y.status === 'open');
      const draft = (x && c.drafts && c.drafts[x.code]) || {};
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

  function spot(el) {
    if (!el) return;
    // focus first: moving focus during a smooth scroll cancels the scroll in Chrome
    const f = el.matches('button') ? el : el.querySelector('textarea, button'); if (f) f.focus({ preventScroll: true });
    // after the redraw settles, so the browser's own scroll adjustment does not undo it
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })));
    el.classList.remove('rq-spot'); void el.offsetWidth; el.classList.add('rq-spot');
  }

  // ---------- links from the module views ----------
  window.tmCaseLink = (key) => {
    const c = state.order.map((id) => state.cases[id]).find((x) => x.key === key);
    return c ? `<button type="button" class="link-btn sm" data-case="${c.id}">${c.id} →</button>` : '';
  };
  window.tmOpenCase = (id) => { ui.open = id; ui.form = null; ui.msg = ''; app.setView && app.setView('queue'); render(); };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-case]'); if (b) window.tmOpenCase(b.dataset.case); });
  // "Try the payout exception": straight into the guided case, as its owner
  function setMe(p) { me = p; try { localStorage.setItem(AS, me); } catch {} $('#rq-as').value = me; ui.form = null; ui.msg = ''; }
  function tryPayout() {
    const c = caseByKey(TRY_KEY); if (!c) return;
    if (!c.tasks.length) setMe('ava');
    window.tmOpenCase(c.id);
    const target = $('#rq-body'); if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 84, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-try-case]'); if (!t) return; e.preventDefault(); try { history.replaceState(null, '', '#try'); } catch {} tryPayout(); });
  if (location.hash === '#try') setTimeout(tryPayout, 400);
  window.tmSyncCash = (win) => { C.sync(state, D, A, 'cash', { bank: window.TM.bank, gl: window.TM.gl, window: win }); save(); render(); };

  render();
  app.refresh && app.refresh();
})();
