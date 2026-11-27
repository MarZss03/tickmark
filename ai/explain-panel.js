// Tickmark Hybrid: "Explain it to the customer". A plain-language note to the borrower or their lawyer about
// what happened and what comes next, in English, French or Chinese, drafted on this device from the redacted
// case brief (through Firebase AI Logic, not a separate translation API). Names and addresses are put back here,
// on this device, only in the text the person copies.
import { stream, deviceStatus, PolicyBlocked } from './hybrid.js';
import { brief } from './draft.js';
import './redact.js';

const Redact = self.TickmarkRedact;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LANGS = { en: 'English', fr: 'French (Canadian)', zh: 'Simplified Chinese' };
const ui = new Map();
const get = (id) => { if (!ui.has(id)) ui.set(id, { lang: 'en', text: '', status: 'idle' }); return ui.get(id); };
let current = null;

async function draw() {
  const el = document.getElementById('cs-explain');
  if (!el || !current || el.dataset.case !== current.id || !window.tmBridge) return;
  const c = window.tmBridge.caseById(current.id);
  // only once the case has a finding with a cause to explain
  const f = window.tmBridge.finding(current.id);
  if (!c || !String(c.key || '').startsWith('ms:') || !f) { el.hidden = true; return; }
  el.hidden = false;
  const s = get(current.id);
  const onDevice = (await deviceStatus(false)) === 'available';
  const shown = s.text ? Redact.restore(s.text, s.entities || []) : '';
  el.innerHTML = `<div class="ai-h"><p class="sl">Explain it to the customer</p>${s.ranOn ? `<span class="ai-chip ${s.ranOn === 'on_device' ? 'ok' : 'warn'}">${s.ranOn === 'on_device' ? 'Drafted on this device' : 'Drafted in the cloud from redacted text'}</span>` : ''}</div>
    <p class="ai-intro">A short, plain-language note for the borrower or their lawyer: what happened, what it means for them, what happens next. No promises the case does not support.</p>
    <div class="ai-row"><label class="sl" for="ex-lang" style="margin:0;align-self:center">Language</label>
      <select id="ex-lang" class="ai-in" style="width:auto">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === s.lang ? ' selected' : ''}>${v === 'French (Canadian)' ? 'Français' : v === 'Simplified Chinese' ? '中文' : 'English'}</option>`).join('')}</select>
      <button class="${s.text ? 'b-sec' : 'b-pri'}" data-ex-draft ${s.status === 'drafting' ? 'disabled' : ''}>${onDevice ? 'Draft on this device' : 'Draft from redacted text'}</button></div>
    ${s.status === 'drafting' ? '<p class="ai-busy" role="status">Drafting…</p>' : ''}
    ${shown ? `<textarea id="ex-out" class="ai-in ai-q" rows="6" aria-label="Draft note">${esc(shown)}</textarea>
      <p class="c-s">Private details were put back on this device. Read it before sending; nothing is sent from here.</p>
      <div class="ai-row"><button class="b-sec" data-ex-copy>Copy</button></div>` : ''}
    ${s.error ? `<p class="c-s" role="alert">${esc(s.error)}</p>` : ''}`;
  el.querySelector('#ex-lang').onchange = (e) => { s.lang = e.target.value; };
}

async function doDraft() {
  const id = current.id, s = get(id);
  const c = window.tmBridge.caseById(id), f = window.tmBridge.finding(id);
  const b = brief(c, f.x, 'the borrower or their lawyer');
  Object.assign(s, { status: 'drafting', text: '', error: null, ranOn: null, entities: b.entities });
  draw();
  try {
    const r = await stream({
      task: `Customer note (${LANGS[s.lang]})`, dataClass: 'redacted_text',
      prompt: `Write a short note (at most 5 sentences) in ${LANGS[s.lang]} from a bank's mortgage servicing team to a borrower or their lawyer. Explain in plain language what happened with their payout, what it means for them, and what happens next. Only state what the facts below support; if something is not confirmed yet, say it is being checked. Polite, calm, no jargon, no greeting line with a name, no sign-off. Keep tokens in square brackets such as [ADDRESS_1] exactly as they are.\n\n${b.text}`,
      onText: (t, where) => { s.text = t; s.ranOn = where || s.ranOn; const ta = document.getElementById('ex-out'); if (ta) ta.value = Redact.restore(t, s.entities); else draw(); },
    });
    s.text = r.text.trim(); s.ranOn = r.ranOn;
  } catch (e) { s.error = e instanceof PolicyBlocked ? e.message : `Could not draft: ${e.message}`; }
  s.status = 'idle';
  draw();
}

document.addEventListener('click', (ev) => {
  if (!current) return;
  if (ev.target.closest('[data-ex-draft]')) doDraft();
  else if (ev.target.closest('[data-ex-copy]')) { const ta = document.getElementById('ex-out'); if (ta) navigator.clipboard.writeText(ta.value).catch(() => { ta.select(); }); }
});
window.addEventListener('tm:case-rendered', (e) => { current = e.detail; draw(); });
const first = document.getElementById('cs-explain');
if (first) { current = { id: first.dataset.case, key: first.dataset.key }; draw(); }
