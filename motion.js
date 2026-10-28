// Tickmark motion: first-visit intro, slanted page wipe, scroll reveals, progress, counters, magnetic buttons.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };

  // ---------- reveals start once the page is uncovered ----------
  function startReveals() {
    const targets = document.querySelectorAll('.lines, .fade-in, [data-reveal], .fields');
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
      el.style.setProperty('--d', Math.max(0, sibs.indexOf(el)) * 90 + 'ms');
    });
    if (!('IntersectionObserver' in window) || reduced) { targets.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in'); io.unobserve(e.target);
      e.target.querySelectorAll?.('[data-count]').forEach(count);
      if (e.target.matches('[data-count]')) count(e.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach((el) => {
      // anything already scrolled past is shown at once; the rest waits for the viewport
      if (el.getBoundingClientRect().bottom < innerHeight * 0.92) { el.classList.add('is-in'); el.querySelectorAll('[data-count]').forEach(count); }
      else io.observe(el);
    });
    // never leave anything hidden
    setTimeout(() => targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); }), 3000);
  }

  // ---------- counters ----------
  function count(el) {
    if (el.dataset.done) return; el.dataset.done = '1';
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    const fmt = (v) => v.toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduced || end === 0) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(end * (1 - Math.pow(1 - k, 4))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------- intro: the mark assembles, the word rises, the cover lifts ----------
  const intro = document.getElementById('intro');
  const arriving = root.classList.contains('arriving');
  function uncover() {
    const wipe = document.getElementById('wipe');
    if (arriving && wipe) {
      store.del('tm-wipe');
      requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.add('leave')));
      setTimeout(() => { root.classList.remove('arriving'); wipe.classList.remove('leave'); }, 1000);
      setTimeout(startReveals, 280);
    } else startReveals();
  }
  if (intro && !reduced && !arriving && !store.get('tm-intro')) {
    store.set('tm-intro', '1');
    intro.querySelectorAll('.intro-word > span').forEach((s, i) => s.style.setProperty('--k', i));
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => intro.classList.add('play')));
    setTimeout(() => intro.classList.add('out'), 1650);
    setTimeout(() => { startReveals(); }, 1900);
    setTimeout(() => { intro.classList.add('gone'); document.body.style.overflow = ''; }, 2600);
  } else {
    if (intro) intro.classList.add('gone');
    uncover();
  }

  // ---------- page wipe on links between pages ----------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-wipe]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || reduced) return;
    const url = new URL(a.href, location.href);
    if (url.pathname === location.pathname) return;
    e.preventDefault();
    store.set('tm-wipe', '1');
    document.getElementById('wipe')?.classList.add('cover');
    setTimeout(() => { location.href = a.href; }, 720);
  });
  addEventListener('pageshow', (e) => { if (e.persisted) { document.getElementById('wipe')?.classList.remove('cover'); root.classList.remove('arriving'); } });

  // ---------- bar and progress ----------
  const bar = document.querySelector('.bar'), prog = document.getElementById('progress');
  const onScroll = () => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar?.classList.toggle('solid', y > 40);
    if (prog) prog.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- magnetic buttons ----------
  if (!reduced && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }
})();

// ---------- stacked toasts: one per logged decision, newest on top, three at most ----------
(() => {
  const box = document.getElementById('toasts'); if (!box) return;
  window.tmToast = (title, detail) => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<b></b><span></span>';
    t.firstChild.textContent = title; t.lastChild.textContent = detail || '';
    box.prepend(t);
    requestAnimationFrame(() => t.classList.add('in'));
    [...box.children].slice(3).forEach((old) => old.remove());
    setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3600);
  };
})();

// ---------- command palette: ⌘K / Ctrl K jumps to a view or section ----------
(() => {
  const pal = document.getElementById('palette'); if (!pal) return;
  const input = document.getElementById('pal-in'), list = document.getElementById('pal-list');
  const work = document.body.dataset.page === 'work';
  const go = (sel, view) => () => {
    if (view && work) { document.querySelector(`.nav-i[data-view="${view}"]`)?.click(); document.getElementById('workbench')?.scrollIntoView({ behavior: 'smooth' }); }
    else if (sel.startsWith('#') && document.querySelector(sel)) document.querySelector(sel).scrollIntoView({ behavior: 'smooth' });
    else location.href = sel;
  };
  const home = work ? '' : 'index.html';
  const notes = work ? 'notes.html' : '';
  const items = [
    ['Close', 'Workbench', go(home + '#workbench', 'close')],
    ['Payroll', 'Workbench', go(home + '#workbench', 'payroll')],
    ['Cash and FX', 'Workbench', go(home + '#workbench', 'cash')],
    ['Public filings', 'Workbench', go(home + '#workbench', 'sec')],
    ['Model evaluation', 'Workbench', go(home + '#workbench', 'eval')],
    ['Audit log', 'Workbench', go(home + '#workbench', 'audit')],
    ['Try a control', 'Work', go(home + '#control')],
    ['Contact', 'Work', go(home + '#contact')],
    ['Principles', 'Notes', go(notes + '#principles')],
    ['Scores', 'Notes', go(notes + '#scores')],
    ['What broke', 'Notes', go(notes + '#broke')],
    ['Close calendar', 'Notes', go(notes + '#calendar')],
    ['Data sources', 'Notes', go(notes + '#data')],
    ['Letter', 'Notes', go(notes + '#letter')],
  ];
  let shown = items, sel = 0, last = null;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = items.filter(([n, g]) => (n + ' ' + g).toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map(([n, g], i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}"><span>${n}</span><small>${g}</small></li>`).join('') || '<li class="none">Nothing matches</li>';
    input.setAttribute('aria-activedescendant', shown.length ? 'pal-' + sel : '');
  };
  const open = () => { last = document.activeElement; pal.hidden = false; input.value = ''; sel = 0; render(); requestAnimationFrame(() => pal.classList.add('on')); input.focus(); };
  const close = () => { pal.classList.remove('on'); setTimeout(() => { pal.hidden = true; }, 220); last?.focus?.(); };
  const pick = (i) => { const it = shown[i]; if (!it) return; close(); setTimeout(it[2], 120); };
  const btn = document.getElementById('pal-open');
  if (btn && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) btn.textContent = 'Ctrl K';
  btn?.addEventListener('click', open);
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); }
    else if (!pal.hidden && e.key === 'Escape') close();
  });
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
    if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  pal.addEventListener('click', (e) => { if (e.target === pal) close(); });
})();

// ---------- segmented selectors: a gold indicator slides to the chosen item ----------
(() => {
  const setup = (group, itemSel) => {
    if (!group) return;
    const ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true');
    group.prepend(ind); group.classList.add('seg');
    const place = () => {
      const on = group.querySelector(itemSel + '[aria-selected="true"]'); if (!on) return;
      ind.style.width = on.offsetWidth + 'px'; ind.style.height = on.offsetHeight + 'px';
      ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    };
    new MutationObserver(place).observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], childList: true });
    addEventListener('resize', place); setTimeout(place, 50); document.fonts?.ready.then(place);
  };
  setup(document.querySelector('.app-nav'), '.nav-i');
  setup(document.getElementById('days'), '.day');
})();

// ---------- spotlight on tiles, tilt on the journal entry ----------
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.metric, .src, .stat, .card'); if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--sx', e.clientX - r.left + 'px'); el.style.setProperty('--sy', e.clientY - r.top + 'px');
  }, { passive: true });
  const je = document.querySelector('.je');
  if (je) {
    je.addEventListener('pointermove', (e) => {
      if (e.target.closest('input, button, label')) return;
      const r = je.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      je.style.transform = `perspective(1100px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    });
    je.addEventListener('pointerleave', () => { je.style.transform = ''; });
  }
})();

// ---------- the bar steps aside while reading down, returns on the way up ----------
(() => {
  const bar = document.querySelector('.bar'); if (!bar) return;
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    bar.classList.toggle('away', y > 320 && y > lastY + 4);
    if (y < lastY - 4 || y < 320) bar.classList.remove('away');
    lastY = y;
  }, { passive: true });
})();

// ---------- the workbench runs its close controls once, the first time it is seen ----------
(() => {
  const app = document.getElementById('app'), run = document.getElementById('run-close');
  if (!app || !run || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    setTimeout(() => { if (run.textContent.trim() === 'Run close controls') run.click(); }, 600);
  }, { threshold: 0.25 });
  io.observe(app.closest('[data-reveal]') || app);
})();
