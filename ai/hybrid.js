// Tickmark Hybrid: every AI call goes through run(). It routes the call by data class and the bank's policy,
// prepares the on-device model (Gemini Nano in Chrome) when the person clicks, refuses to send anything that
// still looks like an identifier to the cloud, and records where the call ran in the data boundary ledger.
import { ai, getGenerativeModel, InferenceMode, configReady, policyValue } from './firebase.js';
import * as ledger from './ledger.js';
import './policy.js';
import './redact.js';

const Policy = self.TickmarkPolicy;
const Redact = self.TickmarkRedact;

// Session options for Chrome's Prompt API. Image input is only requested when this Chrome supports it
// (the multimodal flag); asking for an unsupported input makes session creation fail.
const TEXT_IN = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const IMAGE_IN = { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

async function availabilityOf(options) {
  if (!('LanguageModel' in self)) return 'unavailable';
  try { return await self.LanguageModel.availability(options); } catch { return 'unavailable'; }
}

// What the on-device model can do here: status for text prompts and for text-plus-image prompts.
// Each is 'available', 'downloadable', 'downloading' or 'unavailable'.
export async function deviceCaps() {
  const [text, image] = await Promise.all([availabilityOf(TEXT_IN), availabilityOf(IMAGE_IN)]);
  return { text, image };
}
export async function deviceStatus(needsImage = false) {
  const caps = await deviceCaps();
  return needsImage ? caps.image : caps.text;
}

// One GenerativeModel per mode, schema and input type, so on-device sessions and cloud settings are reused.
const models = new Map();
function modelFor(mode, schema, needsImage = false) {
  const key = mode + '|' + (needsImage ? 'image' : 'text') + '|' + (schema ? JSON.stringify(schema) : '');
  if (models.has(key)) return models.get(key);
  const cloudModel = policyValue('ai_cloud_model');
  const params = {
    mode,
    inCloudParams: { model: cloudModel, generationConfig: schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {} },
    onDeviceParams: {
      createOptions: needsImage ? IMAGE_IN : TEXT_IN,
      promptOptions: schema ? { responseConstraint: schema } : {},
    },
  };
  const m = getGenerativeModel(ai, params);
  models.set(key, m);
  return m;
}

// Must be called from a click or key press: Chrome only downloads the on-device model after a user gesture.
let preparing = null;
export function prepareDevice(onProgress = () => {}) {
  if (!preparing) {
    const m = modelFor(InferenceMode.PREFER_ON_DEVICE, null);
    preparing = m.initializeDeviceModel((p) => onProgress(p)).catch((e) => { preparing = null; throw e; });
  }
  return preparing;
}

// Plain-language guidance for what went wrong on this device, so nobody is left with a raw browser error.
export function deviceHint(err, status) {
  const m = String(err && err.message || err || '');
  if (/crashed too many times/i.test(m)) return 'Chrome stopped the on-device model after it crashed. On PCs with two graphics chips, set Chrome to "High performance" in Windows Settings > System > Display > Graphics, then restart Chrome.';
  if (status === 'unavailable' || /not available|API_NOT_ENABLED|unable to create a session/i.test(m)) return 'This browser has no on-device model. Use Chrome on a desktop (139 or later) with the Prompt API enabled, or continue with the redacted cloud path.';
  if (/download/i.test(m)) return 'The on-device model is still downloading. Keep this tab open and try again in a minute.';
  return m || 'The on-device model could not start.';
}

// Prepare the on-device model for real: download if needed, then open a session and ask one short question,
// because availability() can report "available" while sessions still fail. Warming up here also takes the
// slow first start out of the person's first real read. Returns { ok, status, ms, hint }.
let ready = null;
export async function ensureDevice(onProgress = () => {}, needsImage = false) {
  const status = await deviceStatus(needsImage);
  if (status === 'unavailable') return { ok: false, status, hint: deviceHint(null, status) };
  const key = needsImage ? 'image' : 'text';
  if (ready && ready[key]) return { ok: true, status: 'available', ms: 0 };
  try {
    await prepareDevice(onProgress);
    const t0 = performance.now();
    const m = modelFor(InferenceMode.ONLY_ON_DEVICE, null, needsImage);
    await m.generateContent('Reply with the single word OK.');
    ready = { ...(ready || {}), [key]: true };
    return { ok: true, status: 'available', ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, status, hint: deviceHint(e, status), error: String(e && e.message || e) };
  }
}
export const deviceReady = (needsImage = false) => !!(ready && ready[needsImage ? 'image' : 'text']);

export class PolicyBlocked extends Error {
  constructor(message, route) { super(message); this.name = 'PolicyBlocked'; this.route = route; }
}

// Run one AI task.
//   task:      a short name for the ledger, e.g. "Read wire confirmation"
//   dataClass: 'raw_documents' | 'redacted_text' | 'case_history'
//   prompt:    the text instruction (and the document text, when there is one)
//   images:    optional [{ mimeType: 'image/png' | 'image/jpeg', data: base64 }]
//   schema:    optional JSON schema for structured output
// Returns { text, json, ranOn: 'on_device' | 'in_cloud', ms, route, ledgerId }.
export async function run({ task, dataClass, prompt, images = [], schema = null }) {
  await configReady;
  if (policyValue('ai_enabled') === 'false') throw new PolicyBlocked('AI is switched off by policy.', null);
  const needsImage = images.length > 0;
  const device = await deviceStatus(needsImage);
  const route = Policy.route(dataClass, policyValue, device);

  if (route.plan === 'blocked') {
    ledger.record({ task, dataClass, policy: route.policy, mode: route.mode, ranOn: 'blocked', ms: 0, leftDevice: null, note: 'No on-device model, and this data may not leave the device.' });
    throw new PolicyBlocked('This data may only be read on this device, and no on-device model is available here. Redact it first, then try again.', route);
  }
  // Last line of defence: anything that could reach the cloud is checked for identifiers first.
  if (route.mayLeaveDevice) {
    const leaks = Redact.leaks(prompt);
    if (leaks.length) {
      ledger.record({ task, dataClass, policy: route.policy, mode: route.mode, ranOn: 'blocked', ms: 0, leftDevice: null, note: `Blocked: ${leaks.length} identifier(s) found before sending (${[...new Set(leaks.map((l) => l.type))].join(', ')}).` });
      throw new PolicyBlocked('This text still contains identifiers, so it was not sent. Redact it first.', route);
    }
  }

  const model = modelFor(route.mode, schema, needsImage);
  const parts = [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } }))];
  const t0 = performance.now();
  const result = await model.generateContent(parts.length === 1 ? prompt : parts);
  const ms = Math.round(performance.now() - t0);
  const response = result.response;
  const text = response.text();
  const ranOn = response.inferenceSource || (route.mode === 'only_in_cloud' ? 'in_cloud' : 'on_device');
  let json = null;
  if (schema) { try { json = JSON.parse(text); } catch { json = null; } }
  const row = ledger.record({
    task, dataClass, policy: route.policy, mode: route.mode, ranOn, ms,
    leftDevice: ranOn === 'in_cloud' ? prompt + (images.length ? `\n[+ ${images.length} image(s)]` : '') : null,
    note: ranOn === 'on_device' ? 'Nothing left this device.' : 'Sent to the cloud model after the identifier check.',
  });
  return { text, json, ranOn, ms, route, ledgerId: row.id };
}

// Same as run(), streamed: onText(textSoFar) is called as the model writes. Text tasks only.
export async function stream({ task, dataClass, prompt, onText = () => {} }) {
  await configReady;
  if (policyValue('ai_enabled') === 'false') throw new PolicyBlocked('AI is switched off by policy.', null);
  const device = await deviceStatus(false);
  const route = Policy.route(dataClass, policyValue, device);
  if (route.plan === 'blocked') {
    ledger.record({ task, dataClass, policy: route.policy, mode: route.mode, ranOn: 'blocked', ms: 0, leftDevice: null, note: 'No on-device model, and this data may not leave the device.' });
    throw new PolicyBlocked('This data may only be processed on this device, and no on-device model is available here.', route);
  }
  if (route.mayLeaveDevice) {
    const leaks = Redact.leaks(prompt);
    if (leaks.length) {
      ledger.record({ task, dataClass, policy: route.policy, mode: route.mode, ranOn: 'blocked', ms: 0, leftDevice: null, note: `Blocked: ${leaks.length} identifier(s) found before sending.` });
      throw new PolicyBlocked('This text still contains identifiers, so it was not sent. Redact it first.', route);
    }
  }
  const model = modelFor(route.mode, null, false);
  const t0 = performance.now();
  const result = await model.generateContentStream(prompt);
  let text = '', ranOn = null;
  for await (const chunk of result.stream) {
    ranOn = ranOn || chunk.inferenceSource;
    text += chunk.text();
    onText(text, ranOn);
  }
  const final = await result.response;
  ranOn = final.inferenceSource || ranOn || (route.mode === 'only_in_cloud' ? 'in_cloud' : 'on_device');
  const ms = Math.round(performance.now() - t0);
  const row = ledger.record({ task, dataClass, policy: route.policy, mode: route.mode, ranOn, ms,
    leftDevice: ranOn === 'in_cloud' ? prompt : null, note: ranOn === 'on_device' ? 'Nothing left this device.' : 'Sent to the cloud model after the identifier check.' });
  return { text, ranOn, ms, route, ledgerId: row.id };
}

export { ledger };
