// Tickmark Hybrid: reading a finance document privately. A scan is read by the on-device model (Gemini Nano
// through Firebase AI Logic) into a fixed schema; raw customer data never leaves the device. With no
// on-device model, the document's text is redacted on the device first and only then read in the cloud,
// and the real values are put back on the device. Either way, the values go to a person to confirm and
// then to Tickmark's rules. The model only reads; the rules decide.
import { run, deviceStatus, deviceReady, PolicyBlocked } from './hybrid.js';
import './redact.js';

const Redact = self.TickmarkRedact;

// Document types: what to extract, in a schema both the on-device and the cloud model are held to.
export const DOC_TYPES = {
  wire_confirmation: {
    label: 'Wire confirmation',
    schema: {
      type: 'object',
      properties: {
        wire_reference: { type: 'string', description: 'The wire or payment reference, e.g. W-88213' },
        amount: { type: 'number', description: 'Amount received, as a number without currency symbols or commas' },
        currency: { type: 'string', description: 'Three-letter currency code' },
        received_at: { type: 'string', description: 'When the bank received the wire, as YYYY-MM-DD HH:MM' },
        hold_placed_at: { type: 'string', description: 'When a hold was placed, as YYYY-MM-DD HH:MM, or empty if there was no hold' },
        hold_released_at: { type: 'string', description: 'When the hold was released, as YYYY-MM-DD HH:MM, or empty if there was no hold' },
      },
      required: ['wire_reference', 'amount', 'currency', 'received_at', 'hold_placed_at', 'hold_released_at'],
    },
    fields: [
      ['wire_reference', 'Wire reference'], ['amount', 'Amount'], ['currency', 'Currency'],
      ['received_at', 'Bank received'], ['hold_placed_at', 'Hold placed'], ['hold_released_at', 'Hold released'],
    ],
    instruction: 'You read bank wire confirmations for a mortgage servicing team. Extract only the fields in the schema, exactly as the document states them. Dates and times as YYYY-MM-DD HH:MM in the document\'s own time zone. If the document shows no hold, leave both hold fields empty. Do not guess, and do not copy names or account numbers.',
  },
};

// Documents attached to the demo cases, by case file key. Images are synthetic scans made by
// scripts/make-docs.mjs; `text` is the same document as text, for the redacted cloud path.
const MANIFEST_URL = new URL('../assets/docs/docs.json', import.meta.url);
let manifest = null;
async function docsManifest() { if (!manifest) manifest = await fetch(MANIFEST_URL).then((r) => r.json()); return manifest; }

// How a reading becomes evidence on each case: the facts it supplies and the inputs it corrects.
const ts = (s) => String(s || '').trim().replace(' ', 'T').slice(0, 16);
const shortDT = (s) => { const d = new Date(ts(s) + ':00Z'); return Number.isNaN(d.getTime()) ? s : `${d.getUTCDate()} ${d.toUTCString().slice(8, 11)} ${ts(s).slice(11, 16)}`; };
const WIRE_TO_CASE = (f) => {
  const facts = { bank: String(f.received_at || '').slice(0, 16), payout_amount: Number(f.amount) };
  const patch = [{ path: 'funds.0.bank', value: ts(f.received_at), label: 'Bank received' }];
  if (f.hold_placed_at && f.hold_released_at) {
    facts.hold = `review hold ${shortDT(f.hold_placed_at)} – ${shortDT(f.hold_released_at)}`;
    patch.push({ path: 'funds.0.holdOn', value: ts(f.hold_placed_at), label: 'Hold placed' }, { path: 'funds.0.holdOff', value: ts(f.hold_released_at), label: 'Hold released' });
  }
  return { facts, patch, touches: ['bank'] };
};
export const CASE_DOCS = {
  'ms:ML-40311': [{ doc: 'wire-W-88213', from: 'Payments forwarded the bank’s confirmation as a scan', toCase: WIRE_TO_CASE }],
  'ms:ML-38774': [{ doc: 'wire-W-88540', from: 'The lawyer’s bank sent a receipt advice', toCase: WIRE_TO_CASE }],
};

export async function docsForCase(caseKey) {
  const list = CASE_DOCS[caseKey] || [];
  if (!list.length) return [];
  const all = await docsManifest();
  return list.map((d) => ({ ...d, ...all.find((m) => m.id === d.doc) })).filter((d) => d.image);
}

const toBase64 = async (url) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// How this document can be read here: 'device' (image on the on-device model) or 'redacted-cloud' (text,
// redacted on this device first). Nothing else is offered.
export async function readPath() {
  const img = await deviceStatus(true);
  return img === 'available' || deviceReady(true) ? 'device' : 'redacted-cloud';
}

function clean(json, type) {
  const out = {};
  for (const [k] of DOC_TYPES[type].fields) {
    let v = json ? json[k] : undefined;
    if (k === 'amount') v = typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.\-]/g, '')) || null;
    else v = v == null ? '' : String(v).trim();
    out[k] = v;
  }
  return out;
}

// Read one document. `doc` has { docType, image, text }. Returns
// { fields, ranOn, path, ms, sent, redaction } where `sent` is exactly what left the device (or null).
export async function readDocument(doc, { path } = {}) {
  const type = DOC_TYPES[doc.docType];
  if (!type) throw new Error(`Unknown document type: ${doc.docType}`);
  const how = path || await readPath();
  if (how === 'device') {
    const data = await toBase64(doc.image);
    const r = await run({ task: `Read ${type.label.toLowerCase()} (scan)`, dataClass: 'raw_documents', schema: type.schema,
      prompt: `${type.instruction}\n\nRead the attached ${type.label.toLowerCase()}.`, images: [{ mimeType: 'image/png', data }] });
    return { fields: clean(r.json, doc.docType), ranOn: r.ranOn, path: how, ms: r.ms, sent: null, redaction: null };
  }
  // No on-device model: redact on this device, send only the redacted text, restore values locally.
  const red = Redact.redact(doc.text);
  const r = await run({ task: `Read ${type.label.toLowerCase()} (redacted text)`, dataClass: 'redacted_text', schema: type.schema,
    prompt: `${type.instruction} Tokens in square brackets such as [ACCOUNT_1] replace private details; keep them as they are.\n\n${red.text}` });
  const fields = clean(r.json, doc.docType);
  for (const k of Object.keys(fields)) if (typeof fields[k] === 'string') fields[k] = Redact.restore(fields[k], red.entities);
  return { fields, ranOn: r.ranOn, path: how, ms: r.ms, sent: r.ranOn === 'in_cloud' ? red.text : null, redaction: red };
}

export { PolicyBlocked };
