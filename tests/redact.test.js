// Tests for on-device redaction (ai/redact.js). Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../ai/redact.js');

const WIRE = `INCOMING WIRE CONFIRMATION
Beneficiary: Harbour Lane Mortgage Corp
Beneficiary account: 004-12345-6789012
Transit no. 00412  Institution 004
Ordering customer: Priya Raman and Daniel Okafor
Address: 88 Willowdale Crescent, Toronto, ON M2N 5Z4
Phone: (416) 555-0192   Email: priya.raman@example.com
Reference: MTG-2026-118842
Amount: CAD 412,860.17   Value date: 2026-11-02   Posted: 2026-11-05`;

test('removes who and where, keeps amounts and dates', () => {
  const r = R.redact(WIRE);
  for (const gone of ['Priya Raman', 'Daniel Okafor', '004-12345-6789012', '88 Willowdale Crescent', 'M2N 5Z4', '(416) 555-0192', 'priya.raman@example.com', 'MTG-2026-118842', 'Harbour Lane Mortgage Corp']) {
    assert.ok(!r.text.includes(gone), `should remove ${gone}`);
  }
  for (const kept of ['412,860.17', '2026-11-02', '2026-11-05', 'INCOMING WIRE CONFIRMATION', 'Value date']) {
    assert.ok(r.text.includes(kept), `should keep ${kept}`);
  }
  assert.deepEqual(R.leaks(r.text), []);
});

test('the same value gets the same token, and restore puts it back on the device', () => {
  const r = R.redact('Client: Ana Silva. Later, Client: Ana Silva confirmed. Account: 5551234');
  const tokens = r.entities.filter((e) => e.value === 'Ana Silva').map((e) => e.token);
  assert.equal(new Set(tokens).size, 1);
  const reply = `Ask ${tokens[0]} to confirm the deposit to [ACCOUNT_1].`;
  assert.equal(R.restore(reply, r.entities), 'Ask Ana Silva to confirm the deposit to 5551234.');
});

test('a card number is removed only when it passes the Luhn check', () => {
  assert.ok(!R.redact('Card 4111 1111 1111 1111 charged').text.includes('4111'));
  assert.ok(R.redact('Batch 1234 5678 9012 3456 total').text.includes('1234 5678 9012 3456'));
});

test('SIN, title names and known names from the case file are removed', () => {
  const r = R.redact('Mrs. Chen signed. SIN 046 454 286. The Estate of Wong is noted.', { known: ['Wong'] });
  assert.ok(!r.text.includes('Chen'));
  assert.ok(!r.text.includes('046 454 286'));
  assert.ok(!r.text.includes('Wong'));
});

test('dollar amounts and per diem figures are not mistaken for identifiers', () => {
  const r = R.redact('Per diem $56.71 for 3 days = $170.13. Penalty 3 months interest $4,512.00. Rate 5.29%.');
  assert.equal(r.removed, 0);
});

test('leaks() catches anything that slipped through', () => {
  assert.deepEqual(R.leaks('Call 647-555-0100').map((l) => l.type), ['PHONE']);
  assert.deepEqual(R.leaks('Total 1,200.00 on 2026-11-02'), []);
});
