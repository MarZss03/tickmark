// Tests for reading a Shopify Payments "Export payout transactions" CSV. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../payout-import.js');

const H = P.COLUMNS.join(',');
const line = (type, amount, fee, net, extra = {}) => [extra.date || '2026-11-01 10:00:00 -0400', type, extra.order || '', 'visa', 'online', extra.status || 'paid', extra.payout || '2026-11-04', extra.avail || '2026-11-04', amount, fee, net].join(',');

test('the sample adds up: lines plus fees equal the sum of Net, and the bank amount ties', () => {
  const r = P.analyse(P.SAMPLE, { bank: P.SAMPLE_BANK });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((l) => l.key), ['sales', 'refunds', 'chargebacks', 'adjustments', 'reserve']);
  const sum = r.lines.reduce((s, l) => s + l.amount, 0) + r.fees;
  assert.ok(Math.abs(sum - r.net) < 0.005);
  assert.equal(r.net, 3328.67);
  assert.equal(r.compare.ties, true);
  assert.equal(r.compare.maybe, null);
  assert.ok(r.todo.some((t) => t.includes('#1142') && t.includes('does not include the deadline')));
  assert.ok(r.todo.some((t) => t.includes('2026-12-03')));
});

test('the Shopify column names are the ones on the help page, in order, and only four are required', () => {
  assert.deepEqual(P.COLUMNS, ['Transaction Date', 'Type', 'Order', 'Card Brand', 'Card Source', 'Payout Status', 'Payout Date', 'Available On', 'Amount', 'Fee', 'Net']);
  const r = P.analyse('type,AMOUNT,fee,Net\ncharge,100.00,3.20,96.80\n');
  assert.equal(r.ok, true, 'headers match whatever the case');
  assert.equal(r.net, 96.8);
  assert.equal(r.fees, -3.2);
});

test('a bank amount below the payout is a gap with a possible reason, never a confirmed one', () => {
  const csv = [H, line('charge', '500.00', '15.00', '485.00')].join('\n');
  const r = P.analyse(csv, { bank: '$435.00' });
  assert.equal(r.compare.gap, 50);
  assert.equal(r.compare.ties, false);
  assert.match(r.compare.maybe, /may/);
  const more = P.analyse(csv, { bank: '985' });
  assert.equal(more.compare.gap, -500);
  assert.match(more.compare.maybe, /combine two payouts/);
  assert.equal(P.analyse(csv, { bank: '' }).compare, null, 'no bank amount, no comparison');
});

test('the file says what it cannot support: several payouts, pending lines, Net that does not fit, unreadable lines', () => {
  const csv = [H,
    line('charge', '"1,000.00"', '29.30', '970.70'),
    line('charge', '200.00', '6.10', '193.90', { payout: '2026-11-05', status: 'pending' }),
    line('refund', '-50.00', '0.00', '-49.00'),
    line('charge', 'abc', '0', '0'),
    line('payout', '-1115.60', '0.00', '-1115.60'),
    line('chargeback_fee', '-15.00', '0.00', '-15.00'),
  ].join('\r\n');
  const r = P.analyse(csv);
  assert.equal(r.ok, true);
  const facts = r.facts.join(' ');
  assert.match(facts, /2 payout dates/);
  assert.match(facts, /1 transaction is not paid out yet \(status: pending\)/);
  assert.match(facts, /Amount minus Fee is not Net/);
  assert.match(facts, /1 line could not be read/);
  assert.match(facts, /Payout lines in the file are left out/);
  assert.ok(r.lines.some((l) => l.key === 'chargebacks'), 'chargeback_fee counts with chargebacks');
  assert.equal(r.net, Math.round((970.7 + 193.9 - 49 - 15) * 100) / 100);
});

test('unknown types keep their name and are still counted; wrong files get a plain error', () => {
  const r = P.analyse([H, line('charge', '10.00', '0.59', '9.41'), line('tax_adjustment', '-0.30', '0', '-0.30'), line('mystery_credit', '5.00', '0', '5.00')].join('\n'));
  assert.ok(r.todo.some((t) => t.includes('“Mystery credit”')));
  assert.equal(r.net, 14.11);
  assert.equal(P.kindOf('tax_adjustment').key, 'adjustments');
  const wrong = P.analyse('Date,Description,Amount\n2026-11-04,PAYOUT,100\n');
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.missing, ['Type', 'Fee', 'Net']);
  assert.match(wrong.error, /does not look like a Shopify payout transactions export/);
  assert.equal(P.analyse('').ok, false);
  assert.match(P.analyse(H + '\n').error, /no transactions/);
});
