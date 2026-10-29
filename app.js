// Tickmark: the page's live parts. Every amount and rule decision comes from engine.js;
// this file renders, records decisions, saves the session in the browser, and exports CSV.
(() => {
  const E = window.TickmarkEngine;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = E.money;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const iso = () => new Date().toISOString();
  const stamp = (at) => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return String(at);
    return new Date().toDateString() === d.toDateString() ? d.toTimeString().slice(0, 8) : `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
  };

  // ---------- the session, saved in this browser only ----------
  const store = (() => {
    const KEY = 'tickmark:v1';
    let data = {};
    try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { data = {}; }
    let warned = false;
    return {
      get: (k, fallback) => (data[k] === undefined ? fallback : data[k]),
      set: (k, v) => {
        data[k] = v;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {
          if (!warned) { warned = true; window.tmToast?.('Not saved', 'This browser will not store the session, so it resets when you leave.'); }
        }
      },
      clear: () => { data = {}; try { localStorage.removeItem(KEY); } catch {} },
    };
  })();

  // ---------- CSV download ----------
  const today = () => new Date().toISOString().slice(0, 10);
  function download(name, csv) {
    // the byte-order mark lets Excel read accents and Chinese correctly
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- audit log, shared by every control ----------
  const audit = store.get('audit', []);
  function renderAudit() {
    if (!$('#audit-t')) return;
    $('#audit-count').textContent = audit.length;
    $('#audit-empty').hidden = audit.length > 0;
    $('#audit-t tbody').innerHTML = audit.map((a) => `<tr><td class="num">${esc(stamp(a.at))}</td><td>${esc(a.actor)}</td><td>${esc(a.event)}</td><td>${esc(a.detail)}</td></tr>`).join('');
  }
  function log(actor, event, detail) {
    audit.unshift({ at: iso(), actor, event, detail });
    if (audit.length > 500) audit.length = 500;
    store.set('audit', audit);
    window.tmToast?.(event, detail);
    renderAudit();
  }

  // ---------- hero: the journal entry control ----------
  (() => {
    const form = $('#je'); if (!form) return;
    const d1 = $('#je-d1'), d2 = $('#je-d2'), c1 = $('#je-c1'), self = $('#je-self'), rel = $('#je-release');
    const REGISTER = 51941.13; // contractor payroll per the register
    let released = false;
    function check() {
      const r = E.checkJournal({ debits: [E.parseAmount(d1.value), E.parseAmount(d2.value)], credits: [E.parseAmount(c1.value)], register: REGISTER, selfApproved: self.checked });
      $('#je-dr').textContent = Number.isFinite(r.dr) ? money(r.dr) : '—';
      $('#je-cr').textContent = Number.isFinite(r.cr) ? money(r.cr) : '—';
      const set = (k, pass, note) => { const li = $(`[data-check="${k}"]`, form); li.classList.toggle('fail', !pass); $('b', li).textContent = note; };
      set('balance', r.ok.balance, r.ok.balance ? 'balanced' : Number.isFinite(r.dr - r.cr) ? `off by ${money(Math.abs(r.dr - r.cr))}` : 'not a number');
      set('period', r.ok.period, 'open');
      set('evidence', r.ok.evidence, r.ok.evidence ? 'ties' : `register ${money(REGISTER)}`);
      set('four', r.ok.four, r.ok.four ? 'separate' : 'same person');
      const st = $('#je-state');
      st.textContent = released ? 'Released' : r.all ? 'Ready' : 'Blocked';
      st.className = 'pill ' + (released || r.all ? 'ok' : 'neg');
      rel.disabled = !r.all || released;
      if (!released) $('#je-log').textContent = r.all ? 'Every check holds. A person can release it.' : 'Blocked until every check holds. Nothing is posted.';
      return r.all;
    }
    [d1, d2, c1].forEach((i) => {
      i.addEventListener('input', () => { if (released) { released = false; form.classList.remove('released'); } check(); });
      i.addEventListener('blur', () => { const n = E.parseAmount(i.value); if (Number.isFinite(n)) i.value = money(n); check(); });
    });
    self.addEventListener('change', check);
    rel.addEventListener('click', () => {
      if (!check()) return;
      released = true; form.classList.add('released');
      $('#je-log').textContent = `Released by you at ${stamp(iso())}. Logged with all four checks.`;
      log('You', 'Released JE-1031', `Dr ${$('#je-dr').textContent} = Cr ${$('#je-cr').textContent}`);
      check();
    });
    check();
  })();

  // ---------- workbench ----------
  const TM = window.TM;
  if (document.getElementById('app')) {
  const SAMPLE_PERIOD = { start: '2026-10-01', end: '2026-10-15' };
  const stat = (l, v, n, flag) => `<div class="stat${flag ? ' flag' : ''}"><p class="s-l">${l}</p><p class="s-v">${v}</p>${n ? `<p class="s-n">${n}</p>` : ''}</div>`;
  const sevPill = (s) => `<span class="pill ${s === 'high' ? 'neg' : s === 'medium' ? 'warn' : ''}">${s[0].toUpperCase() + s.slice(1)}</span>`;
  const drawn = {};
  function draw(view) {
    if (drawn[view] || !window.Charts) return;
    drawn[view] = true;
    if (view === 'close') {
      Charts.line($('#ch-close'), { labels: TM.closeDays, series: [{ name: 'Tasks done', values: TM.closeDone }], today: 3, todayLabel: 'Today BD3', endLabel: true, format: Charts.fmt.int });
      drawSources();
    }
    if (view === 'payroll') drawPayrollCharts();
    if (view === 'cash') drawFx();
    if (view === 'eval') {
      Charts.line($('#ch-ver'), { labels: ['2.0.0 · 66', '2.0.0 · 74', '2.1.0 · 74'], series: [{ name: 'Recall', values: TM.versions.map((v) => v.r) }], yTicks: [0.8, 0.85, 0.9, 0.95, 1], format: Charts.fmt.pct(1), endLabel: true });
      Charts.barList($('#ch-cats'), TM.evalCats.map(([label, n, pass]) => ({ label: `${label} · ${pass}/${n}`, value: n })), { format: Charts.fmt.int, thin: true });
    }
  }

  // close view
  const closeState = { ran: false, decisions: store.get('closeDecisions', {}), sel: null };
  function closeOpen() { return TM.close.filter((x) => !closeState.decisions[x.id]); }
  function renderCloseStats() {
    const open = closeState.ran ? closeOpen() : [];
    const blockers = open.filter((x) => x.blocks).length;
    const tasks = TM.closeDone[3];
    $('#close-stats').innerHTML =
      stat('Tasks done', `${tasks} of 42`, 'plan for BD3 was 32') +
      stat('Open exceptions', closeState.ran ? open.length : '—', closeState.ran ? `${TM.close.length - open.length} decided` : 'run the controls') +
      stat('Journals drafted', closeState.ran ? TM.journals.length : '—', closeState.ran ? `all ${TM.journals.length} balanced · ${money(TM.journals.reduce((a, j) => a + j.dr, 0))}` : '', false) +
      stat('Close blockers', closeState.ran ? blockers : '—', closeState.ran ? (blockers ? 'sign-off waits on these' : 'clear to sign off') : '', closeState.ran && blockers > 0);
  }
  function drawSources() {
    const el = $('#ch-src'); el.innerHTML = '';
    const srcs = ['NetSuite GL', 'Ramp cards', 'Numeric tasks', 'Snowflake metrics'];
    const open = closeState.ran ? closeOpen() : [];
    Charts.barList(el, srcs.map((s) => ({ label: s, value: open.filter((x) => x.source === s).length })), { format: Charts.fmt.int });
  }
  function renderCloseQueue() {
    const tb = $('#close-q tbody');
    if (!closeState.ran) { tb.innerHTML = `<tr><td colspan="5" class="d-empty">The queue fills when the controls run.</td></tr>`; $('#close-q-sub').textContent = ''; return; }
    $('#close-q-sub').textContent = `${closeOpen().length} open · high severity first`;
    tb.innerHTML = TM.close.map((x) => {
      const d = closeState.decisions[x.id];
      const status = d ? `<span class="pill ok">${esc(d.action)}</span>` : sevPill(x.sev);
      return `<tr class="click${closeState.sel === x.id ? ' on' : ''}" data-id="${x.id}" tabindex="0"><td>${x.id}</td><td>${esc(x.title)}<span class="sub">${esc(x.rule)}${x.blocks ? ' · blocks sign-off' : ''}</span></td><td>${esc(x.source)}</td><td class="num">${x.amount ? money(x.amount) : '—'}</td><td>${status}</td></tr>`;
    }).join('');
    $$('tr.click', tb).forEach((tr) => {
      const open = () => { closeState.sel = tr.dataset.id; renderCloseQueue(); renderDrawer(); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }
  function renderJournals() {
    const tb = $('#je-t tbody');
    if (!closeState.ran) { tb.innerHTML = `<tr><td colspan="5" class="d-empty">Journals are drafted when the controls run.</td></tr>`; $('#je-sub').textContent = ''; return; }
    $('#je-sub').textContent = `${TM.journals.length} drafts · ${money(TM.journals.reduce((a, j) => a + j.dr, 0))}`;
    tb.innerHTML = TM.journals.map((j) => {
      const ok = E.checkJournal({ debits: [j.dr], credits: [j.cr] }).ok.balance;
      return `<tr><td>${j.id}</td><td>${esc(j.memo)}</td><td class="num">${money(j.dr)}</td><td class="num">${money(j.cr)}</td><td class="${ok ? 'ok' : 'warn'}">${ok ? 'balanced' : 'out of balance'}</td></tr>`;
    }).join('');
  }
  function briefFor(x) {
    const ev = Object.fromEntries(x.evidence);
    const map = {
      'Reconciliation break': `GL 2400 is ${ev['GL 2400 balance']} against ${ev['Warehouse deferred rev.']} in the warehouse, a difference of ${ev['Difference']} over the ${ev['Tolerance']} tolerance. Confirm the revenue schedule before sign-off.`,
      'Cut-off': `${ev['Journal']} was posted on ${ev['Posting date']} into ${ev['Period']}. Reverse it and repost in October, or reopen September with the controller.`,
      'Missing accrual': `The payroll register expects ${ev['Estimate']} of October contractor cost and ${ev['Booked']} is booked. Draft JE-1031 is ready for review.`,
      'Missing receipt': `${ev['Amount']} at a cloud marketplace exceeds the ${ev['Policy limit']} limit with no receipt. Request it from the cardholder.`,
      'Possible duplicate': `Two charges of 1,350.00 on 14 Oct on card ·· 4410. Ask the cardholder whether both seats were intended.`,
      'Overdue task': `The operating bank reconciliation was due on BD2 and has no owner. Assign it today.`,
    };
    return map[x.rule];
  }
  function renderDrawer() {
    const el = $('#drawer');
    const x = TM.close.find((r) => r.id === closeState.sel);
    if (!x) { el.innerHTML = '<p class="d-empty">Pick an exception to see its evidence and decide.</p>'; return; }
    const d = closeState.decisions[x.id];
    el.innerHTML = `<p>${sevPill(x.sev)} <span class="c-s">${x.id} · ${esc(x.source)}</span></p>
      <h4>${esc(x.title)}</h4>
      <dl>${x.evidence.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="d-brief"><p>${esc(briefFor(x))}</p><p class="d-src">Deterministic brief · cites only the fields above</p></div>
      ${d ? `<p><span class="pill ok">${esc(d.action)}</span> by you at ${esc(stamp(d.at))}${d.reason ? ` · “${esc(d.reason)}”` : ''}</p>` : `
      <div class="d-acts">
        <button type="button" class="b-sec" data-act="Resolved">Mark resolved</button>
        <button type="button" class="b-sec" data-act="Held">Hold</button>
        <button type="button" class="b-sec" data-act="override">Override…</button>
      </div>
      <div class="ov" hidden>
        <label class="sr" for="ov-r">Reason for override</label>
        <textarea id="ov-r" placeholder="Why this is acceptable" aria-describedby="ov-h"></textarea>
        <p class="d-hint" id="ov-h">An override needs a written reason of at least 12 characters. It is kept in the audit log.</p>
        <div class="d-acts"><button type="button" class="b-pri" id="ov-go" disabled>Override with reason</button></div>
      </div>`}`;
    $$('[data-act]', el).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'override') { $('.ov', el).hidden = false; $('#ov-r').focus(); return; }
      decide(x, b.dataset.act);
    }));
    const r = $('#ov-r');
    if (r) {
      r.addEventListener('input', () => { $('#ov-go').disabled = r.value.trim().length < 12; });
      $('#ov-go').addEventListener('click', () => decide(x, 'Overridden', r.value.trim()));
    }
  }
  function decide(x, action, reason) {
    closeState.decisions[x.id] = { action, reason, at: iso() };
    store.set('closeDecisions', closeState.decisions);
    log('You', `${action} ${x.id}`, reason ? `${x.rule} · reason: ${reason}` : x.rule);
    renderCloseStats(); renderCloseQueue(); renderDrawer(); drawSources();
  }
  $('#run-close').addEventListener('click', async () => {
    const btn = $('#run-close'); btn.disabled = true;
    const steps = $$('#pipe li'); steps.forEach((s) => s.classList.remove('done'));
    $('#close-q tbody').innerHTML = Array.from({ length: 5 }, () => '<tr class="skel"><td><i></i></td><td><i></i><i class="s2"></i></td><td><i></i></td><td><i></i></td><td><i></i></td></tr>').join('');
    for (const s of steps) { await new Promise((r) => setTimeout(r, reduced ? 0 : 320)); s.classList.add('done'); }
    closeState.ran = true;
    log('Engine', 'Close controls ran', `63 rows · ${TM.close.length} exceptions · ${TM.journals.length} journals drafted`);
    renderCloseStats(); renderCloseQueue(); renderJournals(); drawSources();
    $('#close-stats').classList.add('flash'); setTimeout(() => $('#close-stats').classList.remove('flash'), 900);
    btn.disabled = false; btn.textContent = 'Run again';
  });

  // payroll view (sample data)
  const payState = { decisions: store.get('payDecisions', {}) };
  const PAY = E.runPayroll({ hris: TM.hris, payroll: TM.payroll, equity: TM.equity, period: SAMPLE_PERIOD });
  // one renderer for the sample desk and for "Your data", so both behave the same
  function payrollTable(tbody, exceptions, decisions, onDecide) {
    tbody.innerHTML = exceptions.length ? exceptions.map((x) => {
      const key = x.id + ':' + x.rule, d = decisions[key];
      return `<tr><td>${esc(x.id)}</td><td>${x.rule}</td><td>${esc(x.ev)}</td><td>${sevPill(x.sev)}</td><td>${d ? `<span class="pill ok">${esc(d.action)}</span>` : `<button type="button" class="b-sec" data-k="${esc(key)}" data-a="Held">Hold</button> <button type="button" class="b-sec" data-k="${esc(key)}" data-a="Cleared">Clear</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="d-empty">No exceptions. Every row passed every rule.</td></tr>';
    $$('[data-k]', tbody).forEach((b) => b.addEventListener('click', () => onDecide(b.dataset.k, b.dataset.a)));
  }
  const payrollRows = (exceptions, decisions) => exceptions.map((x) => {
    const d = decisions[x.id + ':' + x.rule];
    return { employee_id: x.id, rule: x.rule, evidence: x.ev, severity: x.sev, blocks_release: x.blocks ? 'yes' : 'no', decision: d ? d.action : '', decided_at: d ? d.at : '' };
  });
  const PAYROLL_COLUMNS = ['employee_id', 'rule', 'evidence', 'severity', 'blocks_release', 'decision', 'decided_at'];
  function renderPayroll() {
    const gross = TM.payroll.reduce((a, p) => a + p.gross, 0);
    const openBlock = PAY.filter((x) => x.blocks && !payState.decisions[x.id + ':' + x.rule]).length;
    $('#pay-stats').innerHTML =
      stat('Payroll records', TM.payroll.length, `${TM.hris.length} people in HRIS`) +
      stat('Gross this period', money(gross), 'CAD, before any hold') +
      stat('Exceptions', PAY.length, `${Object.keys(payState.decisions).length} decided`) +
      stat('Release blockers', openBlock, openBlock ? 'payroll cannot release' : 'ready for a second approver', openBlock > 0);
    $('#pay-release').disabled = openBlock > 0;
    $('#pay-q-sub').textContent = 'High severity blocks release until a person decides';
    payrollTable($('#pay-q tbody'), PAY, payState.decisions, (key, action) => {
      payState.decisions[key] = { action, at: iso() };
      store.set('payDecisions', payState.decisions);
      log('You', `${action} ${key.split(':')[0]}`, key.split(':')[1]);
      renderPayroll();
    });
  }
  function drawPayrollCharts() {
    const rules = [...new Set(PAY.map((x) => x.rule))];
    Charts.barList($('#ch-rules'), rules.map((r) => ({ label: r, value: PAY.filter((x) => x.rule === r).length })), { format: Charts.fmt.int });
    const deptOf = Object.fromEntries(TM.hris.map((h) => [h.id, h.dept]));
    const totals = {};
    TM.payroll.forEach((p) => { const d = deptOf[p.id] || '—'; totals[d] = (totals[d] || 0) + p.gross; });
    Charts.barList($('#ch-dept'), Object.entries(totals).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), { format: Charts.fmt.money('CAD', 0) });
  }
  $('#pay-release').addEventListener('click', () => { log('You', 'Released payroll 1–15 Oct', 'Awaiting second approver (four-eyes)'); $('#pay-release').disabled = true; $('#pay-release').textContent = 'Sent to second approver'; });

  // cash view (sample data)
  const bankTable = (tbody, rec) => {
    tbody.innerHTML = rec.rows.map((r) => `<tr><td class="num">${esc(r.date)}</td><td>${esc(r.desc)}</td><td class="num">${money(r.amt)}</td><td>${esc(r.gl)}</td><td class="${r.ok ? 'ok' : 'warn'}">${esc(r.res)}</td></tr>`).join('');
  };
  const bankStats = (rec, win, label) =>
    stat('Statement lines', rec.rows.length, label) +
    stat('Matched', `${rec.matched} of ${rec.rows.length}`, `window ±${win} days`) +
    stat('Bank movement', money(rec.bankTotal), `ledger movement ${money(rec.glTotal)}`) +
    stat('Unexplained', money(rec.unexplained), `${rec.rows.length - rec.matched} lines to a person`, rec.rows.length - rec.matched > 0);
  const bankRows = (rec) => rec.rows.map((r) => ({ date: r.date, description: r.desc, amount: r.amt.toFixed(2), ledger_match: r.gl, result: r.res }));
  const BANK_COLUMNS = ['date', 'description', 'amount', 'ledger_match', 'result'];
  let cashRec = null;
  function renderCash() {
    const win = +$('#cash-window').value;
    cashRec = E.matchBank(TM.bank, TM.gl, win);
    $('#cash-stats').innerHTML = bankStats(cashRec, win, 'October to date');
    bankTable($('#cash-t tbody'), cashRec);
  }
  $('#cash-window').addEventListener('change', () => { renderCash(); log('You', 'Changed match window', `±${$('#cash-window').value} days`); });

  // eval view
  function renderEval() {
    const total = TM.evalCats.reduce((a, c) => a + c[1], 0), pass = TM.evalCats.reduce((a, c) => a + c[2], 0);
    const v = TM.versions[2];
    $('#eval-stats').innerHTML =
      stat('Engine cases', total, `${pass} pass on ${v.v}`) +
      stat('Exception recall', (v.r * 100).toFixed(1) + '%', 'was 92.3% before the fixes') +
      stat('Precision', (v.p * 100).toFixed(0) + '%', 'no false alerts on boundary cases') +
      stat('Model × prompt runs', '—', 'not run · needs an API budget');
    const suites = TM.suites;
    $('#suite-t tbody').innerHTML = suites.map((s, i) => `<tr class="click${i === 0 ? ' on' : ''}" data-i="${i}" tabindex="0"><td><b>${esc(s.name)}</b></td><td>${esc(s.task)}</td><td class="num">${s.cases}</td><td>${esc(s.metric)}<span class="sub">${esc(s.baseline)}</span></td><td><span class="pill ${s.status === 'Scored' ? 'ok' : s.status === 'Partly scored' ? 'warn' : ''}">${s.status}</span></td></tr>`).join('');
    const show = (i) => {
      $$('#suite-t tr.click').forEach((tr) => tr.classList.toggle('on', +tr.dataset.i === i));
      const s = suites[i].sample;
      $('#suite-sample').innerHTML = `<div><p class="sl">Sample input · ${esc(suites[i].name)}</p><p>${esc(s.input)}</p></div><div><p class="sl">What a passing answer does</p><p>${esc(s.expect)}</p></div>`;
    };
    $$('#suite-t tr.click').forEach((tr) => {
      tr.addEventListener('click', () => show(+tr.dataset.i));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(+tr.dataset.i); } });
    });
    show(0);
  }

  // ---------- real data: Bank of Canada FX revaluation ----------
  const REAL = window.REAL;
  const fxReval = (() => {
    if (!REAL) return null;
    const { sep, last, series } = REAL.fx;
    const amt = E.fxRevaluation(TM.eurBalance, sep.eur, last.eur);
    const je = TM.journals.find((j) => j.id === 'JE-1037'); je.dr = je.cr = Math.abs(amt);
    return { sep, last, series, amt };
  })();
  function renderFx() {
    if (!fxReval) return;
    const { sep, last, amt } = fxReval;
    $('#fx-sub').textContent = `${fxReval.series.length} business days · Valet API · pulled ${REAL.pulled}`;
    $('#fx-card').innerHTML = `<div class="c-head"><p class="c-t">Revaluation, EUR account</p><p class="c-s">Drafts JE-1037</p></div>
      <dl class="rv"><div><dt>Balance</dt><dd>EUR ${money(TM.eurBalance)}</dd></div>
      <div><dt>Rate at September close</dt><dd>${sep.eur.toFixed(4)}<span class="sub">${sep.d} · 30 Sep was a Bank of Canada holiday</span></dd></div>
      <div><dt>Latest rate</dt><dd>${last.eur.toFixed(4)}<span class="sub">${last.d}</span></dd></div>
      <div><dt>CAD value, then and now</dt><dd>${money(TM.eurBalance * sep.eur)}<span class="sub">now ${money(TM.eurBalance * last.eur)}</span></dd></div>
      <div class="rv-t"><dt>${amt < 0 ? 'Unrealised loss' : 'Unrealised gain'}</dt><dd>CAD ${money(Math.abs(amt))}</dd></div></dl>
      <p class="c-s">Dr ${amt < 0 ? '7810 FX loss' : '1015 Cash EUR'} / Cr ${amt < 0 ? '1015 Cash EUR' : '7810 FX gain'}, balanced by rule.</p>`;
  }
  function drawFx() {
    if (!fxReval) return;
    const s = fxReval.series, iSep = s.findIndex((o) => o.d === fxReval.sep.d);
    Charts.line($('#ch-fx'), { labels: s.map((o) => o.d.slice(5).replace('-', '/')), series: [{ name: 'EUR/CAD', values: s.map((o) => o.eur) }], format: Charts.fmt.dec(4), endLabel: true, annotations: iSep >= 0 ? [{ at: iSep, label: 'September close rate', short: 'Sep close' }] : [] });
  }

  // ---------- real data: controls on SEC filings ----------
  const secState = { sel: 0 };
  function renderSec() {
    if (!REAL) return;
    const th = +$('#sec-th').value, cos = REAL.companies;
    const rows = cos.map((c) => ({ c, k: E.secChecks(c, th) }));
    const tests = rows.flatMap((r) => [r.k.id, r.k.roll, r.k.flux]);
    const ran = tests.filter((t) => t.ok !== null).length, held = tests.filter((t) => t.ok === true).length;
    $('#sec-sub').textContent = `SEC EDGAR XBRL company facts · ${cos.length} companies · pulled ${REAL.pulled}`;
    $('#sec-stats').innerHTML =
      stat('Filings checked', cos.length, 'latest annual report each') +
      stat('Checks that held', `${held} of ${ran}`, `${tests.length - ran} could not run`) +
      stat('Untestable', tests.length - ran, 'a fact the filer did not tag', tests.length - ran > 0) +
      stat('Flux over threshold', rows.filter((r) => r.k.flux.ok === false).length, `revenue change above ${Math.round(th * 100)}%`, rows.some((r) => r.k.flux.ok === false));
    const cell = (t) => t.ok === null ? `<span class="warn">${esc(t.txt)}</span>` : t.ok ? `<span class="ok">${esc(t.txt)}</span>` : `<span class="pill warn">${esc(t.txt)}</span>`;
    $('#sec-t tbody').innerHTML = rows.map(({ c, k }, i) => `<tr class="click${i === secState.sel ? ' on' : ''}" data-i="${i}" tabindex="0"><td><b>${esc(c.name)}</b><span class="sub">CIK ${c.cik}</span></td><td class="num">${c.end}</td><td>${cell(k.id)}</td><td>${cell(k.roll)}</td><td class="num">${E.big(c.revenue)}</td><td>${cell(k.flux)}</td></tr>`).join('');
    const show = (i) => {
      secState.sel = i;
      $$('#sec-t tr.click').forEach((tr) => tr.classList.toggle('on', +tr.dataset.i === i));
      const { c, k } = rows[i];
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=10-K`;
      const next = k.flux.ok === false
        ? 'Revenue moved more than the threshold. The explanation is taken from the filing itself (MD&A), quoted with its page, never written from memory.'
        : k.id.ok === null
          ? 'The identity cannot be tested from tags alone. Liabilities are derived from the balance-sheet total, and the figure is recorded as derived.'
          : 'Nothing to explain. The identity, the cash roll-forward and the revenue change all hold.';
      $('#sec-ev').innerHTML = `<div><p class="sl">Evidence · ${esc(c.name)} 10-K, fiscal ${c.fy}, filed ${c.filed}</p>
        <p>Assets = L + E: ${esc(k.id.note)}</p><p>Cash: ${esc(k.roll.note)}</p><p>Revenue (${esc(c.revTag)}): ${E.big(c.revenuePrior)} → ${E.big(c.revenue)}</p>
        <p class="sl sl-gap">Accession ${c.accn} · <a href="${url}" target="_blank" rel="noopener">open on EDGAR</a></p></div>
        <div><p class="sl">What a reviewer does next</p><p>${esc(next)}</p></div>`;
    };
    $$('#sec-t tr.click').forEach((tr) => {
      tr.addEventListener('click', () => show(+tr.dataset.i));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(+tr.dataset.i); } });
    });
    show(Math.min(secState.sel, rows.length - 1));
  }
  $('#sec-th').addEventListener('change', () => { renderSec(); log('You', 'Changed flux threshold', `${Math.round(+$('#sec-th').value * 100)}% on public filings`); });

  // ---------- real data: FinQA grader ----------
  function renderFinqa() {
    if (!REAL) return;
    const F = REAL.finqa;
    $('#fq-sub').textContent = `FinQA test set · ${F.total.toLocaleString('en')} questions on real filings · grader reproduces ${F.ok.toLocaleString('en')} of ${(F.total - F.table).toLocaleString('en')} gold answers · ${F.table} need table operations, not supported yet`;
    $('#fq-pick').innerHTML = F.sample.map((x, i) => `<button type="button" role="tab" class="b-sec${i ? '' : ' sel'}" aria-selected="${!i}" data-i="${i}">${esc(x.id.split('/')[0])} ${x.id.split('/')[1]}</button>`).join('');
    const show = (i) => {
      $$('#fq-pick button').forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('sel', on); b.setAttribute('aria-selected', String(on)); });
      const x = F.sample[i];
      const note = /debt to equity/.test(x.q) ? '<p class="notice">Label worth questioning: the evidence is an 82/18 asset allocation, not debt and equity. Benchmarks need auditing too.</p>' : '';
      $('#fq-body').innerHTML = `<p class="fq-q">${esc(x.q)}</p>
        <p class="sl">From the filing (${esc(x.id)})</p><p class="fq-ev">${esc(x.evidence[0] || '')}</p>${note}
        <form class="fq-try" id="fq-form"><label for="fq-in">Your answer, or a program such as divide(121.4, 4187.8)</label>
        <div class="fq-row"><input id="fq-in" autocomplete="off"><button class="b-pri" type="submit">Grade</button><button class="b-sec" type="button" id="fq-gold">Show gold</button></div></form>
        <p class="fq-out" id="fq-out" aria-live="polite"></p>`;
      $('#fq-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = $('#fq-in').value.trim(); if (!v) return;
        const g = E.gradeAnswer(v, x.ans);
        $('#fq-out').innerHTML = !g.readable ? '<span class="warn">Could not read that. Use a number or a FinQA program.</span>' : `<span class="${g.pass ? 'ok' : 'warn'}">${g.pass ? 'Correct' : 'Not correct'}</span> · yours ${typeof g.value === 'number' ? +g.value.toFixed(5) : g.value}, gold ${x.ans}, tolerance 0.5%`;
        log('You', `Graded FinQA ${x.id}`, g.pass ? 'correct' : 'not correct');
      });
      $('#fq-gold').addEventListener('click', () => { $('#fq-in').value = x.prog; $('#fq-form').requestSubmit(); });
    };
    $$('#fq-pick button').forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
    show(0);
  }

  // ---------- your data: the same rules on the visitor's own files ----------
  const MAX_BYTES = 2 * 1024 * 1024;
  const mine = Object.assign({ files: {}, period: { ...SAMPLE_PERIOD }, window: 3, payDecisions: {}, ranPay: false, ranBank: false }, store.get('mine', {}));
  const saveMine = () => store.set('mine', mine);
  let myPay = null, myBank = null;
  const SAMPLE_TABLES = { hris: TM.hris, payroll: TM.payroll, equity: TM.equity, bank: TM.bank, gl: TM.gl };

  function fileState(kind) {
    const el = $(`[data-state="${kind}"]`); if (!el) return;
    const f = mine.files[kind];
    if (!f) { el.textContent = ''; el.className = 'up-state'; return; }
    const r = E.loadTable(kind, f.text);
    el.className = 'up-state ' + (r.errors.length ? 'warn' : 'ok');
    el.textContent = r.errors.length ? `${f.name} · ${r.errors.length} problem${r.errors.length > 1 ? 's' : ''}` : `${f.name} · ${r.records.length} rows`;
  }
  function refreshMineChrome() {
    ['hris', 'payroll', 'equity', 'bank', 'gl'].forEach(fileState);
    const n = Object.keys(mine.files).length;
    $('#mine-count').hidden = !n; $('#mine-count').textContent = n;
    $('#my-clear').hidden = !n && !mine.ranPay && !mine.ranBank;
    $('#up-start').value = mine.period.start; $('#up-end').value = mine.period.end;
    $('#up-window').value = String(mine.window);
  }
  function showErrors(listId, errors) {
    $(listId).innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
  }
  function loadKinds(kinds, optional = []) {
    const errors = [], data = {};
    for (const kind of kinds.concat(optional)) {
      const f = mine.files[kind];
      if (!f) { if (!optional.includes(kind)) errors.push(`Add the ${E.TABLES[kind].label.toLowerCase()}.`); continue; }
      const r = E.loadTable(kind, f.text);
      r.errors.forEach((e) => errors.push(`${E.TABLES[kind].label}: ${e}`));
      data[kind] = r.records;
    }
    return { errors, data };
  }

  function runMyPayroll(quiet) {
    const { start, end } = mine.period;
    const errs = [];
    if (!E.isDate(start) || !E.isDate(end)) errs.push('Set the pay period start and end.');
    else if (end < start) errs.push('The pay period ends before it starts.');
    const { errors, data } = loadKinds(['hris', 'payroll'], ['equity']);
    errs.push(...errors);
    showErrors('#up-err-pay', errs);
    if (errs.length) { $('#my-pay').hidden = true; return; }
    const exceptions = E.runPayroll({ hris: data.hris, payroll: data.payroll, equity: data.equity || [], period: mine.period });
    const fp = E.fingerprint([mine.files.hris.text, mine.files.payroll.text, mine.files.equity?.text || '', start, end].join('|'));
    myPay = { exceptions, fp, data };
    mine.ranPay = true; saveMine();
    renderMyPayroll();
    if (!quiet) log('You', 'Ran payroll rules on your files', `${data.payroll.length} payroll rows · ${exceptions.length} exceptions · ${E.periodLabel(mine.period)}`);
  }
  function renderMyPayroll() {
    if (!myPay) return;
    const { exceptions, fp, data } = myPay;
    const decisions = mine.payDecisions[fp] || {};
    const openBlock = exceptions.filter((x) => x.blocks && !decisions[x.id + ':' + x.rule]).length;
    const ccys = [...new Set(data.payroll.map((p) => p.ccy))];
    $('#my-pay').hidden = false;
    $('#my-pay-stats').innerHTML =
      stat('Payroll rows', data.payroll.length, `${data.hris.length} people in your HRIS file`) +
      stat('Gross this period', money(data.payroll.reduce((a, p) => a + p.gross, 0)), ccys.length === 1 ? ccys[0] : `${ccys.length} currencies`) +
      stat('Exceptions', exceptions.length, `${Object.keys(decisions).length} decided · ${E.periodLabel(mine.period)}`) +
      stat('Release blockers', openBlock, openBlock ? 'high severity, needs a decision' : 'none open', openBlock > 0);
    $('#my-pay-sub').textContent = 'Same seven rules as the sample';
    payrollTable($('#my-pay-q tbody'), exceptions, decisions, (key, action) => {
      mine.payDecisions[fp] = { ...(mine.payDecisions[fp] || {}), [key]: { action, at: iso() } };
      saveMine();
      log('You', `${action} ${key.split(':')[0]} (your data)`, key.split(':')[1]);
      renderMyPayroll();
    });
  }
  function runMyBank(quiet) {
    const { errors, data } = loadKinds(['bank', 'gl']);
    showErrors('#up-err-bank', errors);
    if (errors.length) { $('#my-bank').hidden = true; return; }
    myBank = E.matchBank(data.bank, data.gl, mine.window);
    mine.ranBank = true; saveMine();
    $('#my-bank').hidden = false;
    $('#my-bank-stats').innerHTML = bankStats(myBank, mine.window, 'from your statement');
    bankTable($('#my-bank-t tbody'), myBank);
    if (!quiet) log('You', 'Matched your bank statement', `${myBank.matched} of ${myBank.rows.length} matched · ±${mine.window} days`);
  }

  async function acceptFile(kind, file) {
    const errList = ['bank', 'gl'].includes(kind) ? '#up-err-bank' : '#up-err-pay';
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { showErrors(errList, [`${file.name} is not a CSV file.`]); return; }
    if (file.size > MAX_BYTES) { showErrors(errList, [`${file.name} is larger than 2 MB.`]); return; }
    mine.files[kind] = { name: file.name, text: await file.text() };
    saveMine(); refreshMineChrome();
  }
  $$('input[type="file"][data-kind]').forEach((input) => input.addEventListener('change', async () => {
    if (input.files[0]) await acceptFile(input.dataset.kind, input.files[0]);
    input.value = '';
  }));
  // each file box also takes a dropped file
  $$('.up-f[data-kind]').forEach((box) => {
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) acceptFile(box.dataset.kind, f); });
  });
  $$('[data-tpl]').forEach((b) => b.addEventListener('click', () => download(`tickmark-template-${b.dataset.tpl}.csv`, E.tableToCsv(b.dataset.tpl, SAMPLE_TABLES[b.dataset.tpl]))));
  $('#up-start').addEventListener('change', () => { mine.period.start = $('#up-start').value; saveMine(); });
  $('#up-end').addEventListener('change', () => { mine.period.end = $('#up-end').value; saveMine(); });
  $('#up-window').addEventListener('change', () => { mine.window = +$('#up-window').value; saveMine(); if (myBank) runMyBank(true); });
  $('#up-run-pay').addEventListener('click', () => runMyPayroll(false));
  $('#up-run-bank').addEventListener('click', () => runMyBank(false));
  $('#my-clear').addEventListener('click', () => {
    Object.assign(mine, { files: {}, payDecisions: {}, ranPay: false, ranBank: false });
    saveMine(); myPay = myBank = null;
    $('#my-pay').hidden = $('#my-bank').hidden = true;
    showErrors('#up-err-pay', []); showErrors('#up-err-bank', []);
    refreshMineChrome();
    log('You', 'Removed your data', 'Files and decisions deleted from this browser');
  });
  $$('[data-my]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-my]').forEach((t) => { const on = t === b; t.classList.toggle('sel', on); t.setAttribute('aria-selected', String(on)); });
    $$('[data-my-pane]').forEach((p) => { p.hidden = p.dataset.myPane !== b.dataset.my; });
  }));

  // ---------- exports ----------
  const exporters = {
    close: () => ['close-exceptions', E.toCsv(['id', 'source', 'rule', 'title', 'amount', 'severity', 'blocks_signoff', 'decision', 'reason', 'decided_at'],
      TM.close.map((x) => { const d = closeState.decisions[x.id] || {}; return { id: x.id, source: x.source, rule: x.rule, title: x.title, amount: x.amount ? x.amount.toFixed(2) : '', severity: x.sev, blocks_signoff: x.blocks ? 'yes' : 'no', decision: d.action || '', reason: d.reason || '', decided_at: d.at || '' }; }))],
    journals: () => ['journal-drafts', E.toCsv(['journal', 'memo', 'debit', 'credit', 'balanced'],
      TM.journals.map((j) => ({ journal: j.id, memo: j.memo, debit: j.dr.toFixed(2), credit: j.cr.toFixed(2), balanced: E.checkJournal({ debits: [j.dr], credits: [j.cr] }).ok.balance ? 'yes' : 'no' })))],
    payroll: () => ['payroll-exceptions', E.toCsv(PAYROLL_COLUMNS, payrollRows(PAY, payState.decisions))],
    cash: () => ['bank-reconciliation', E.toCsv(BANK_COLUMNS, bankRows(cashRec))],
    'my-payroll': () => myPay && ['your-payroll-exceptions', E.toCsv(PAYROLL_COLUMNS, payrollRows(myPay.exceptions, mine.payDecisions[myPay.fp] || {}))],
    'my-bank': () => myBank && ['your-bank-reconciliation', E.toCsv(BANK_COLUMNS, bankRows(myBank))],
    audit: () => ['audit-log', E.toCsv(['at', 'actor', 'event', 'detail'], audit)],
  };
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const out = exporters[b.dataset.export]?.();
    if (!out) return;
    download(`tickmark-${out[0]}-${today()}.csv`, out[1]);
  }));

  // reset asks twice, on the button itself
  (() => {
    const b = $('#reset-session'); let armed = null;
    b.addEventListener('click', () => {
      if (!armed) { b.textContent = 'Click again to reset'; armed = setTimeout(() => { b.textContent = 'Reset session'; armed = null; }, 4000); return; }
      clearTimeout(armed); store.clear(); location.reload();
    });
  })();

  // tabs
  function setView(v) {
    $$('.nav-i').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    $$('.view').forEach((el) => { el.hidden = el.dataset.view !== v; });
    draw(v);
  }
  $$('.nav-i').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
    b.addEventListener('keydown', (e) => {
      const tabs = $$('.nav-i'), i = tabs.indexOf(b);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); tabs[(i + 1) % tabs.length].focus(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); tabs[(i - 1 + tabs.length) % tabs.length].focus(); }
    });
  });
  $$('[data-open-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.openView); $('#workbench').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); }));

  renderCloseStats(); renderCloseQueue(); renderJournals(); renderPayroll(); renderCash(); renderFx(); renderSec(); renderEval(); renderFinqa(); renderAudit();
  refreshMineChrome();
  if (mine.ranPay) runMyPayroll(true);
  if (mine.ranBank) runMyBank(true);
  // charts measure their container, so draw once fonts are in
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => draw('close'));

  } // end workbench

  // ---------- receipt slip: rows that truly sum ----------
  (() => {
    const el = $('#slip-rows'); if (!el) return;
    const groups = [
      ['Errors the engine must catch', TM.evalCats.slice(0, 12)],
      ['Cases that must stay silent', TM.evalCats.slice(12, 13)],
      ['Written to break it', TM.evalCats.slice(13)],
    ];
    const row = (l, v, cls = '') => `<div class="row ${cls}"><span>${esc(l)}</span><span class="lead" aria-hidden="true"></span><span>${v}</span></div>`;
    let html = '';
    groups.forEach(([g, cats]) => {
      html += `<p class="grp">${g}</p>`;
      cats.forEach(([l, n, p]) => { html += row(l, p < n ? `${n} · ${n - p} miss` : n, p < n ? 'miss' : ''); });
    });
    const total = TM.evalCats.reduce((a, c) => a + c[1], 0);
    html += row('Total cases', total, 'tot');
    el.innerHTML = html;
  })();

  // ---------- ledger previews ----------
  (() => {
    const list = $('#lg-list'); if (!list) return;
    const wrap = $('.lg-preview');
    const show = (btn) => {
      $$('.prev').forEach((p) => p.classList.remove('on'));
      $$('button', list).forEach((b) => b.classList.toggle('on', b === btn));
      if (!btn) return;
      const p = $('#' + btn.dataset.prev);
      p.style.top = (btn.getBoundingClientRect().top - wrap.getBoundingClientRect().top - 40) + 'px';
      p.classList.add('on');
    };
    $$('button', list).forEach((b) => { b.addEventListener('mouseenter', () => show(b)); b.addEventListener('focus', () => show(b)); b.addEventListener('click', () => show(b)); });
    list.addEventListener('mouseleave', () => show(null));
  })();

  // ---------- close calendar ----------
  (() => {
    const days = [
      ['BD−1', 'Fri 30', [
        ['09:00', 'Lock card feeds for October', 'Ramp export frozen · control CTL-01', ['AP'], 'AP lead'],
        ['11:00', 'Payroll register received', 'Fingerprinted on arrival · CTL-02', ['PY'], 'Payroll'],
        ['15:00', 'Cut-off reminder to budget owners', 'Late invoices need a PO number', ['GL'], 'GL accountant'],
      ]],
      ['BD1', 'Mon 2', [
        ['09:00', 'Ingest the four source files', 'Contracts checked, 63 rows · CTL-03', ['TM'], 'Tickmark'],
        ['10:00', 'Bank reconciliation, operating', 'Match on amount, ±3 days · CTL-04', ['TM', 'GL'], 'Tickmark, GL'],
        ['14:00', 'Payroll control cycle', 'Seven rules, blockers hold release · CTL-05', ['TM', 'PY'], 'Tickmark, Payroll'],
        ['16:30', 'Card receipts chased', 'Over-limit spend without receipt', ['AP'], 'AP lead'],
      ]],
      ['BD2', 'Tue 3', [
        ['09:00', 'Accruals drafted', 'JE-1031 to JE-1039, balanced by rule', ['TM'], 'Tickmark'],
        ['11:00', 'Deferred revenue tie-out', 'GL 2400 against the warehouse · CTL-07', ['GL'], 'GL accountant'],
        ['15:00', 'Exception review, payroll', 'One decision at a time, reasons logged', ['PY', 'CT'], 'Payroll, Controller'],
      ]],
      ['BD3', 'Wed 4', [
        ['09:00', 'Flux review over 10%', 'Drafts may only quote trial-balance figures', ['TM', 'GL'], 'Tickmark, GL'],
        ['11:00', 'Cut-off breaks resolved', 'JE-0977 reversed and reposted', ['GL'], 'GL accountant'],
        ['14:00', 'Journal approval', 'Approver must not be the preparer · CTL-09', ['CT'], 'Controller'],
        ['16:00', 'Close blockers stand-up', 'Anything high-severity still open', ['CT', 'GL', 'PY'], 'Controller, GL, Payroll'],
      ]],
      ['BD4', 'Thu 5', [
        ['10:00', 'Trial balance review', 'Every account with a variance note', ['CT'], 'Controller'],
        ['14:00', 'Management pack drafted', 'Figures pulled, not retyped', ['FP'], 'FP&A'],
      ]],
      ['BD5', 'Fri 6', [
        ['10:00', 'Controller sign-off', 'Only with zero open blockers', ['CT'], 'Controller'],
        ['11:00', 'Period locked', 'Audit log exported with the pack', ['TM'], 'Tickmark'],
      ]],
    ];
    const tabs = $('#days'), bands = $('#bands');
    if (!tabs) return;
    tabs.innerHTML = days.map(([d, date], i) => `<button role="tab" class="day" aria-selected="${i === 3}" data-i="${i}"><b>${d}</b><span>${date}</span></button>`).join('');
    const show = (i) => {
      $$('.day', tabs).forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === i)));
      bands.innerHTML = days[i][2].map(([t, ti, no, roles, who], k) => `<div class="band in" style="--k:${k}"><span class="t">${t}</span><div><p class="ti">${esc(ti)}</p><p class="no">${esc(no)}</p></div><span class="who"><span class="wtxt">${esc(who)}</span><span class="roles">${roles.map((r) => `<span class="r${r === 'TM' ? ' a' : ''}" title="${r}">${r}</span>`).join('')}</span></span></div>`).join('');
    };
    $$('.day', tabs).forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
    show(3);
  })();

  // ---------- contact: the form posts to FormSubmit, which emails Martin ----------
  // the address is read once, because the help line under the form is rewritten with each status
  const MAILTO = $('#ct-mail')?.getAttribute('href').replace('mailto:', '');
  $('#ct-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, help = $('#ct-help'), send = $('#ct-send');
    const to = MAILTO;
    const email = $('#ct-email').value.trim(), message = $('#ct-msg').value.trim();
    const fail = (field, text) => { field.setAttribute('aria-invalid', 'true'); field.focus(); help.innerHTML = `<span class="warn">${esc(text)}</span>`; };
    $$('[aria-invalid]', form).forEach((f) => f.removeAttribute('aria-invalid'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail($('#ct-email'), 'Add an email address Martin can reply to.');
    if (message.length < 10) return fail($('#ct-msg'), 'Add a line or two about the role.');
    if (form.elements._honey.value) return; // a bot filled the hidden field
    send.disabled = true; send.textContent = 'Sending…';
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${to}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, message, _replyto: email, _subject: 'Tickmark: a message about a role', _template: 'table', _captcha: 'false' }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || String(data.success) === 'false') throw new Error(data.message || 'send failed');
      form.reset();
      send.textContent = 'Sent';
      help.innerHTML = `<span class="ok">Sent. Martin will reply to ${esc(email)}.</span>`;
      setTimeout(() => { send.disabled = false; send.textContent = 'Send to Martin'; }, 4000);
    } catch {
      send.disabled = false; send.textContent = 'Send to Martin';
      const body = encodeURIComponent(`${message}\n\nReply to: ${email}`);
      help.innerHTML = `<span class="warn">It didn't send.</span> <a href="mailto:${to}?subject=${encodeURIComponent('About a role: Tickmark')}&amp;body=${body}">Open it in your email app</a> instead.`;
    }
  });

  // ---------- the big total counts up once ----------
  (() => {
    const el = $('.total'); if (!el || reduced || !('IntersectionObserver' in window)) return;
    const target = +el.dataset.count;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
  })();
})();
