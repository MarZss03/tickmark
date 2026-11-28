// Tickmark Hybrid: the "Read a document privately" panel on a case page. It shows the case's documents,
// reads one on this device (or, with no on-device model, redacts it here and reads only the redacted text
// in the cloud), lets the person check every value, and adds the confirmed values to the case so the
// existing rules re-run. Drawn into #cs-ai after each case render (see review.js).
import { readDocument, readPath, docsForCase, DOC_TYPES, PolicyBlocked } from './docread.js';
import { ensureDevice, deviceReady, deviceHint, deviceStatus } from './hybrid.js';
import * as ledger from './ledger.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ui = new Map(); // caseId -> { status, docId, result, error, hint, progress, t0, path }
const get = (id) => { if (!ui.has(id)) ui.set(id, { status: 'idle' }); return ui.get(id); };
let current = null; // { id, key }
let timer = null;

const secs = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const money = (v) => (typeof v === 'number' ? v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v);

async function draw() {
  const el = document.getElementById('cs-ai');
  if (!el || !current || el.dataset.case !== current.id) return;
  const docs = await docsForCase(current.key);
  if (!docs.length) { el.hidden = true; return; }
  el.hidden = false;
  const s = get(current.id);
  const path = s.path || await readPath(docs[0]);
  const local = path === 'device' || path === 'device-text';
  const added = (doc) => (window.tmBridge?.caseById(current.id)?.evidence || []).some((e) => e.id === `ai-${doc.id}` && !e.superseded);
  const chip = local
    ? '<span class="ai-chip ok">Gemini Nano · on this device</span>'
    : '<span class="ai-chip warn">No on-device model · redacted cloud</span>';
  const intro = local
    ? 'Customer documents are read here, on this computer, by the on-device model. Nothing in them leaves this device.'
    : 'This browser has no on-device model, so the scan itself is never sent. Its text is redacted on this device first; only the redacted text is read in the cloud, and the real values are put back here.';

  const body = docs.map((d) => {
    const mine = s.docId === d.id;
    const done = added(d);
    let tail = '';
    if (mine && s.status === 'preparing') tail = `<p class="ai-busy" role="status">Preparing the on-device model${s.progress ? ` · ${Math.round(s.progress * 100)}%` : ''}…</p>`;
    else if (mine && s.status === 'reading') tail = `<p class="ai-busy" role="status">${s.path === 'device' || s.path === 'device-text' ? 'Reading on this device · nothing leaves this computer' : 'Redacted on this device · reading the redacted text in the cloud'} · <span data-ai-clock>${secs(Date.now() - s.t0)}</span></p>`;
    else if (mine && s.status === 'error') tail = `<div class="ai-err" role="alert"><p>${esc(s.error)}</p>${s.hint ? `<p class="c-s">${esc(s.hint)}</p>` : ''}${s.offerCloud ? `<button class="b-sec" data-ai-cloud="${esc(d.id)}">Redact here, then read in the cloud</button>` : ''}</div>`;
    else if (mine && s.status === 'result') tail = resultHtml(d, s);
    return `<article class="ai-doc">
      <a class="ai-thumb" href="${esc(d.image)}" target="_blank" rel="noopener" aria-label="Open the scan of ${esc(d.label)}"><img src="${esc(d.image)}" alt="Scan: ${esc(d.label)}" loading="lazy"></a>
      <div class="ai-doc-b">
        <p class="ai-doc-t">${esc(d.label)}</p>
        <p class="c-s">${esc(d.from)} · contains customer names and account numbers</p>
        ${done ? '<p class="ai-done"><span class="pill ok">Added to the case</span> The checks re-ran with it.</p>'
          : mine && ['preparing', 'reading', 'result'].includes(s.status) ? '' : `<div class="ai-row"><button class="b-pri" data-ai-read="${esc(d.id)}">${local ? 'Read on this device' : 'Redact here, then read'}</button></div>`}
        ${tail}
      </div>
    </article>`;
  }).join('');

  const sum = ledger.summary();
  el.innerHTML = `<div class="ai-h"><p class="sl">Read a document privately</p>${chip}</div>
    <p class="ai-intro">${intro}</p>
    ${body}
    <p class="c-s ai-foot">The model only reads. You confirm the values, then Tickmark’s rules decide. ${sum.total ? `This browser so far: ${sum.onDevice} read${sum.onDevice === 1 ? '' : 's'} on device, ${sum.inCloud} in the cloud, ${sum.charsLeft} characters left this device.` : ''} <a class="link-btn" href="hybrid-check.html" target="_blank" rel="noopener">Data boundary ledger</a></p>`;
}

function resultHtml(d, s) {
  const type = DOC_TYPES[d.docType];
  const r = s.result;
  const where = r.ranOn === 'on_device'
    ? `<span class="pill ok">Read on this device</span> ${secs(r.ms)} · 0 characters left this device`
    : `<span class="pill warn">Redacted here, read in the cloud</span> ${secs(r.ms)} · ${r.sent ? r.sent.length : 0} characters sent, ${r.redaction ? r.redaction.removed : 0} private details removed first`;
  const rows = type.fields.map(([k, label]) => `<tr><th scope="row">${esc(label)}</th><td><input class="ai-in" data-ai-field="${k}" value="${esc(k === 'amount' && r.fields[k] != null ? money(r.fields[k]) : r.fields[k])}" aria-label="${esc(label)}"></td></tr>`).join('');
  return `<div class="ai-res">
    <p class="ai-where">${where}</p>
    <table class="tbl ai-tbl"><tbody>${rows}</tbody></table>
    ${r.sent ? `<details class="ai-sent"><summary>Exactly what left this device</summary><pre>${esc(r.sent)}</pre></details>` : ''}
    <p class="c-s">Check each value against the scan before adding. Tickmark’s rules re-check the case with them.</p>
    <div class="ai-row"><button class="b-pri" data-ai-add="${esc(d.id)}">Add to case</button><button class="b-sec" data-ai-discard="${esc(d.id)}">Discard</button></div>
  </div>`;
}

function tick() {
  clearInterval(timer);
  timer = setInterval(() => {
    const s = current && get(current.id);
    const clock = document.querySelector('[data-ai-clock]');
    if (!s || s.status !== 'reading' || !clock) { clearInterval(timer); return; }
    clock.textContent = secs(Date.now() - s.t0);
  }, 200);
}

async function read(docId, forcePath) {
  const id = current.id, s = get(id);
  const docs = await docsForCase(current.key);
  const d = docs.find((x) => x.id === docId);
  if (!d) return;
  Object.assign(s, { docId, result: null, error: null, hint: null, offerCloud: false, progress: 0 });
  let path = forcePath || await readPath(d);
  if ((path === 'device' || path === 'device-text') && !deviceReady(path === 'device')) {
    // first use: prepare the model for real (download if needed, one short test prompt) on this click
    s.status = 'preparing'; draw();
    const prep = await ensureDevice((p) => { s.progress = p; draw(); }, path === 'device');
    if (!prep.ok) {
      Object.assign(s, { status: 'error', error: 'The on-device model could not start here.', hint: prep.hint, offerCloud: true, path: 'redacted-cloud' });
      return draw();
    }
  }
  s.path = path;
  s.status = 'reading'; s.t0 = Date.now(); draw(); tick();
  try {
    s.result = await readDocument(d, { path });
    s.status = 'result';
  } catch (e) {
    const blocked = e instanceof PolicyBlocked;
    Object.assign(s, { status: 'error', error: blocked ? e.message : 'The document could not be read.', hint: blocked ? '' : deviceHint(e, await deviceStatus(true)), offerCloud: path === 'device' || path === 'device-text' });
  }
  draw();
}

function add(docId) {
  const id = current.id, s = get(id);
  docsForCase(current.key).then((docs) => {
    const d = docs.find((x) => x.id === docId);
    if (!d || !s.result) return;
    // the values as the person left them in the form
    const f = { ...s.result.fields };
    document.querySelectorAll('#cs-ai [data-ai-field]').forEach((inp) => {
      const k = inp.dataset.aiField;
      f[k] = k === 'amount' ? Number(String(inp.value).replace(/[^0-9.\-]/g, '')) : inp.value.trim();
    });
    const mapped = d.toCase(f);
    const me = window.tmBridge.me();
    const where = s.result.ranOn === 'on_device' ? 'Read on this device by Gemini Nano (Firebase AI Logic)' : 'Redacted on this device, read in the cloud (Firebase AI Logic)';
    const r = window.tmBridge.attachDocument(id, {
      id: `ai-${d.id}`,
      label: `${d.label.replace(/ \(scan\)$/, '')}, read ${s.result.ranOn === 'on_device' ? 'on this device' : 'from redacted text'}`,
      evidence: { label: d.label.replace(/ \(scan\)$/, ''), system: where, origin: 'bank-wire', kind: 'document', loc: `${f.wire_reference || 'scan'} · values confirmed by ${window.tmBridge.name(me)}`, facts: mapped.facts },
      patch: mapped.patch, touches: mapped.touches,
    });
    if (r.ok) { s.status = 'idle'; s.result = null; s.docId = null; }
    else Object.assign(s, { status: 'error', error: r.error });
    draw();
  });
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-ai-read],[data-ai-cloud],[data-ai-add],[data-ai-discard]');
  if (!t || !current) return;
  if (t.dataset.aiRead) read(t.dataset.aiRead);
  else if (t.dataset.aiCloud) { get(current.id).path = 'redacted-cloud'; read(t.dataset.aiCloud, 'redacted-cloud'); }
  else if (t.dataset.aiAdd) add(t.dataset.aiAdd);
  else if (t.dataset.aiDiscard) { Object.assign(get(current.id), { status: 'idle', result: null, docId: null }); draw(); }
});

window.addEventListener('tm:case-rendered', (e) => { current = e.detail; draw(); });
ledger.onChange(() => draw());
// the case may already be on screen when this module finishes loading
const first = document.getElementById('cs-ai');
if (first) { current = { id: first.dataset.case, key: first.dataset.key }; draw(); }
