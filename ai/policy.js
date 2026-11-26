// Tickmark Hybrid: the AI policy. Every AI task declares the class of data it sends; the bank's policy (a
// Remote Config value) decides where that class may run. This is pure logic with no Firebase calls, so the
// tests can load it with require() and the page loads it as window.TickmarkPolicy.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkPolicy = api;
})(typeof self !== 'undefined' ? self : this, () => {
  // Data classes, from most to least sensitive.
  const CLASSES = {
    raw_documents: { key: 'ai_policy_raw_documents', label: 'Raw customer document', fallback: 'device_only' },
    redacted_text: { key: 'ai_policy_redacted_text', label: 'Redacted text', fallback: 'prefer_device' },
    case_history: { key: 'ai_policy_case_history', label: 'Redacted case history', fallback: 'prefer_cloud' },
  };
  // Policy values and the Firebase AI Logic inference mode each one maps to.
  const MODES = {
    device_only: 'only_on_device',
    prefer_device: 'prefer_on_device',
    prefer_cloud: 'prefer_in_cloud',
    cloud_only: 'only_in_cloud',
  };
  // Raw documents may never be allowed into the cloud, whatever Remote Config says: a mistyped or tampered
  // policy fails closed.
  const NEVER_CLOUD = new Set(['raw_documents']);

  // Decide how a task runs. `read(key)` returns the policy value for a key (Remote Config or a default);
  // `device` is the on-device model status: 'available', 'downloadable', 'downloading' or 'unavailable'.
  function route(dataClass, read, device) {
    const c = CLASSES[dataClass];
    if (!c) throw new Error(`Unknown data class: ${dataClass}`);
    let value = String(read(c.key) || c.fallback).trim();
    if (!MODES[value]) value = c.fallback;
    if (NEVER_CLOUD.has(dataClass) && value !== 'device_only') value = 'device_only';
    const mode = MODES[value];
    const deviceReady = device === 'available';
    let plan;
    if (mode === 'only_on_device') plan = deviceReady ? 'device' : device === 'unavailable' ? 'blocked' : 'wait_for_download';
    else if (mode === 'only_in_cloud') plan = 'cloud';
    else if (mode === 'prefer_on_device') plan = deviceReady ? 'device' : 'cloud';
    else plan = 'cloud_or_device';
    return { dataClass, label: c.label, policy: value, mode, plan, mayLeaveDevice: mode !== 'only_on_device' };
  }

  return { CLASSES, MODES, route };
});
