// Tickmark Hybrid: tells the person, in plain words, when compliance changes the AI policy in Remote Config.
// The change takes effect on the next AI call (routing reads the policy every time).
import { onPolicyChange, policyValue } from './firebase.js';
import { resetModels } from './hybrid.js';
import * as ledger from './ledger.js';

const LABEL = {
  ai_policy_raw_documents: 'Raw customer documents', ai_policy_redacted_text: 'Redacted text', ai_policy_case_history: 'Redacted case history',
  ai_cloud_model: 'Cloud model', ai_prompt_version: 'Prompt set', ai_enabled: 'AI',
};
const WORD = { device_only: 'on this device only', prefer_device: 'on this device first, cloud if needed', prefer_cloud: 'cloud first', cloud_only: 'cloud only', true: 'on', false: 'switched off' };

function show(lines) {
  let el = document.getElementById('tm-policy-notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tm-policy-notice';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;max-width:min(420px,calc(100vw - 32px));background:#1e1d1b;color:#efe7d8;border:1px solid #d2a965;padding:14px 16px;font:14px/1.5 Manrope,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)';
    document.body.appendChild(el);
  }
  el.innerHTML = `<b style="color:#d2a965">Compliance updated the AI policy</b><br>${lines.join('<br>')}<br><span style="color:#a49b8d;font-size:12px">From Remote Config, live. It applies to the next AI call.</span> <button style="margin-left:6px;background:none;border:0;color:#d2a965;cursor:pointer;font:inherit;text-decoration:underline" onclick="this.parentNode.remove()">Dismiss</button>`;
}

onPolicyChange((keys) => {
  resetModels();
  const lines = keys.map((k) => `${LABEL[k] || k}: <b>${WORD[policyValue(k)] || policyValue(k)}</b>`);
  show(lines);
  ledger.record({ task: 'Policy updated by compliance (Remote Config)', dataClass: '-', policy: keys.map((k) => `${k}=${policyValue(k)}`).join(', '), mode: '-', ranOn: 'policy', ms: 0, leftDevice: null, note: 'No AI call; the policy changed.' });
});
