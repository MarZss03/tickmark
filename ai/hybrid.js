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

export { ledger };
