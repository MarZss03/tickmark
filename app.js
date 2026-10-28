// Tickmark: the page's live parts. Deterministic rules run here on the synthetic data in data.js.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (v) => new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const parse = (s) => { const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; };
  const now = () => new Date().toTimeString().slice(0, 8);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- audit log, shared by every control ----------
  const audit = [];
  function log(actor, event, detail) {
    audit.unshift({ t: now(), actor, event, detail });
    window.tmToast?.(event, detail);
    if (!$('#audit-t')) return;
    $('#audit-count').textContent = audit.length;
    $('#audit-empty').hidden = true;
    $('#audit-t tbody').innerHTML = audit.map((a) => `<tr><td class="num">${a.t}</td><td>${esc(a.actor)}</td><td>${esc(a.event)}</td><td>${esc(a.detail)}</td></tr>`).join('');
  }

  // ---------- hero: the journal entry control ----------
  (() => {
    const form = $('#je'); if (!form) return;
    const d1 = $('#je-d1'), d2 = $('#je-d2'), c1 = $('#je-c1'), self = $('#je-self'), rel = $('#je-release');
    const REGISTER = 51941.13; // contractor payroll per the register
    let released = false;
    function check() {
      const dr = parse(d1.value) + parse(d2.value), cr = parse(c1.value);
      const ok = {
        balance: Number.isFinite(dr) && Math.abs(dr - cr) < 0.005,
        period: true,
        evidence: Math.abs(cr - REGISTER) < 0.005,
        four: !self.checked,
      };
      $('#je-dr').textContent = Number.isFinite(dr) ? money(dr) : '—';
      $('#je-cr').textContent = Number.isFinite(cr) ? money(cr) : '—';
      const set = (k, pass, note) => { const li = $(`[data-check="${k}"]`, form); li.classList.toggle('fail', !pass); $('b', li).textContent = note; };
      set('balance', ok.balance, ok.balance ? 'balanced' : `off by ${money(Math.abs(dr - cr))}`);
      set('period', true, 'open');
      set('evidence', ok.evidence, ok.evidence ? 'ties' : `register ${money(REGISTER)}`);
      set('four', ok.four, ok.four ? 'separate' : 'same person');
      const all = Object.values(ok).every(Boolean);
      const st = $('#je-state');
      st.textContent = released ? 'Released' : all ? 'Ready' : 'Blocked';
      st.className = 'pill ' + (released || all ? 'ok' : 'neg');
      rel.disabled = !all || released;
      if (!released) $('#je-log').textContent = all ? 'Every check holds. A person can release it.' : 'Blocked until every check holds. Nothing is posted.';
      return all;
    }
    [d1, d2, c1].forEach((i) => {
      i.addEventListener('input', () => { if (released) { released = false; form.classList.remove('released'); } check(); });
      i.addEventListener('blur', () => { const n = parse(i.value); if (Number.isFinite(n)) i.value = money(n); check(); });
    });
    self.addEventListener('change', check);
    rel.addEventListener('click', () => {
      if (!check()) return;
      released = true; form.classList.add('released');
      $('#je-log').textContent = `Released by you at ${now()}. Logged with all four checks.`;
      log('You', 'Released JE-1031', `Dr ${$('#je-dr').textContent} = Cr ${$('#je-cr').textContent}`);
      check();
    });
    check();
  })();

  // ---------- showcase: the lit panel ----------
  (() => {
    const row = $('#show-row'); if (!row) return;
    const panels = $$('.panel', row);
    let current = -1;
    function light() {
      const mid = row.getBoundingClientRect().left + row.clientWidth / 2;
      let best = 0, dist = Infinity;
      panels.forEach((p, i) => { const r = p.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < dist) { dist = d; best = i; } });
      if (best === current) return;
      current = best;
      panels.forEach((p, i) => { p.classList.toggle('lit', i === best); p.inert = i !== best; });
      $('#show-name').textContent = panels[best].dataset.name;
      $('#show-say').textContent = panels[best].dataset.say;
    }
    const go = (d) => { const i = Math.max(0, Math.min(panels.length - 1, current + d)); panels[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'center', block: 'nearest' }); };
    $('#show-prev').addEventListener('click', () => go(-1));
    $('#show-next').addEventListener('click', () => go(1));
    row.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
    row.addEventListener('scroll', () => requestAnimationFrame(light), { passive: true });
    // drag with a mouse
    let down = null;
    row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, s: row.scrollLeft }; row.style.scrollSnapType = 'none'; });
    addEventListener('pointermove', (e) => { if (down) row.scrollLeft = down.s - (e.clientX - down.x); });
    addEventListener('pointerup', () => { if (!down) return; down = null; row.style.scrollSnapType = ''; go(0); });
    addEventListener('resize', () => { current = -1; light(); });
    light();
  })();

  // ---------- workbench ----------
  const TM = window.TM;
  if (document.getElementById('app')) {
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
  const closeState = { ran: false, decisions: {}, sel: null };
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
      ${d ? `<p><span class="pill ok">${esc(d.action)}</span> by you at ${d.t}${d.reason ? ` · “${esc(d.reason)}”` : ''}</p>` : `
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
    closeState.decisions[x.id] = { action, reason, t: now() };
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
    renderCloseStats(); renderCloseQueue(); drawSources();
    $('#close-stats').classList.add('flash'); setTimeout(() => $('#close-stats').classList.remove('flash'), 900);
    btn.disabled = false; btn.textContent = 'Run again';
  });

  // payroll view: the rule engine
  const payState = { decisions: {} };
  function runPayroll() {
    const H = Object.fromEntries(TM.hris.map((h) => [h.id.trim().toUpperCase(), h]));
    const out = [];
    const seen = {};
    const START = '2026-10-01', END = '2026-10-15';
    TM.payroll.forEach((p, idx) => {
      const id = p.id.trim().toUpperCase(), h = H[id];
      if (!h) { out.push({ id, rule: 'MISSING_EMPLOYEE', sev: 'high', blocks: true, ev: 'Not in HRIS' }); return; }
      if (seen[id] !== undefined) out.push({ id, rule: 'DUPLICATE_PAYMENT', sev: 'high', blocks: true, ev: `Two rows for 1–15 Oct · ${money(p.gross)} each` });
      seen[id] = idx;
      if (['terminated', 'inactive', 'left', 'separated'].includes(h.status) && h.term && h.term < START) out.push({ id, rule: 'INACTIVE_PAID', sev: 'high', blocks: true, ev: `Left ${h.term} · paid ${money(p.gross)}` });
      if (p.prior > 0 && Math.abs(p.gross - p.prior) / p.prior > 0.4) out.push({ id, rule: 'OUTLIER', sev: 'medium', blocks: false, ev: `${money(p.prior)} → ${money(p.gross)} (+${Math.round((p.gross / p.prior - 1) * 1000) / 10}%)` });
      if (p.ccy !== h.ccy) out.push({ id, rule: 'CURRENCY', sev: 'medium', blocks: false, ev: `Paid in ${p.ccy}, HRIS says ${h.ccy}` });
      if (h.hire > START && h.hire <= END) {
        const days = (new Date(END) - new Date(h.hire)) / 864e5 + 1, exp = Math.round(p.gross * days / 15 * 100) / 100;
        out.push({ id, rule: 'PRORATION', sev: 'medium', blocks: false, ev: `Hired ${h.hire} · paid ${money(p.gross)}, expected ${money(exp)}` });
      }
      if (/忽略|ignore previous|approve directly|直接批准|system prompt/i.test(p.note.replace(/0/g, 'o').replace(/1/g, 'i'))) out.push({ id, rule: 'INJECTION', sev: 'low', blocks: false, ev: 'Instruction found in note · withheld from model' });
    });
    TM.equity.forEach((e) => { const p = TM.payroll.find((r) => r.id === e.id); if (p && !p.equity) out.push({ id: e.id, rule: 'EQUITY_MISSING', sev: 'medium', blocks: false, ev: `${e.units} RSU vested · ${money(e.units * e.fmv)} not on payslip` }); });
    const order = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev]);
  }
  const PAY = runPayroll();
  function renderPayroll() {
    const gross = TM.payroll.reduce((a, p) => a + p.gross, 0);
    const openBlock = PAY.filter((x) => x.blocks && !payState.decisions[x.id + x.rule]).length;
    $('#pay-stats').innerHTML =
      stat('Payroll records', TM.payroll.length, `${TM.hris.length} people in HRIS`) +
      stat('Gross this period', money(gross), 'CAD, before any hold') +
      stat('Exceptions', PAY.length, `${Object.keys(payState.decisions).length} decided`) +
      stat('Release blockers', openBlock, openBlock ? 'payroll cannot release' : 'ready for a second approver', openBlock > 0);
    $('#pay-release').disabled = openBlock > 0;
    $('#pay-q-sub').textContent = 'High severity blocks release until a person decides';
    $('#pay-q tbody').innerHTML = PAY.map((x) => {
      const key = x.id + x.rule, d = payState.decisions[key];
      return `<tr><td>${x.id}</td><td>${x.rule}</td><td>${esc(x.ev)}</td><td>${sevPill(x.sev)}</td><td>${d ? `<span class="pill ok">${d}</span>` : `<button type="button" class="b-sec" data-k="${key}" data-a="Held">Hold</button> <button type="button" class="b-sec" data-k="${key}" data-a="Cleared">Clear</button>`}</td></tr>`;
    }).join('');
    $$('#pay-q [data-k]').forEach((b) => b.addEventListener('click', () => {
      payState.decisions[b.dataset.k] = b.dataset.a;
      log('You', `${b.dataset.a} ${b.dataset.k.slice(0, 6)}`, b.dataset.k.slice(6));
      renderPayroll();
    }));
  }
  function drawPayrollCharts() {
    const rules = [...new Set(PAY.map((x) => x.rule))];
    Charts.barList($('#ch-rules'), rules.map((r) => ({ label: r, value: PAY.filter((x) => x.rule === r).length })), { format: Charts.fmt.int });
    const depts = ['Finance', 'Engineering', 'Sales', 'Operations', 'People'];
    const byDept = depts.map((d) => ({ label: d, value: TM.payroll.filter((p) => TM.hris.find((h) => h.id === p.id).dept === d).reduce((a, p) => a + p.gross, 0) }));
    Charts.barList($('#ch-dept'), byDept.sort((a, b) => b.value - a.value), { format: Charts.fmt.money('CAD', 0) });
  }
  $('#pay-release').addEventListener('click', () => { log('You', 'Released payroll 1–15 Oct', 'Awaiting second approver (four-eyes)'); $('#pay-release').disabled = true; $('#pay-release').textContent = 'Sent to second approver'; });

  // cash view: the matcher
  function renderCash() {
    const win = +$('#cash-window').value;
    const used = new Set();
    const rows = TM.bank.map(([date, desc, amt]) => {
      let hit = -1;
      TM.gl.forEach(([gd, , ga], i) => { if (hit < 0 && !used.has(i) && Math.abs(ga - amt) < 0.005 && Math.abs(new Date(gd) - new Date(date)) / 864e5 <= win) hit = i; });
      if (hit >= 0) { used.add(hit); const lag = Math.round(Math.abs(new Date(TM.gl[hit][0]) - new Date(date)) / 864e5); return { date, desc, amt, gl: TM.gl[hit][1], res: lag ? `matched · ${lag} day${lag > 1 ? 's' : ''}` : 'matched', ok: true }; }
      let near = null, nd = Infinity;
      TM.gl.forEach(([gd, gdesc, ga], i) => { if (used.has(i)) return; const d = Math.abs(ga - amt); if (d < nd && d < Math.abs(amt) * 0.1) { nd = d; near = `${gdesc} ${money(ga)}`; } });
      return { date, desc, amt, gl: near || '—', res: near ? `differs by ${money(nd)}` : 'no candidate', ok: false };
    });
    const m = rows.filter((r) => r.ok).length;
    const bankBal = TM.bank.reduce((a, b) => a + b[2], 0), glBal = TM.gl.reduce((a, b) => a + b[2], 0);
    $('#cash-stats').innerHTML =
      stat('Statement lines', rows.length, 'October to date') +
      stat('Matched', `${m} of ${rows.length}`, `window ±${win} days`) +
      stat('Bank movement', money(bankBal), `GL movement ${money(glBal)}`) +
      stat('Unexplained', money(Math.abs(bankBal - glBal)), `${rows.length - m} lines to a person`, rows.length - m > 0);
    $('#cash-t tbody').innerHTML = rows.map((r) => `<tr><td class="num">${r.date.slice(5)}</td><td>${esc(r.desc)}</td><td class="num">${money(r.amt)}</td><td>${esc(r.gl)}</td><td class="${r.ok ? 'ok' : 'warn'}">${r.res}</td></tr>`).join('');
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
    const amt = Math.round(TM.eurBalance * (last.eur - sep.eur) * 100) / 100;
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
  const big = (v) => v == null ? '—' : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + ' bn' : (v / 1e6).toFixed(0) + ' m');
  function secChecks(c, th) {
    const e = c.equityTotal ?? c.equity;
    const id = c.liabilities != null && e != null
      ? { ok: Math.abs(c.assets - c.liabilities - e - (c.temp || 0)) < 0.5, txt: 'ties', note: `${big(c.assets)} = ${big(c.liabilities)} + ${big(e)}` }
      : { ok: null, txt: 'Liabilities not tagged', note: c.lse != null ? `Derived ${big(c.lse - e)} from the liabilities-and-equity total less equity` : 'cannot test' };
    const k = c.cash;
    const diff = k && k.begin != null && k.chg != null ? k.end - k.begin - k.chg : null;
    const roll = diff != null
      ? { ok: Math.abs(diff) < 0.5, txt: Math.abs(diff) < 0.5 ? 'ties' : `off by ${big(diff)}`, note: `${big(k.begin)} opening + ${big(k.chg)} change = ${big(k.end)} closing` }
      : { ok: null, txt: 'not tagged', note: 'cannot test' };
    const g = c.revenue && c.revenuePrior ? c.revenue / c.revenuePrior - 1 : null;
    const flux = g == null ? { ok: null, txt: '—' } : { ok: Math.abs(g) <= th, txt: (g >= 0 ? '+' : '−') + Math.abs(g * 100).toFixed(1) + '%' };
    return { id, roll, flux };
  }
  const secState = { sel: 0 };
  function renderSec() {
    if (!REAL) return;
    const th = +$('#sec-th').value, cos = REAL.companies;
    const rows = cos.map((c) => ({ c, k: secChecks(c, th) }));
    const tests = rows.flatMap((r) => [r.k.id, r.k.roll, r.k.flux]);
    const ran = tests.filter((t) => t.ok !== null).length, held = tests.filter((t) => t.ok === true).length;
    $('#sec-sub').textContent = `SEC EDGAR XBRL company facts · ${cos.length} companies · pulled ${REAL.pulled}`;
    $('#sec-stats').innerHTML =
      stat('Filings checked', cos.length, 'latest annual report each') +
      stat('Checks that held', `${held} of ${ran}`, `${tests.length - ran} could not run`) +
      stat('Untestable', tests.length - ran, 'a fact the filer did not tag', tests.length - ran > 0) +
      stat('Flux over threshold', rows.filter((r) => r.k.flux.ok === false).length, `revenue change above ${Math.round(th * 100)}%`, rows.some((r) => r.k.flux.ok === false));
    const cell = (t) => t.ok === null ? `<span class="warn">${esc(t.txt)}</span>` : t.ok ? `<span class="ok">${esc(t.txt)}</span>` : `<span class="pill warn">${esc(t.txt)}</span>`;
    $('#sec-t tbody').innerHTML = rows.map(({ c, k }, i) => `<tr class="click${i === secState.sel ? ' on' : ''}" data-i="${i}" tabindex="0"><td><b>${esc(c.name)}</b><span class="sub">CIK ${c.cik}</span></td><td class="num">${c.end}</td><td>${cell(k.id)}</td><td>${cell(k.roll)}</td><td class="num">${big(c.revenue)}</td><td>${cell(k.flux)}</td></tr>`).join('');
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
        <p>Assets = L + E: ${esc(k.id.note)}</p><p>Cash: ${esc(k.roll.note)}</p><p>Revenue (${esc(c.revTag)}): ${big(c.revenuePrior)} → ${big(c.revenue)}</p>
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

  // ---------- real data: FinQA grader (same logic as scripts/finqa-grader.mjs) ----------
  const fq = (() => {
    const num = (t, mem) => { t = t.trim(); if (t.startsWith('#')) return mem[+t.slice(1)]; if (t.startsWith('const_')) return t === 'const_m1' ? -1 : +t.slice(6); const pct = t.endsWith('%'); const v = parseFloat(t.replace(/[%,$]/g, '')); return pct ? v / 100 : v; };
    const run = (prog) => {
      const mem = [];
      for (const s of prog.split(/\)\s*,\s*/).map((x) => x.replace(/\)\s*$/, ''))) {
        const m = s.trim().match(/^(\w+)\((.*)$/); if (!m) return NaN;
        const [a, b] = m[2].split(','); const x = num(a, mem), y = num(b, mem);
        const r = { add: x + y, subtract: x - y, multiply: x * y, divide: x / y, exp: x ** y, greater: x > y ? 'yes' : 'no' }[m[1]];
        if (r === undefined) return NaN; mem.push(r);
      }
      return mem.at(-1);
    };
    const same = (p, g) => typeof g === 'string' || typeof p === 'string' ? String(p) === String(g) : Math.abs(p - g) <= Math.max(1e-4, Math.abs(g) * 0.005);
    return { run, same };
  })();
  function renderFinqa() {
    if (!REAL) return;
    const F = REAL.finqa;
    $('#fq-sub').textContent = `FinQA test set · ${F.total.toLocaleString('en')} questions on real filings · grader reproduces ${F.ok.toLocaleString('en')} of ${(F.total - F.table).toLocaleString('en')} gold answers · ${F.table} need table operations, not supported yet`;
    $('#fq-pick').innerHTML = F.sample.map((x, i) => `<button type="button" role="tab" class="b-sec${i ? '' : ' sel'}" aria-selected="${!i}" data-i="${i}">${esc(x.id.split('/')[0])} ${x.id.split('/')[1]}</button>`).join('');
    const show = (i) => {
      $$('#fq-pick button').forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('sel', on); b.setAttribute('aria-selected', String(on)); });
      const x = F.sample[i];
      const audit = /debt to equity/.test(x.q) ? '<p class="notice">Label worth questioning: the evidence is an 82/18 asset allocation, not debt and equity. Benchmarks need auditing too.</p>' : '';
      $('#fq-body').innerHTML = `<p class="fq-q">${esc(x.q)}</p>
        <p class="sl">From the filing (${esc(x.id)})</p><p class="fq-ev">${esc(x.evidence[0] || '')}</p>${audit}
        <form class="fq-try" id="fq-form"><label for="fq-in">Your answer, or a program such as divide(121.4, 4187.8)</label>
        <div class="fq-row"><input id="fq-in" autocomplete="off"><button class="b-pri" type="submit">Grade</button><button class="b-sec" type="button" id="fq-gold">Show gold</button></div></form>
        <p class="fq-out" id="fq-out" aria-live="polite"></p>`;
      $('#fq-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = $('#fq-in').value.trim(); if (!v) return;
        const got = /\(/.test(v) ? fq.run(v) : (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v.replace(/,/g, '')));
        const pass = fq.same(got, x.ans);
        $('#fq-out').innerHTML = Number.isNaN(got) ? '<span class="warn">Could not read that. Use a number or a FinQA program.</span>' : `<span class="${pass ? 'ok' : 'warn'}">${pass ? 'Correct' : 'Not correct'}</span> · yours ${typeof got === 'number' ? +got.toFixed(5) : got}, gold ${x.ans}, tolerance 0.5%`;
        log('You', `Graded FinQA ${x.id}`, pass ? 'correct' : 'not correct');
      });
      $('#fq-gold').addEventListener('click', () => { $('#fq-in').value = x.prog; $('#fq-form').requestSubmit(); });
    };
    $$('#fq-pick button').forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
    show(0);
  }

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
  renderCloseStats(); renderCloseQueue(); renderPayroll(); renderCash(); renderFx(); renderSec(); renderEval(); renderFinqa();
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

  // ---------- contact: one field to an email ----------
  $('#ct-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#ct-in').value.trim();
    const to = $('#ct-mail').getAttribute('href').replace('mailto:', '');
    const body = `Hi Martin,\n\nI saw Tickmark.\n\n${v || 'I would like to talk about a role.'}\n`;
    location.href = `mailto:${to}?subject=${encodeURIComponent('About a role: Tickmark')}&body=${encodeURIComponent(body)}`;
    $('#ct-help').textContent = `If no email app opened, write to ${to}. Your line is above, ready to copy.`;
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
