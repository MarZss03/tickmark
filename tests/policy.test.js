// Tests for the AI policy routing (ai/policy.js). Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../ai/policy.js');

const read = (over = {}) => (k) => over[k];

test('raw documents run on device when the model is there, and are blocked when it is not', () => {
  assert.equal(P.route('raw_documents', read(), 'available').plan, 'device');
  assert.equal(P.route('raw_documents', read(), 'downloadable').plan, 'wait_for_download');
  const r = P.route('raw_documents', read(), 'unavailable');
  assert.equal(r.plan, 'blocked');
  assert.equal(r.mayLeaveDevice, false);
});

test('raw documents fail closed: a policy that allows the cloud is ignored', () => {
  for (const v of ['cloud_only', 'prefer_cloud', 'prefer_device', 'typo']) {
    const r = P.route('raw_documents', read({ ai_policy_raw_documents: v }), 'unavailable');
    assert.equal(r.mode, 'only_on_device', v);
    assert.equal(r.plan, 'blocked', v);
  }
});

test('redacted text prefers the device and falls back to the cloud', () => {
  assert.equal(P.route('redacted_text', read(), 'available').plan, 'device');
  assert.equal(P.route('redacted_text', read(), 'unavailable').plan, 'cloud');
});

test('compliance can change a class through Remote Config, and unknown values fall back', () => {
  assert.equal(P.route('redacted_text', read({ ai_policy_redacted_text: 'device_only' }), 'unavailable').plan, 'blocked');
  assert.equal(P.route('case_history', read({ ai_policy_case_history: 'cloud_only' }), 'available').mode, 'only_in_cloud');
  assert.equal(P.route('case_history', read({ ai_policy_case_history: 'nonsense' }), 'available').mode, 'prefer_in_cloud');
});

test('an unknown data class is an error, not a silent default', () => {
  assert.throws(() => P.route('customer_photos', read(), 'available'));
});
