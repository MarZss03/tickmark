// Tickmark Hybrid: "Ask another team" on a case page. The question is drafted on this device from a redacted
// brief (streamed), with a suggested classification. The person edits it and sees exactly what will be shared.
// Sending creates the normal Tickmark check and writes a redacted copy to Firestore, where the other team
// (another browser, or the iOS app) sees it live. Their reply comes back here and is recorded on the check
// for the owner to review; the rules re-run with what it carries.
import { draftQuestion, suggestClass, CLASSES } from './draft.js';
import { currentRoom, join, sendCheck, watchCheck, decide, inboxLink, TEAMS, REQUEST_FIELDS } from './checks.js';
import { PolicyBlocked } from './hybrid.js';
import './redact.js';

const Redact = self.TickmarkRedact;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LINKS = 'tickmark.hybrid.checks'; // caseId -> { room, checkId, taskId, toTeam }
const loadLinks = () => { try { return JSON.parse(localStorage.getItem(LINKS) || '{}'); } catch { return {}; } };
const saveLinks = (l) => { try { localStorage.setItem(LINKS, JSON.stringify(l)); } catch {} };

const ui = new Map(); // caseId -> { status, text, ranOn, cls, reason, error, live }
const get = (id) => { if (!ui.has(id)) ui.set(id, { status: 'idle', text: '' }); return ui.get(id); };
let current = null;
const watchers = new Map(); // checkId -> unsubscribe
const B = () => window.tmBridge;

const recipient = (draft) => (draft.to === 'person'
  ? { team: (window.TMC.dir.people[draft.person] || {}).team || 'approvals', label: B().name(draft.person) }
  : { team: draft.team, label: B().teamName(draft.team) });
// every string value redacted on its own; numbers and dates stay
const redactFacts = (o) => Object.fromEntries(Object.entries(o || {}).slice(0, 12).map(([k, v]) => [k, typeof v === 'string' ? Redact.redact(v).text.slice(0, 200) : v]));

function watch(caseId, link) {
  if (watchers.has(link.checkId)) return;
  const stop = watchCheck(link.room, link.checkId, (doc, err) => {
    const s = get(caseId);
    if (err) { s.live = null; s.error = `Live updates stopped: ${err.message}`; }
    else s.live = doc;
    if (current && current.id === caseId) draw();
  });
  watchers.set(link.checkId, stop);
}

function shared(c, x, draft, question) {
  // what leaves this browser: the redacted question, the redacted title, facts with no identifiers
  const facts = {};
  for (const e of (c.evidence || []).filter((y) => !y.superseded)) for (const [k, v] of Object.entries(e.facts || {})) if (Object.keys(facts).length < 12) facts[k] = v;
  const safeFacts = redactFacts(facts);
  return {
    caseId: c.id, caseTitle: Redact.redact(c.title).text.slice(0, 140),
    question: Redact.redact(question).text.slice(0, 1200), whyItMatters: Redact.redact(draft.why || '').text.slice(0, 600),
    expected: safeFacts, requested: (draft.requested || []).slice(0, 4),
    evidence: (c.evidence || []).filter((y) => !y.superseded && y.facts).slice(0, 5).map((y) => ({ docType: (y.kind || 'record').slice(0, 40), summary: Redact.redact(y.system || '').text.slice(0, 600), facts: redactFacts(y.facts) })),
  };
}

async function draw() {
  const el = document.getElementById('cs-ask');
  if (!el || !current || el.dataset.case !== current.id || !B()) return;
  const c = B().caseById(current.id);
  const f = B().finding(current.id);
  const links = loadLinks();
  const link = links[current.id];
  const s = get(current.id);
  if (link) watch(current.id, link);
  if (!c || (!link && (!f || !f.draft || !['person', 'team'].includes(f.draft.to)))) { el.hidden = true; return; }
  el.hidden = false;

  // after sending: live status, then the reply
  if (link) {
    const d = s.live;
    const room = link.room;
    const inbox = inboxLink(room, link.toTeam);
    let body = '';
    if (!d) body = `<p class="ai-busy" role="status">Connecting to the live check…</p>`;
    else if (d.status === 'open' || d.status === 'returned') body = `<p class="ai-busy" role="status">Waiting on ${esc(TEAMS[d.toTeam] || d.toTeam)} · live through Firestore</p>
      <p class="c-s">They answer from their own inbox, on another browser or the iPhone app. To try it yourself, open <a class="link-btn" href="${esc(inbox)}" target="_blank" rel="noopener">their inbox in a new window</a>, or join room <b class="ai-code">${esc(room)}</b> on the iPhone.</p>`;
    else if (d.status === 'answered' && d.reply) {
      const fields = Object.entries(d.reply.facts || {});
      body = `<div class="ai-res"><p class="ai-where"><span class="pill ok">Reply in</span> from ${esc(d.reply.byName)} · drafted ${d.reply.ranOn === 'on_device' ? 'on their device' : d.reply.ranOn === 'in_cloud' ? 'in the cloud from redacted text' : 'by hand'}</p>
        <p class="cs-q">${esc(d.reply.text)}</p>
        ${fields.length ? `<table class="tbl ai-tbl"><tbody>${fields.map(([k, v]) => `<tr><th scope="row">${esc((Object.values(REQUEST_FIELDS).find((r) => r.key === k) || {}).label || k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
        <p class="c-s">Adding it records the reply on the check and adds what it carries as evidence. You still review and accept it in Next action.</p>
        <div class="ai-row"><button class="b-pri" data-ask-apply>Add the reply to the case</button></div></div>`;
    } else if (d.status === 'accepted') body = `<p class="ai-done"><span class="pill ok">Reply added</span> Review it in Next action. The checks re-ran with it.</p>`;
    el.innerHTML = `<div class="ai-h"><p class="sl">Ask another team</p><span class="ai-chip ok">Live · Firestore</span></div>${body}${s.error ? `<p class="c-s" role="alert">${esc(s.error)}</p>` : ''}`;
    return;
  }

  const r = recipient(f.draft);
  const draftBtn = s.status === 'drafting' ? '' : `<button class="${s.text ? 'b-sec' : 'b-pri'}" data-ask-draft>${s.text ? 'Draft again' : 'Draft the question on this device'}</button>`;
  const chip = s.ranOn === 'on_device' ? '<span class="ai-chip ok">Drafted on this device</span>' : s.ranOn === 'in_cloud' ? '<span class="ai-chip warn">Drafted in the cloud from redacted text</span>' : '';
  const preview = s.text ? shared(c, f.x, f.draft, s.text) : null;
  el.innerHTML = `<div class="ai-h"><p class="sl">Ask ${esc(r.label)}</p>${chip}</div>
    <p class="ai-intro">${esc(f.draft.why || '')} The question is drafted from a redacted summary of the case; nothing with a name or account number is shared.</p>
    ${s.status === 'drafting' ? `<p class="ai-busy" role="status">Drafting${s.ranOn === 'on_device' ? ' on this device' : ''}…</p>` : ''}
    ${s.text || s.status === 'drafting' ? `<label class="sl" for="ask-q">Question (you can edit it)</label><textarea id="ask-q" class="ai-in ai-q" rows="4">${esc(s.text)}</textarea>` : ''}
    ${s.cls ? `<p class="c-s">Suggested classification: <b>${esc(CLASSES[s.cls])}</b>${s.reason ? ` · ${esc(s.reason)}` : ''} <span class="st">Suggestion only</span></p>` : ''}
    ${preview ? `<details class="ai-sent"><summary>Exactly what ${esc(r.label)} will see</summary><pre>${esc(JSON.stringify(preview, null, 2))}</pre></details>` : ''}
    <div class="ai-row">${draftBtn}${s.text && s.status !== 'drafting' ? `<button class="b-pri" data-ask-send>Send to ${esc(r.label)}</button>` : ''}</div>
    ${s.error ? `<p class="c-s" role="alert">${esc(s.error)}</p>` : ''}`;
  const ta = el.querySelector('#ask-q');
  if (ta) ta.addEventListener('input', () => { s.text = ta.value; });
}

async function doDraft() {
  const id = current.id, s = get(id);
  const c = B().caseById(id), f = B().finding(id);
  const r = recipient(f.draft);
  Object.assign(s, { status: 'drafting', text: '', error: null, ranOn: null, cls: null });
  draw();
  try {
    const out = await draftQuestion(c, f.x, r.label, (t, where) => {
      s.text = t; s.ranOn = where || s.ranOn;
      const ta = document.getElementById('ask-q');
      if (ta) ta.value = t; else draw();
    });
    s.text = out.text.trim(); s.ranOn = out.ranOn; s.status = 'idle';
    draw();
    const k = await suggestClass(c, f.x);
    s.cls = k.classification; s.reason = k.reason;
  } catch (e) {
    s.status = 'idle'; s.error = e instanceof PolicyBlocked ? e.message : `Could not draft: ${e.message}`;
  }
  draw();
}

async function doSend() {
  const id = current.id, s = get(id);
  const c = B().caseById(id), f = B().finding(id);
  const q = (document.getElementById('ask-q') || {}).value || s.text;
  const r = recipient(f.draft);
  const me = B().me();
  const myTeam = (window.TMC.dir.people[me] || {}).team || 'servicing';
  s.error = null;
  try {
    const room = currentRoom();
    await join(room, myTeam, B().name(me), 'web');
    const due = new Date(Date.now() + 24 * 36e5).toISOString();
    const local = B().escalate(id, { to: f.draft.to, team: f.draft.team, person: f.draft.person, requires: f.draft.requires, kind: f.draft.kind || 'verify', requested: f.draft.requested || [], question: Redact.redact(q).text, why: f.draft.why || '', blocking: true, due });
    if (!local.ok) { s.error = local.error; return draw(); }
    const checkId = await sendCheck(room, { ...shared(c, f.x, f.draft, q), fromTeam: myTeam, toTeam: r.team, classification: s.cls || 'insufficient', due });
    const links = loadLinks(); links[id] = { room, checkId, taskId: local.task, toTeam: r.team }; saveLinks(links);
    s.status = 'sent';
  } catch (e) { s.error = `Not sent: ${e.message}`; }
  draw();
}

async function doApply() {
  const id = current.id, s = get(id);
  const link = loadLinks()[id];
  const d = s.live;
  if (!link || !d || !d.reply) return;
  const facts = d.reply.facts || {};
  const patch = [];
  for (const req of d.requested || []) {
    const rf = REQUEST_FIELDS[req];
    if (rf && facts[rf.key]) patch.push(...rf.apply(String(facts[rf.key]), `FS-${d.id.slice(0, 6)}`));
  }
  const doc = Object.keys(facts).length ? {
    id: `fs-${d.id}`, label: `Reply from ${TEAMS[d.toTeam] || d.toTeam} (via Firestore)`,
    evidence: { label: `Reply from ${TEAMS[d.toTeam] || d.toTeam}`, system: `${TEAMS[d.toTeam] || d.toTeam} · answered on another device`, origin: d.toTeam, kind: 'record', loc: `Check ${d.id.slice(0, 6)} · ${d.reply.byName}`, facts },
    patch, touches: Object.keys(facts),
  } : null;
  const r = B().applyRemoteReply(id, link.taskId, { answer: d.reply.text, byName: d.reply.byName, doc });
  if (!r.ok) { s.error = r.error; return draw(); }
  try { await decide(link.room, d.id, 'accepted'); } catch (e) { s.error = `Added here, but Firestore was not updated: ${e.message}`; }
  draw();
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-ask-draft],[data-ask-send],[data-ask-apply]');
  if (!t || !current) return;
  t.disabled = true;
  if (t.dataset.askDraft !== undefined) doDraft();
  else if (t.dataset.askSend !== undefined) doSend();
  else if (t.dataset.askApply !== undefined) doApply();
});
window.addEventListener('tm:case-rendered', (e) => { current = e.detail; draw(); });
const first = document.getElementById('cs-ask');
if (first) { current = { id: first.dataset.case }; draw(); }
