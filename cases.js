// Tickmark casework: one case, evidence, task and decision model shared by Payroll, Cash and Mortgage.
// No DOM. The page loads it as window.TickmarkCases; the tests load it with require().
// Rules decide what is an exception and what may move; people decide, with a reason, on a known version
// of the evidence. Extraction from documents here is deterministic and stands in for a model.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickmarkCases = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const DEMO_NOW = '2026-11-04T14:00:00.000Z';
  const HOUR = 36e5;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / HOUR;
  const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

  // ---------- state and clock ----------
  // The demo keeps its own clock so deadlines and overdue tasks behave the same on every run.
  function newState(now = DEMO_NOW) { return { v: 1, now, seq: 0, cases: {}, order: [], tasks: {} }; }
  function tick(state, minutes = 4) {
    state.now = new Date(new Date(state.now).getTime() + minutes * 6e4).toISOString();
    return state.now;
  }
  function advance(state, hours) { state.now = new Date(new Date(state.now).getTime() + hours * HOUR).toISOString(); return state.now; }
  const nextId = (state, prefix) => `${prefix}-${String(++state.seq).padStart(4, '0')}`;

  // ---------- people and permissions (simulated sign-in) ----------
  const who = (dir, id) => dir.people[id] || { name: id, team: '', perms: [] };
  const can = (dir, pid, perm) => !!dir.people[pid] && dir.people[pid].perms.includes(perm);
  const isLead = (dir, pid, team) => !!dir.teams[team] && dir.teams[team].lead === pid;
  const onCase = (dir, pid, c) => pid === c.owner || (who(dir, pid).team && who(dir, pid).team === who(dir, c.owner).team) || can(dir, pid, c.module + '.decide');
  const seesEvidence = (dir, pid, e) => !e.restricted || e.restricted.includes(who(dir, pid).team) || (e.sharedWith || []).includes(pid);

  // ---------- evidence and tracing ----------
  // A reading is one value of one fact in one piece of evidence. Structured records state theirs;
  // documents get theirs from the extractor, with the character range they came from.
  function readingsOf(e) {
    const out = {};
    for (const [k, v] of Object.entries(e.facts || {})) out[k] = v && typeof v === 'object' && 'value' in v ? v : { value: v, loc: e.loc };
    for (const x of e.extract || []) {
      const m = new RegExp(x.re, 'i').exec(e.text || '');
      if (!m) continue;
      const start = m.index + m[0].indexOf(m[1]);
      out[x.fact] = { value: x.number ? Number(m[1].replace(/[,$\s]/g, '')) : m[1], loc: `chars ${start}–${start + m[1].length}`, quote: m[1], span: [start, start + m[1].length], inferred: true, origin: x.origin };
    }
    return out;
  }
  const norm = (v) => (typeof v === 'number' ? Math.abs(v).toFixed(2) : String(v ?? '').trim().toLowerCase());

  // every reading of every fact, which sources are independent of each other, and where they disagree
  function trace(c) {
    const live = c.evidence.filter((e) => !e.superseded);
    const keys = [...new Set([...(c.factDefs || []).map((d) => d.key), ...live.flatMap((e) => Object.keys(readingsOf(e)))])];
    return keys.map((key) => {
      const def = (c.factDefs || []).find((d) => d.key === key) || { key, label: key };
      const readings = live.flatMap((e) => {
        const r = readingsOf(e)[key];
        return r === undefined ? [] : [{ evidence: e.id, label: e.label, value: r.value, loc: r.loc, quote: r.quote, inferred: !!r.inferred, origin: r.origin || e.origin, copied: !!r.origin && r.origin !== e.origin, system: e.system, recorded: e.recorded, version: e.version || 1 }];
      });
      readings.forEach((r) => { r.copies = readings.filter((o) => o !== r && o.origin === r.origin).map((o) => o.label); });
      const origins = new Set(readings.map((r) => r.origin));
      const values = new Set(readings.map((r) => norm(r.value)));
      const status = !readings.length ? 'pending' : values.size > 1 ? 'conflict' : origins.size > 1 ? 'agree' : 'single';
      // the value most independent sources agree on, when there is one
      let leading = null;
      if (values.size > 1) {
        const by = {};
        readings.forEach((r) => { (by[norm(r.value)] ||= new Set()).add(r.origin); });
        const ranked = Object.entries(by).sort((a, b) => b[1].size - a[1].size);
        if (ranked[0][1].size > ranked[1][1].size) leading = ranked[0][0];
      }
      return { ...def, readings, independent: origins.size, status, leading };
    });
  }
  const factMap = (c) => Object.fromEntries(trace(c).map((f) => [f.key, f]));

  // ---------- priority: business impact, kept apart from confidence ----------
  const IMPACT = { closing: 3, payout: 3, release: 3, signoff: 2, info: 1 };
  function priorityOf(c, now) {
    const reasons = [];
    let score = 0;
    const open = c.exceptions.filter((x) => x.status === 'open');
    const impact = Math.max(0, ...open.map((x) => IMPACT[x.impact] || 1));
    if (impact) { score += impact; reasons.push(`Blocks ${c.affects || 'the next step'}`); }
    if (c.due) {
      const h = hoursBetween(now, c.due);
      if (h < 0) { score += 4; reasons.push(`${c.dueLabel || 'Deadline'} passed ${Math.round(-h)} h ago`); }
      else if (h <= 24) { score += 3; reasons.push(`${c.dueLabel || 'Deadline'} in ${Math.round(h)} h`); }
      else if (h <= 72) { score += 2; { const n = Math.max(1, Math.round(h / 24)); reasons.push(`${c.dueLabel || 'Deadline'} in ${n} day${n > 1 ? 's' : ''}`); } }
      else score += 1;
    }
    if (c.amount >= 100000) { score += 2; reasons.push(`${c.amountLabel || 'Amount'} ${Math.round(c.amount).toLocaleString('en-CA')}`); }
    else if (c.amount >= 5000) { score += 1; reasons.push(`${c.amountLabel || 'Amount'} ${Math.round(c.amount).toLocaleString('en-CA')}`); }
    const oldest = open.reduce((m, x) => (!m || x.firstSeen < m ? x.firstSeen : m), null);
    if (oldest && hoursBetween(oldest, now) > 48) { score += 1; reasons.push(`Open ${Math.round(hoursBetween(oldest, now) / 24)} days`); }
    if (!open.length) return { level: 'P4', score: 0, reasons: ['Nothing open'] };
    const level = score >= 7 ? 'P1' : score >= 5 ? 'P2' : 'P3';
    return { level, score, reasons };
  }
  function reprioritise(state, c, why) {
    const p = priorityOf(c, state.now);
    const before = c.priority && c.priority.level;
    c.priority = p;
    if (before && before !== p.level && !c.priorityOverride) c.history.push({ at: state.now, by: 'Engine', event: `Priority ${before} → ${p.level}`, detail: why });
  }
  const effectivePriority = (c) => (c.priorityOverride ? c.priorityOverride.level : c.priority ? c.priority.level : 'P4');

  // ---------- running the module's checks ----------
  function runCheck(state, adapters, caseId, by, why) {
    const c = state.cases[caseId];
    const at = tick(state, 1);
    const found = adapters[c.module].check(c, { now: state.now, facts: factMap(c) });
    const opened = [], cleared = [], kept = [];
    for (const f of found) {
      const accepted = c.exceptions.find((x) => x.code === f.code && x.status === 'accepted');
      if (accepted && accepted.acceptedVersion === c.version) continue;
      if (accepted) { accepted.status = 'reopened-by-change'; accepted.history.push({ at, by, event: 'Acceptance no longer holds', detail: 'Its evidence changed after it was accepted' }); }
      let x = c.exceptions.find((e) => e.code === f.code && e.status === 'open');
      if (x) {
        const changed = x.expected !== f.expected || x.actual !== f.actual || x.title !== f.title;
        const keepCls = x.clsBy ? { cls: x.cls } : {};
        Object.assign(x, f, keepCls, { lastSeen: at, seen: (x.seen || 1) + 1 });
        if (changed) x.history.push({ at, by, event: 'Updated by re-check', detail: f.title });
        kept.push(x.id);
      } else {
        x = { id: `${c.id}-${c.exceptions.length + 1}`, ...f, status: 'open', firstSeen: at, lastSeen: at, seen: 1, clsBy: null, history: [{ at, by, event: 'Raised', detail: f.title }] };
        c.exceptions.push(x);
        opened.push(x.id);
      }
    }
    for (const x of c.exceptions) {
      if (x.status === 'reopened-by-change') x.status = found.some((f) => f.code === x.code) ? 'superseded' : 'resolved';
      if (x.status === 'open' && !found.some((f) => f.code === x.code)) {
        x.status = 'resolved'; x.resolvedAt = at;
        x.history.push({ at, by, event: 'Cleared by re-check', detail: why });
        cleared.push(x.id);
      }
    }
    reprioritise(state, c, why);
    c.lastCheck = at;
    c.history.push({ at, by, event: 'Checks ran', detail: `${why} · ${opened.length} new, ${cleared.length} cleared, ${kept.length} still open` });
    return { opened, cleared, kept };
  }

  function createCase(state, dir, adapters, seed, by = 'Engine') {
    const prefix = { cash: 'CF', payroll: 'PY', mortgage: 'MS' }[seed.module] || 'CS';
    const c = {
      id: nextId(state, prefix), status: 'open', version: 1, exceptions: [], tasks: [], decisions: [], history: [],
      evidence: [], available: [], inbox: [], factDefs: [], stage: '', ...clone(seed),
    };
    c.evidence.forEach((e) => { e.version = e.version || 1; });
    // files can arrive with a check already out, like the overdue registration follow-up in the mortgage demo
    for (const s of c.seedTasks || []) {
      const recipient = s.to + ':' + (s.team || s.person);
      const t = { id: nextId(state, 'TK'), caseId: c.id, exceptionIds: [], kind: s.kind, to: s.to, team: s.team || who(dir, s.person).team, assignee: s.person || null, recipient, original: recipient,
        from: c.owner, owner: c.owner, question: s.question, why: s.why, affects: c.affects, requested: s.requested || [], evidence: [], blocking: true, requires: null, priority: 'P2', due: s.due, followUp: null,
        status: s.person ? 'claimed' : 'open', reply: null, created: s.created, history: [{ at: s.created, by: c.owner, event: 'Sent to ' + (s.team ? dir.teams[s.team].name : who(dir, s.person).name), detail: s.question }] };
      state.tasks[t.id] = t; c.tasks.push(t.id);
    }
    delete c.seedTasks;
    c.history.push({ at: tick(state, 1), by, event: 'Case opened', detail: seed.openedBecause || seed.title });
    state.cases[c.id] = c;
    state.order.push(c.id);
    runCheck(state, adapters, c.id, by, 'First check');
    return c;
  }

  // Detection: a run of the module's own matching or rules. The same finding updates its open case
  // instead of opening a new one.
  function sync(state, dir, adapters, module, sources, by = 'Engine') {
    const seeds = adapters[module].detect(sources);
    const created = [], updated = [];
    for (const seed of seeds) {
      const existing = state.order.map((id) => state.cases[id]).find((c) => c.key === seed.key);
      if (existing) { runCheck(state, adapters, existing.id, by, 'Re-scan of the same data'); updated.push(existing.id); }
      else created.push(createCase(state, dir, adapters, { module, ...seed }, by).id);
    }
    return { created, updated };
  }

  // ---------- new or corrected evidence ----------
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); const last = ks.pop();
    const t = ks.reduce((a, k) => (a[k] == null ? (a[k] = /^\d+$/.test(k) ? [] : {}) : a[k]), o);
    if (v === undefined) { if (Array.isArray(t)) t.splice(+last, 1); else delete t[last]; } else t[last] = v;
  }
  // Adds an item from the case's inbox or a replier's reachable evidence. A patch is a correction to the
  // inputs the checks read; the before and after are kept, and approvals that relied on the changed facts
  // are marked for re-review.
  function attachEvidence(state, dir, adapters, caseId, itemId, by, { via } = {}) {
    const c = state.cases[caseId];
    const pool = via === 'inbox' ? c.inbox : c.available;
    const item = pool.find((i) => i.id === itemId);
    if (!item) return fail('That evidence is no longer available on this case.');
    if (via !== 'inbox' && item.teams && !item.teams.includes(who(dir, by).team)) return fail(`${who(dir, by).name} cannot reach ${item.label}; it is held by ${item.teams.map((t) => dir.teams[t] ? dir.teams[t].name : t).join(', ')}.`);
    const at = tick(state, 2);
    const before = factMap(c);
    const ev = { id: item.id, ...clone(item.evidence), recorded: item.evidence.recorded || at, addedBy: by, addedAt: at };
    for (const sid of [].concat(item.supersedes || [])) {
      const old = c.evidence.find((e) => e.id === sid && !e.superseded);
      if (old) { old.superseded = at; old.supersededBy = ev.id; ev.version = Math.max(ev.version || 1, (old.version || 1) + 1); (ev.replaces ||= []).push(old.id); }
    }
    ev.version = ev.version || 1;
    c.evidence.push(ev);
    const changes = [];
    for (const p of item.patch || []) {
      const was = getPath(c.records, p.path);
      setPath(c.records, p.path, p.value);
      changes.push({ path: p.path, label: p.label || p.path, before: was, after: p.value });
    }
    pool.splice(pool.indexOf(item), 1);
    c.version += 1;
    const after = factMap(c);
    const moved = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify((before[k] || {}).readings?.map((r) => norm(r.value)).sort()) !== JSON.stringify((after[k] || {}).readings?.map((r) => norm(r.value)).sort()));
    const touched = new Set([...moved, ...(item.touches || [])]);
    for (const d of c.decisions) {
      if (!d.stale && d.facts && d.facts.some((k) => touched.has(k))) {
        d.stale = at;
        c.history.push({ at, by: 'Engine', event: `Needs re-review: ${d.label}`, detail: `It relied on ${d.facts.filter((k) => touched.has(k)).join(', ')}, which changed` });
      }
    }
    if (item.due) { c.due = item.due; }
    c.history.push({ at, by, event: `${item.correction ? 'Correction' : 'Evidence'} added: ${item.label}`, detail: changes.length ? changes.map((x) => `${x.label}: ${fmt(x.before)} → ${fmt(x.after)}`).join(' · ') : (ev.system || ''), changes });
    const result = runCheck(state, adapters, caseId, by, `${item.label} arrived`);
    return { ok: true, evidence: ev.id, changes, moved: [...touched], ...result };
  }
  const fmt = (v) => (v == null || v === '' ? 'blank' : typeof v === 'number' ? v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : typeof v === 'object' ? JSON.stringify(v) : String(v));

  // ---------- tasks: escalation to a team or a person ----------
  const OPEN_TASK = ['open', 'claimed', 'clarify', 'more-info', 'returned', 'replied'];
  const WAITING = ['open', 'claimed', 'more-info'];
  function escalate(state, dir, caseId, spec, by) {
    const c = state.cases[caseId];
    if (!c) return fail('No such case.');
    if (!onCase(dir, by, c)) return fail(`${who(dir, by).name} does not work this case, so cannot send checks from it.`);
    const q = String(spec.question || '').trim();
    if (q.length < 15) return fail('Write the question the recipient has to answer (at least 15 characters).');
    if (spec.to === 'team' && !dir.teams[spec.team]) return fail('Pick a team.');
    if (spec.to === 'person') {
      const p = dir.people[spec.person];
      if (!p) return fail('Pick a person.');
      if (spec.requires && !p.perms.includes(spec.requires)) {
        const able = Object.entries(dir.people).filter(([, x]) => x.perms.includes(spec.requires)).map(([id, x]) => ({ id, name: x.name, team: x.team }));
        return fail(`${p.name} is not authorised for this (${spec.requires}). Pick someone who is, or send it to their team.`, { suggest: able });
      }
    }
    const recipient = spec.to === 'team' ? 'team:' + spec.team : 'person:' + spec.person;
    const dup = c.tasks.map((id) => state.tasks[id]).find((t) => OPEN_TASK.includes(t.status) && t.recipient === recipient && t.question.toLowerCase() === q.toLowerCase());
    if (dup) return fail('The same question is already open with that recipient.', { duplicate: dup.id });
    const at = tick(state);
    const t = {
      id: nextId(state, 'TK'), caseId, exceptionIds: spec.exceptionIds || [], kind: spec.kind || 'verify',
      to: spec.to, team: spec.to === 'team' ? spec.team : who(dir, spec.person).team, assignee: spec.to === 'person' ? spec.person : null,
      recipient, original: recipient, from: by, owner: c.owner, question: q, why: spec.why || '', affects: spec.affects || c.affects || '',
      requested: spec.requested || [], evidence: spec.evidence || [], blocking: spec.blocking !== false, requires: spec.requires || null,
      priority: spec.priority || effectivePriority(c), due: spec.due || new Date(new Date(at).getTime() + 24 * HOUR).toISOString(),
      followUp: spec.followUp || null, status: spec.to === 'person' ? 'claimed' : 'open', reply: null, created: at,
      history: [{ at, by, event: spec.to === 'team' ? `Sent to ${dir.teams[spec.team].name}` : `Sent to ${who(dir, spec.person).name}`, detail: q }],
    };
    (t.evidence || []).forEach((eid) => { const e = c.evidence.find((x) => x.id === eid); if (e && e.restricted) e.sharedWith = [...new Set([...(e.sharedWith || []), ...(t.assignee ? [t.assignee] : [])])]; });
    state.tasks[t.id] = t;
    c.tasks.push(t.id);
    c.history.push({ at, by, event: `Check ${t.id} sent${t.blocking ? '' : ' (question, not blocking)'}`, detail: `${t.to === 'team' ? dir.teams[t.team].name : who(dir, t.assignee).name}: ${q}` });
    reprioritise(state, c, 'Check sent');
    return { ok: true, task: t.id };
  }
  const handler = (t) => t.assignee;
  function taskStep(state, dir, taskId, by, check, apply) {
    const t = state.tasks[taskId];
    if (!t) return fail('No such check.');
    const err = check(t);
    if (err) return fail(err);
    const at = tick(state);
    const entry = apply(t, at) || {};
    t.history.push({ at, by, ...entry });
    const c = state.cases[t.caseId];
    c.history.push({ at, by, event: `${t.id}: ${entry.event}`, detail: entry.detail || '' });
    return { ok: true, task: t.id };
  }
  const claim = (state, dir, taskId, by) => taskStep(state, dir, taskId, by,
    (t) => (t.status !== 'open' ? 'Someone already has this check.' : who(dir, by).team !== t.team ? `${who(dir, by).name} is not in ${dir.teams[t.team].name}.` : null),
    (t) => { t.assignee = by; t.status = 'claimed'; return { event: 'Claimed', detail: who(dir, by).name }; });
  const assign = (state, dir, taskId, by, to) => taskStep(state, dir, taskId, by,
    (t) => (!isLead(dir, by, t.team) ? `Only the ${dir.teams[t.team].name} lead can assign this check.` : who(dir, to).team !== t.team ? 'Assign within the team, or reassign to another team.' : t.requires && !can(dir, to, t.requires) ? `${who(dir, to).name} is not authorised for this.` : null),
    (t) => { t.assignee = to; t.status = 'claimed'; return { event: 'Assigned', detail: `to ${who(dir, to).name}` }; });
  function reassign(state, dir, taskId, by, { to, team, person, reason }) {
    return taskStep(state, dir, taskId, by,
      (t) => {
        if (!['open', 'claimed', 'returned', 'more-info', 'clarify'].includes(t.status)) return 'This check is closed or answered; reopen it first.';
        if (!(handler(t) === by || isLead(dir, by, t.team) || by === t.owner)) return 'Only the current handler, the team lead or the case owner can reassign.';
        if (String(reason || '').trim().length < 8) return 'Say why it is moving (at least 8 characters).';
        if (to === 'person' && !dir.people[person]) return 'Pick a person.';
        if (to === 'person' && t.requires && !can(dir, person, t.requires)) return `${who(dir, person).name} is not authorised for this; pick someone who is, or send it to a team.`;
        if (to === 'team' && !dir.teams[team]) return 'Pick a team.';
        return null;
      },
      (t) => {
        const from = t.assignee ? who(dir, t.assignee).name : dir.teams[t.team].name;
        if (to === 'team') { t.team = team; t.assignee = null; t.status = 'open'; t.recipient = 'team:' + team; }
        else { t.assignee = person; t.team = who(dir, person).team; t.status = 'claimed'; t.recipient = 'person:' + person; }
        return { event: 'Reassigned', detail: `${from} → ${to === 'team' ? dir.teams[team].name : who(dir, person).name} · ${reason.trim()}` };
      });
  }
  // A reply answers the question, may attach evidence the replier can reach, and returns the check to the owner.
  function reply(state, dir, adapters, taskId, by, { answer, conclusion, attach = [] }) {
    const t = state.tasks[taskId];
    if (!t) return fail('No such check.');
    if (handler(t) !== by) return fail('Only the person handling this check can reply. Claim it first.');
    if (!['claimed', 'more-info'].includes(t.status)) return fail('This check is not waiting for a reply.');
    if (String(answer || '').trim().length < 10) return fail('Write the answer (at least 10 characters).');
    if (!['confirmed', 'corrected', 'cannot-confirm'].includes(conclusion)) return fail('Pick a conclusion.');
    const c = state.cases[t.caseId];
    for (const id of attach) {
      const item = c.available.find((i) => i.id === id);
      if (!item) return fail('One of the attachments is no longer available.');
      if (item.teams && !item.teams.includes(who(dir, by).team)) return fail(`${who(dir, by).name} cannot reach ${item.label}.`);
    }
    const added = [];
    for (const id of attach) { const r = attachEvidence(state, dir, adapters, t.caseId, id, by); if (r.ok) added.push(r.evidence); }
    const at = tick(state);
    t.reply = { by, at, answer: answer.trim(), conclusion, evidence: added };
    t.status = 'replied';
    t.history.push({ at, by, event: `Replied: ${conclusion}`, detail: answer.trim() });
    c.history.push({ at, by, event: `${t.id}: reply from ${who(dir, by).name}`, detail: `${conclusion} · ${answer.trim()}${added.length ? ` · ${added.length} attachment${added.length > 1 ? 's' : ''}` : ''}` });
    return { ok: true, task: t.id, evidence: added };
  }
  const askClarify = (state, dir, taskId, by, question) => taskStep(state, dir, taskId, by,
    (t) => (handler(t) !== by ? 'Only the handler can ask for clarification.' : String(question || '').trim().length < 10 ? 'Write the question (at least 10 characters).' : null),
    (t) => { t.status = 'clarify'; t.clarify = { q: question.trim() }; return { event: 'Asked the owner to clarify', detail: question.trim() }; });
  const answerClarify = (state, dir, taskId, by, answer) => taskStep(state, dir, taskId, by,
    (t) => (t.status !== 'clarify' ? 'No question is waiting.' : !onCase(dir, by, state.cases[t.caseId]) ? 'Only the case team can answer.' : String(answer || '').trim().length < 5 ? 'Write the answer.' : null),
    (t) => { t.status = 'claimed'; t.clarify.a = answer.trim(); return { event: 'Clarified', detail: answer.trim() }; });
  const returnTask = (state, dir, taskId, by, reason) => taskStep(state, dir, taskId, by,
    (t) => (!(handler(t) === by || (t.status === 'open' && who(dir, by).team === t.team)) ? 'Only the handler or the receiving team can return this.' : String(reason || '').trim().length < 10 ? 'Say why it cannot be handled (at least 10 characters).' : null),
    (t) => { t.status = 'returned'; t.returnReason = reason.trim(); return { event: 'Returned', detail: reason.trim() }; });
  const accept = (state, dir, taskId, by) => taskStep(state, dir, taskId, by,
    (t) => (t.status !== 'replied' ? 'There is no reply to accept.' : !onCase(dir, by, state.cases[t.caseId]) ? 'Only the case team can accept a reply.' : null),
    (t) => { t.status = 'closed'; t.closed = state.now; return { event: 'Reply accepted, check closed', detail: t.reply.conclusion }; });
  const askMore = (state, dir, taskId, by, note) => taskStep(state, dir, taskId, by,
    (t) => (!['replied', 'closed', 'returned'].includes(t.status) ? 'Nothing to send back yet.' : !onCase(dir, by, state.cases[t.caseId]) ? 'Only the case team can reopen a check.' : String(note || '').trim().length < 10 ? 'Say what is still missing (at least 10 characters).' : null),
    (t) => { const was = t.status; t.status = t.assignee ? 'more-info' : 'open'; t.more = (t.more || 0) + 1; return { event: was === 'closed' ? 'Reopened' : 'Sent back for more', detail: note.trim() }; });
  const closeTask = (state, dir, taskId, by, reason) => taskStep(state, dir, taskId, by,
    (t) => (!onCase(dir, by, state.cases[t.caseId]) ? 'Only the case team can withdraw a check.' : t.status === 'closed' ? 'Already closed.' : String(reason || '').trim().length < 8 ? 'Say why it is withdrawn.' : null),
    (t) => { t.status = 'closed'; t.closed = state.now; t.withdrawn = true; return { event: 'Withdrawn', detail: reason.trim() }; });
  const isOverdue = (state, t) => WAITING.includes(t.status) && new Date(t.due) < new Date(state.now);
  const remind = (state, dir, taskId, by) => taskStep(state, dir, taskId, by,
    (t) => (!isOverdue(state, t) && !WAITING.includes(t.status) ? 'Nothing to chase.' : null),
    (t) => { t.followUp = new Date(new Date(state.now).getTime() + 4 * HOUR).toISOString(); return { event: 'Reminder sent (in-app)', detail: `to ${t.assignee ? who(dir, t.assignee).name : dir.teams[t.team].name} · follow up ${t.followUp.slice(0, 16).replace('T', ' ')}` }; });
  const escalateToLead = (state, dir, taskId, by) => taskStep(state, dir, taskId, by,
    (t) => (!isOverdue(state, t) ? 'Only an overdue check goes to the lead.' : !dir.teams[t.team].lead ? 'This team has no lead on file.' : null),
    (t) => { const lead = dir.teams[t.team].lead; t.assignee = lead; t.status = 'claimed'; t.recipient = 'person:' + lead; return { event: 'Overdue, passed to the team lead', detail: who(dir, lead).name }; });

  // ---------- decisions and actions ----------
  // The module lists its actions and what each needs. Accepting an exception is shared by all modules.
  function actionsFor(state, dir, adapters, caseId, pid) {
    const c = state.cases[caseId];
    const facts = factMap(c);
    const openTasks = c.tasks.map((id) => state.tasks[id]).filter((t) => OPEN_TASK.includes(t.status));
    const ctx = { now: state.now, facts, openTasks, dir };
    const list = adapters[c.module].actions(c, ctx).map((a) => ({ ...a, reasonMin: a.needsReason ? 12 : 0 }));
    for (const x of c.exceptions.filter((e) => e.status === 'open')) {
      const pending = (x.facts || []).filter((k) => facts[k] && facts[k].status === 'pending');
      list.push({
        id: 'accept:' + x.id, label: `Accept "${x.short || x.title}" as explained`, perm: c.module + '.decide', needsReason: true, reasonMin: 12, facts: x.facts || [], kind: 'accept', exception: x.id,
        prereqs: [{ ok: !pending.length, label: pending.length ? `Evidence still missing: ${pending.map((k) => facts[k].label).join(', ')}` : 'Evidence for this exception is in' },
          { ok: !openTasks.some((t) => t.blocking && t.exceptionIds.includes(x.id)), label: 'No open check on it is blocking' }],
      });
    }
    return list.map((a) => {
      const allowed = !a.perm || can(dir, pid, a.perm);
      const ready = (a.prereqs || []).every((p) => p.ok);
      return { ...a, allowed, ready, permLabel: a.perm };
    });
  }
  function act(state, dir, adapters, caseId, actionId, { by, reason = '', version }) {
    const c = state.cases[caseId];
    if (!c) return fail('No such case.');
    if (version !== undefined && version !== c.version) return fail(`This case changed while it was open (evidence version ${version}, now ${c.version}). Review the current evidence, then decide again.`, { stale: true });
    const a = actionsFor(state, dir, adapters, caseId, by).find((x) => x.id === actionId);
    if (!a) return fail('That action is not available on this case now.');
    if (!a.allowed) return fail(`${who(dir, by).name} is not authorised to ${a.label.toLowerCase()} (needs ${a.perm}).`);
    if (!a.ready) return fail('Not yet: ' + a.prereqs.filter((p) => !p.ok).map((p) => p.label).join('; '));
    if (a.needsReason && String(reason).trim().length < 12) return fail('Write the reason (at least 12 characters). It stays with the decision.');
    if (c.decisions.some((d) => d.action === actionId && d.version === c.version && !d.stale)) return fail('That decision is already recorded on this version of the evidence.', { duplicate: true });
    const at = tick(state);
    const d = { id: nextId(state, 'DC'), action: actionId, label: a.label, by, at, reason: String(reason).trim(), version: c.version, facts: a.facts || [], stale: false };
    c.decisions.push(d);
    if (a.kind === 'accept') {
      const x = c.exceptions.find((e) => e.id === a.exception);
      x.status = 'accepted'; x.acceptedVersion = c.version; x.acceptedBy = by;
      x.history.push({ at, by, event: 'Accepted as explained', detail: d.reason });
    }
    const effect = adapters[c.module].apply ? adapters[c.module].apply(c, actionId, { now: at, by, dir }) : null;
    c.history.push({ at, by, event: `Decision: ${a.label}`, detail: [d.reason, effect && effect.detail].filter(Boolean).join(' · '), changes: effect && effect.changes });
    if (effect && effect.changes) c.version += 1;
    if (effect && effect.recheck !== false) runCheck(state, adapters, caseId, by, `After: ${a.label}`);
    else reprioritise(state, c, a.label);
    return { ok: true, decision: d.id };
  }
  function reclassify(state, dir, caseId, excId, cls, reason, by) {
    const c = state.cases[caseId];
    if (!onCase(dir, by, c)) return fail('Only the case team can change a classification.');
    if (String(reason || '').trim().length < 8) return fail('Say why (at least 8 characters).');
    const x = c.exceptions.find((e) => e.id === excId);
    if (!x) return fail('No such exception.');
    const at = tick(state);
    x.history.push({ at, by, event: `Classification ${x.cls} → ${cls}`, detail: reason.trim() });
    c.history.push({ at, by, event: `${x.id} reclassified ${x.cls} → ${cls}`, detail: reason.trim() });
    x.cls = cls; x.clsBy = by;
    return { ok: true };
  }
  function setPriority(state, dir, caseId, level, reason, by) {
    const c = state.cases[caseId];
    if (!onCase(dir, by, c)) return fail('Only the case team can change the priority.');
    if (level !== 'auto' && String(reason || '').trim().length < 8) return fail('Say why (at least 8 characters).');
    const at = tick(state);
    const was = effectivePriority(c);
    c.priorityOverride = level === 'auto' ? null : { level, reason: reason.trim(), by, at };
    c.history.push({ at, by, event: `Priority ${was} → ${level === 'auto' ? `${c.priority.level} (computed)` : level}`, detail: level === 'auto' ? 'Back to the computed priority' : reason.trim() });
    return { ok: true };
  }

  // ---------- reading the desk ----------
  function caseStatus(state, c) {
    const open = c.exceptions.filter((x) => x.status === 'open');
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const waiting = tasks.filter((t) => WAITING.includes(t.status));
    if (!open.length && !tasks.some((t) => OPEN_TASK.includes(t.status) && t.status !== 'replied')) return c.closed ? 'closed' : 'resolved';
    if (tasks.some((t) => t.status === 'replied' || t.status === 'returned' || t.status === 'clarify')) return 'reply-in';
    if (waiting.length) return 'waiting';
    return 'open';
  }
  function row(state, dir, c) {
    const tasks = c.tasks.map((id) => state.tasks[id]);
    const waiting = tasks.filter((t) => WAITING.includes(t.status));
    const open = c.exceptions.filter((x) => x.status === 'open');
    const next = waiting.map((t) => t.followUp || t.due).sort()[0] || c.followUp || null;
    return {
      id: c.id, module: c.module, title: c.title, branch: c.branchLabel || '', owner: c.owner, ownerName: who(dir, c.owner).name,
      found: open.map((x) => x.title), codes: open.map((x) => x.code), by: open.map((x) => x.by || 'Rule'),
      priority: effectivePriority(c), auto: !c.priorityOverride, reasons: c.priority ? c.priority.reasons : [], affects: c.affects || '',
      confidence: open.map((x) => x.confidence).filter(Boolean)[0] || null,
      waitingOn: waiting.map((t) => (t.assignee ? who(dir, t.assignee).name : dir.teams[t.team].name)),
      waitingTeams: waiting.map((t) => t.team), assignees: tasks.filter((t) => OPEN_TASK.includes(t.status)).map((t) => t.assignee).filter(Boolean),
      unclaimedTeams: tasks.filter((t) => t.status === 'open').map((t) => t.team),
      overdue: waiting.filter((t) => isOverdue(state, t)).length, next, due: c.due, dueLabel: c.dueLabel,
      status: caseStatus(state, c), stage: c.stage,
    };
  }
  const RANK = { P1: 0, P2: 1, P3: 2, P4: 3 };
  function queue(state, dir, { module, code, priority, status, owner, team, assignee, view, me } = {}) {
    let rows = state.order.map((id) => row(state, dir, state.cases[id]));
    const myTeam = who(dir, me).team;
    if (view === 'mine') rows = rows.filter((r) => r.owner === me);
    if (view === 'assigned') rows = rows.filter((r) => r.assignees.includes(me));
    if (view === 'team') rows = rows.filter((r) => r.unclaimedTeams.includes(myTeam));
    if (view === 'waiting') rows = rows.filter((r) => r.owner === me && r.waitingTeams.some((t) => t !== myTeam));
    if (module) rows = rows.filter((r) => r.module === module);
    if (code) rows = rows.filter((r) => r.codes.includes(code));
    if (priority) rows = rows.filter((r) => r.priority === priority);
    if (status) rows = rows.filter((r) => (status === 'active' ? !['resolved', 'closed'].includes(r.status) : r.status === status));
    if (owner) rows = rows.filter((r) => r.owner === owner);
    if (team) rows = rows.filter((r) => r.waitingTeams.includes(team));
    if (assignee) rows = rows.filter((r) => r.assignees.includes(assignee));
    return rows.sort((a, b) => RANK[a.priority] - RANK[b.priority] || (a.due || '9').localeCompare(b.due || '9'));
  }

  return {
    DEMO_NOW, newState, tick, advance, can, isLead, onCase, seesEvidence, who,
    readingsOf, trace, factMap, priorityOf, effectivePriority, runCheck, createCase, sync, attachEvidence,
    escalate, claim, assign, reassign, reply, askClarify, answerClarify, returnTask, accept, askMore, closeTask, remind, escalateToLead, isOverdue,
    actionsFor, act, reclassify, setPriority, caseStatus, row, queue, fmt, OPEN_TASK,
  };
});
