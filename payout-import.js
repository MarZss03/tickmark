// Read a Shopify Payments "Export payout transactions" CSV and explain it the way the store owner view does.
// Columns, per Shopify Help (Payouts › View details, checked 5 Nov 2026): Transaction Date, Type, Order, Card Brand,
// Card Source, Payout Status, Payout Date, Available On, Amount, Fee, Net. Only Type, Amount, Fee and Net are required.
// Pure functions, no DOM; the file never leaves the browser. Facts come from the file; anything else is a possible
// reason and is labelled as not confirmed.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkPayoutImport = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const COLUMNS = ['Transaction Date', 'Type', 'Order', 'Card Brand', 'Card Source', 'Payout Status', 'Payout Date', 'Available On', 'Amount', 'Fee', 'Net'];
  const REQUIRED = ['Type', 'Amount', 'Fee', 'Net'];
  const r2 = (n) => Math.round(n * 100) / 100;
  const near = (a, b) => Math.abs(a - b) < 0.005;

  function parseCsv(text) {
    const s = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    return rows;
  }
  // "1,234.50", "$1,234.50", "-12.00", "(12.00)"
  function amount(raw) {
    let t = String(raw ?? '').trim().replace(/[$€£\s]/g, '').replace(/,/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t === '') return 0;
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    return neg ? -parseFloat(t) : parseFloat(t);
  }

  // what a Type means for the store owner; anything unknown keeps its own name
  const KINDS = [
    ['chargebacks', 'Chargebacks', /charge ?back|dispute/],
    ['sales', 'Sales', /^(charge|sale|payment)/],
    ['refunds', 'Refunds', /refund/],
    ['reserve', 'Held as reserve', /reserve/],
    ['adjustments', 'Adjustments', /adjust/],
    ['payout', 'Payout lines', /^payout/],
  ];
  function kindOf(type) {
    const t = String(type || '').toLowerCase().replace(/_/g, ' ').trim();
    for (const [key, label, re] of KINDS) if (re.test(t)) return { key, label };
    return { key: 'other:' + t, label: t ? t[0].toUpperCase() + t.slice(1) : 'No type' };
  }

  function analyse(text, { bank = null } = {}) {
    const grid = parseCsv(text || '');
    if (!grid.length) return { ok: false, error: 'The file is empty.' };
    const head = grid[0].map((h) => h.trim());
    const idx = {};
    head.forEach((h, i) => { const k = COLUMNS.find((c) => c.toLowerCase() === h.toLowerCase()); if (k && idx[k] == null) idx[k] = i; });
    const missing = REQUIRED.filter((c) => idx[c] == null);
    if (missing.length) return { ok: false, error: `This does not look like a Shopify payout transactions export: no ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}.`, missing, found: head };
    const get = (row, c) => (idx[c] == null ? '' : String(row[idx[c]] ?? '').trim());

    const rows = [], bad = [];
    grid.slice(1).forEach((row, i) => {
      const a = amount(get(row, 'Amount')), f = amount(get(row, 'Fee')), n = amount(get(row, 'Net'));
      if ([a, f, n].some(Number.isNaN)) { bad.push(i + 2); return; }
      rows.push({
        line: i + 2, type: get(row, 'Type'), kind: kindOf(get(row, 'Type')), order: get(row, 'Order'),
        date: get(row, 'Transaction Date').slice(0, 10), status: get(row, 'Payout Status').toLowerCase(),
        payoutDate: get(row, 'Payout Date').slice(0, 10), availableOn: get(row, 'Available On').slice(0, 10),
        amount: a, fee: f, net: n,
      });
    });
    if (!rows.length) return { ok: false, error: bad.length ? `No line could be read: the amounts on lines ${bad.slice(0, 5).join(', ')} are not numbers.` : 'The file has a header but no transactions.' };

    // the payout's own lines, grouped the way the owner view shows them
    const tx = rows.filter((r) => r.kind.key !== 'payout');
    const groups = new Map();
    for (const r of tx) {
      const g = groups.get(r.kind.key) || { key: r.kind.key, label: r.kind.label, amount: 0, count: 0, orders: [], rows: [] };
      g.amount = r2(g.amount + r.amount); g.count++; if (r.order) g.orders.push(r.order); g.rows.push(r);
      groups.set(r.kind.key, g);
    }
    const ORDER = ['sales', 'refunds', 'chargebacks', 'adjustments', 'reserve'];
    const lines = [...groups.values()].sort((a, b) => ((ORDER.indexOf(a.key) + 1) || 99) - ((ORDER.indexOf(b.key) + 1) || 99));
    const fees = r2(-tx.reduce((s, r) => s + r.fee, 0));
    const gross = r2(tx.reduce((s, r) => s + r.amount, 0));
    const net = r2(tx.reduce((s, r) => s + r.net, 0));
    const netOff = tx.filter((r) => !near(r.amount - r.fee, r.net));

    const payoutDates = [...new Set(tx.map((r) => r.payoutDate).filter(Boolean))].sort();
    const pending = tx.filter((r) => r.status && r.status !== 'paid');
    const dates = tx.map((r) => r.date).filter(Boolean).sort();

    // facts from the file
    const facts = [];
    facts.push(`${tx.length} transaction${tx.length === 1 ? '' : 's'}${dates.length ? `, ${dates[0]}${dates[dates.length - 1] !== dates[0] ? ' to ' + dates[dates.length - 1] : ''}` : ''}${payoutDates.length === 1 ? `, paid out ${payoutDates[0]}` : ''}.`);
    if (payoutDates.length > 1) facts.push(`The file covers ${payoutDates.length} payout dates (${payoutDates.join(', ')}). One bank deposit matches one payout, so export a single payout to compare it with your bank.`);
    if (pending.length) facts.push(`${pending.length} transaction${pending.length === 1 ? ' is' : 's are'} not paid out yet (status: ${[...new Set(pending.map((r) => r.status))].join(', ')}).`);
    if (netOff.length) facts.push(`On ${netOff.length} line${netOff.length === 1 ? '' : 's'} (${netOff.slice(0, 4).map((r) => r.line).join(', ')}), Amount minus Fee is not Net. The total uses Net.`);
    if (bad.length) facts.push(`${bad.length} line${bad.length === 1 ? '' : 's'} could not be read and ${bad.length === 1 ? 'is' : 'are'} left out (${bad.slice(0, 5).join(', ')}).`);
    if (rows.length !== tx.length) facts.push('Payout lines in the file are left out of the total; only transactions are added up.');

    // what to do: only what the file supports
    const todo = [];
    const cb = groups.get('chargebacks');
    if (cb) todo.push(`${cb.count} chargeback${cb.count === 1 ? '' : 's'} (${money(-cb.amount)})${cb.orders.length ? ` on order${cb.orders.length === 1 ? '' : 's'} ${cb.orders.slice(0, 4).join(', ')}` : ''}. Open each in Shopify admin to see whether you can still submit evidence and by when; this export does not include the deadline.`);
    const rs = groups.get('reserve');
    if (rs) {
      const back = [...new Set(rs.rows.map((r) => r.availableOn).filter(Boolean))].sort();
      todo.push(`${money(Math.abs(rs.amount))} is ${rs.amount < 0 ? 'held as a reserve' : 'released from a reserve'}${back.length ? `; the file says available on ${back.join(', ')}` : '; the file gives no release date'}.`);
    }
    const adj = groups.get('adjustments');
    if (adj) todo.push(`${adj.count} adjustment${adj.count === 1 ? '' : 's'} (${adj.amount < 0 ? '−' : ''}${money(Math.abs(adj.amount))}). The export does not say what each one is for; the payout page in Shopify admin lists them.`);
    for (const g of lines.filter((x) => x.key.startsWith('other:'))) todo.push(`${g.count} line${g.count === 1 ? '' : 's'} of type “${g.label}” (${g.amount < 0 ? '−' : ''}${money(Math.abs(g.amount))}) that this page does not recognise; they are still counted.`);

    // the bank, if given
    let compare = null;
    if (bank != null && bank !== '' && !Number.isNaN(amount(bank))) {
      const b = r2(amount(bank)), gap = r2(net - b);
      const maybe = near(gap, 0) ? null
        : gap > 0 ? (payoutDates.length > 1 ? 'The file holds more than one payout; the deposit may be only one of them.' : 'The deposit may belong to a different payout, or part of this payout may have been held or used to cover a negative balance. Neither is in this file, so check the payout page in Shopify admin and the bank deposit date.')
          : 'The deposit is more than this payout. It may combine two payouts, or include money from elsewhere.';
      compare = { bank: b, gap, ties: near(gap, 0), maybe };
    }
    return { ok: true, columns: head, rows, lines, fees, gross, net, payoutDates, pending: pending.length, facts, todo, compare };
  }
  function money(n) { return '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // a synthetic file in the same columns, for trying it without a store
  const SAMPLE = [
    COLUMNS.join(','),
    '2026-11-01 10:14:02 -0400,charge,#1201,visa,online,paid,2026-11-04,2026-11-04,"1,280.00",37.42,"1,242.58"',
    '2026-11-01 13:40:51 -0400,charge,#1202,mastercard,online,paid,2026-11-04,2026-11-04,640.00,18.86,621.14',
    '2026-11-02 09:02:17 -0400,charge,#1203,visa,online,paid,2026-11-04,2026-11-04,"2,150.00",62.65,"2,087.35"',
    '2026-11-02 16:25:39 -0400,refund,#1188,visa,online,paid,2026-11-04,2026-11-04,-95.00,0.00,-95.00',
    '2026-11-02 18:03:12 -0400,chargeback,#1142,mastercard,online,paid,2026-11-04,2026-11-04,-300.00,15.00,-315.00',
    '2026-11-03 08:30:00 -0400,reserve,,,,paid,2026-11-04,2026-12-03,-200.00,0.00,-200.00',
    '2026-11-03 11:12:44 -0400,adjustment,,,,paid,2026-11-04,2026-11-04,-12.40,0.00,-12.40',
  ].join('\r\n') + '\r\n';
  const SAMPLE_BANK = 3328.67;

  return { analyse, parseCsv, amount, kindOf, COLUMNS, REQUIRED, SAMPLE, SAMPLE_BANK };
});
