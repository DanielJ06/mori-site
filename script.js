(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* Run a callback once the element is mostly on screen. */
  const onSeen = (el, callback, threshold = 0.5) => {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      callback();
    }, { threshold });
    io.observe(el);
  };

  /* Entrance — stagger the hero in reading order. */
  document.querySelectorAll('[data-enter]').forEach((el, i) => {
    el.style.setProperty('--i', i);
    // Once settled, hand the element back to its resting styles.
    el.addEventListener('animationend', function done(e) {
      if (e.target !== el) return;
      el.removeAttribute('data-enter');
      el.removeEventListener('animationend', done);
    });
  });
  requestAnimationFrame(() => root.classList.add('is-ready'));

  /* Horizon — an ordered-looking but random dot field: dense at the line,
     sparse as it rises, fading out toward the page's edges. Seeded, so a
     resize redraws the same pattern instead of reshuffling it. */
  const field = document.querySelector('.horizon canvas');
  if (field) {
    const PITCH = 6;
    const drawField = () => {
      const { width, height } = field.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      field.width = Math.round(width * dpr);
      field.height = Math.round(height * dpr);
      const ctx = field.getContext('2d');
      ctx.scale(dpr, dpr);
      // 1.5px, snapped to whole device pixels so dots stay crisp: 2px on
      // standard displays, 3 device pixels on retina.
      const DOT = Math.max(2, Math.round(1.5 * dpr)) / dpr;
      const snap = (v) => Math.round(v * dpr) / dpr;

      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const cols = Math.ceil(width / PITCH);
      const rows = Math.floor(height / PITCH);

      for (let r = 0; r < rows; r++) {
        const y = height - 4 - r * PITCH;
        const rise = 1 - r / rows;               // 1 at the line, 0 at the top
        const vertical = rise ** 2.4;
        for (let c = 0; c < cols; c++) {
          // Sample from the centre outward so both sides mirror in density.
          const x = c * PITCH + PITCH / 2;
          const edge = Math.min(x, width - x) / (width * 0.18);
          const horizontal = Math.min(1, edge);
          const n = rand();
          if (n > vertical * horizontal * 0.85) continue;
          const tint = rand() < 0.12 + 0.3 * rise;
          const alpha = 0.16 + rand() * 0.42 * (0.4 + rise * 0.6);
          ctx.fillStyle = tint ? `rgba(122, 160, 238, ${alpha + 0.08})` : `rgba(196, 204, 220, ${alpha})`;
          ctx.fillRect(snap(x), snap(y), DOT, DOT);
        }
      }
    };
    drawField();
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      drawField();
    });
  }

  /* Nav — hairline once the page moves. */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Reveal on scroll. */
  document.querySelectorAll('.bento > .card').forEach((el, i) => el.style.setProperty('--d', `${(i % 2) * 70}ms`));
  document.querySelectorAll('.more > li').forEach((el, i) => el.style.setProperty('--d', `${(i % 2) * 70}ms`));

  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal]').forEach((el) => revealer.observe(el));

  /* Press G to see the page's grid: 12 columns, an 8px rhythm. */
  let overlay = null;
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (overlay) { overlay.remove(); overlay = null; return; }
    overlay = document.createElement('div');
    overlay.className = 'grid-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.height = `${document.documentElement.scrollHeight}px`;
    overlay.innerHTML = `<div class="wrap">${'<i></i>'.repeat(12)}</div>`;
    document.body.append(overlay);
  });

  /* ───── Comfort card ─────
     The app's Ajustes, applied to the page of text beside them. */

  const reader = document.querySelector('.reader');
  if (reader) {
    const options = reader.querySelectorAll('[data-appearance-option]');
    const size = reader.querySelector('[data-size]');
    const sizeOut = reader.querySelector('[data-size-out]');

    options.forEach((b) => b.addEventListener('click', () => {
      reader.dataset.appearance = b.dataset.appearanceOption;
      options.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    }));

    const setSize = () => {
      reader.style.setProperty('--size', `${size.value}px`);
      size.style.setProperty('--value', size.value);
      sizeOut.textContent = `${size.value} pt`;
    };
    size.addEventListener('input', setSize);
    setSize();
  }

  // Radio groups move with arrow keys.
  document.querySelectorAll('[role="radiogroup"]').forEach((group) => {
    group.addEventListener('keydown', (e) => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      if (!keys.includes(e.key)) return;
      const items = [...group.querySelectorAll('[role="radio"]')];
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = items[(items.indexOf(document.activeElement) + step + items.length) % items.length];
      e.preventDefault();
      next.focus();
      next.click();
    });
  });

  /* ───── Hero editor ─────
     Type a sentence, open wikilink suggestions, pick one. */

  const editor = document.querySelector('.w-editor');
  if (editor) runEditorDemo(editor);

  async function runEditorDemo(editor) {
    const typed = editor.querySelector('.typed');
    const typedEnd = editor.querySelector('.typed-end');
    const link = editor.querySelector('.wikilink');
    const caret = editor.querySelector('.caret');
    const suggest = editor.querySelector('.suggest');
    const rows = [...suggest.querySelectorAll('.s-row')];
    const task = editor.querySelector('[data-task="1"]');
    const prefix = typed.dataset.final;

    if (reduceMotion) {
      typed.textContent = prefix;
      link.hidden = false;
      typedEnd.textContent = typedEnd.dataset.final;
      task.classList.add('is-done');
      return;
    }

    const type = async (el, text, base = 55) => {
      caret.classList.add('is-typing');
      for (const char of text) {
        el.textContent += char;
        await wait(base + Math.random() * base * 0.8 + (char === ' ' ? 30 : 0));
      }
      caret.classList.remove('is-typing');
    };

    const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

    const filter = (query) => {
      const q = normalize(query);
      let first = null;
      rows.forEach((row) => {
        const match = !q || normalize(row.dataset.title).split(/\s+/).some((w) => w.startsWith(q));
        row.hidden = !match;
        row.classList.remove('is-active');
        if (match && !first) first = row;
      });
      first?.classList.add('is-active');
    };

    const openSuggest = () => {
      const ed = editor.getBoundingClientRect();
      const c = caret.getBoundingClientRect();
      const left = Math.min(c.left - ed.left - 14, ed.width - 232 - 12);
      suggest.style.left = `${Math.max(12, left)}px`;
      suggest.style.top = `${c.bottom - ed.top + 6}px`;
      filter('');
      suggest.hidden = false;
    };

    const closeSuggest = async () => {
      suggest.classList.add('is-leaving');
      await wait(120);
      suggest.hidden = true;
      suggest.classList.remove('is-leaving');
    };

    await Promise.all([wait(1600), new Promise((r) => onSeen(editor.querySelector('.w-live'), r, 0.6))]);
    await wait(500);
    await type(typed, prefix);
    await wait(260);
    await type(typed, '[[', 90);
    openSuggest();
    await wait(700);

    for (const char of 'Bol') {
      caret.classList.add('is-typing');
      typed.textContent += char;
      filter(typed.textContent.split('[[')[1]);
      await wait(130 + Math.random() * 60);
    }
    caret.classList.remove('is-typing');
    await wait(650);

    // Enter: the query collapses into a resolved link.
    typed.textContent = prefix;
    link.hidden = false;
    link.classList.add('is-new');
    closeSuggest();
    await wait(420);
    await type(typedEnd, typedEnd.dataset.final);
    await wait(1100);
    task.classList.add('is-done');
  }

  /* ───── Highlight demos ─────
     Hover plays a card's demo and leaving rewinds it. Without hover,
     demos play on their own while the card is on screen. */

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const demos = {
    focus: { hold: 2600 },
    links: { hold: 2400, prepare: drawThread, start: startPulse, stop: stopPulse },
  };

  document.querySelectorAll('[data-demo]').forEach((card) => {
    const demo = demos[card.dataset.demo];
    const play = () => { demo.prepare?.(card); demo.start?.(card); card.classList.add('is-playing'); };
    const rewind = () => { demo.stop?.(card); card.classList.remove('is-playing'); };

    // The thread rests on screen, so it is drawn up front and kept in step with the layout.
    if (demo.prepare) {
      new ResizeObserver(() => demo.prepare(card)).observe(card.querySelector('.link-stage'));
      document.fonts?.ready.then(() => demo.prepare(card));
    }

    if (reduceMotion) return;

    if (canHover) {
      card.addEventListener('pointerenter', play);
      card.addEventListener('pointerleave', rewind);
      return;
    }

    let timer = null;
    const io = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (!entry.isIntersecting) return rewind();
      play();
      timer = setInterval(() => (card.classList.contains('is-playing') ? rewind() : play()), demo.hold);
    }, { threshold: 0.6 });
    io.observe(card);
  });

  /* A curve from the link in one note to its backlink in the other. */
  const threads = new WeakMap();

  function drawThread(card) {
    const stage = card.querySelector('.link-stage');
    const [base, pulse] = card.querySelectorAll('.thread path');
    const from = card.querySelector('.n-link').getClientRects();
    const to = card.querySelector('.n-back').getBoundingClientRect();
    const dot = card.querySelector('.thread circle');
    const box = stage.getBoundingClientRect();
    const last = from[from.length - 1];
    if (!box.width || !last) return;

    const x1 = last.left + last.width / 2 - box.left;
    const y1 = last.bottom - box.top + 2;
    const x2 = to.left - box.left + 2;
    const y2 = to.top + to.height / 2 - box.top;
    // Straight down from the link, one rounded corner, then straight into the backlink.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const r = Math.max(0, Math.min(12, Math.abs(dx), dy));
    const dir = Math.sign(dx) || 1;
    const d = `M ${x1} ${y1} V ${y2 - r} Q ${x1} ${y2} ${x1 + dir * r} ${y2} H ${x2}`;

    if (base.getAttribute('d') === d) return;
    base.setAttribute('d', d);
    pulse.setAttribute('d', d);
    dot.setAttribute('cx', x2);
    dot.setAttribute('cy', y2);

    const length = Math.hypot(x2 - x1, y2 - y1);
    // Mutated in place so a pulse already running picks up the new geometry.
    const t = threads.get(card) ?? { raf: 0, hovering: false, startedAt: 0, stopAt: Infinity };
    Object.assign(t, {
      gradient: card.querySelector('#thread-pulse'),
      x1, y1, length,
      ux: (x2 - x1) / length,
      uy: (y2 - y1) / length,
    });
    threads.set(card, t);
    if (!t.raf) setPulse(card, 0);
  }

  /* Like Rauno's Next.js pulse: a second path is stroked with a linearGradient
     (transparent → accent → transparent) whose x1/y1/x2/y2 slide along the
     thread's axis, so the glow travels while the base line stays still. */
  const PULSE_TRAVEL = 1300;
  const PULSE_CYCLE = 1800;
  const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

  function setPulse(card, progress) {
    const t = threads.get(card);
    const band = t.length * 0.7;
    const head = -band + progress * (t.length + band);
    const set = (name, value) => t.gradient.setAttribute(name, value);
    set('x1', t.x1 + t.ux * head);
    set('y1', t.y1 + t.uy * head);
    set('x2', t.x1 + t.ux * (head + band));
    set('y2', t.y1 + t.uy * (head + band));
  }

  function startPulse(card) {
    const t = threads.get(card);
    if (!t) return;
    t.hovering = true;
    t.stopAt = Infinity;
    if (t.raf) return;
    t.startedAt = performance.now();

    const tick = (now) => {
      const elapsed = now - t.startedAt;
      // Letting go finishes the pass in flight instead of cutting it off.
      if (!t.hovering && elapsed >= t.stopAt) {
        t.raf = 0;
        return setPulse(card, 0);
      }
      setPulse(card, easeInOut(Math.min((elapsed % PULSE_CYCLE) / PULSE_TRAVEL, 1)));
      t.raf = requestAnimationFrame(tick);
    };
    t.raf = requestAnimationFrame(tick);
  }

  function stopPulse(card) {
    const t = threads.get(card);
    if (!t) return;
    t.hovering = false;
    t.stopAt = Math.ceil((performance.now() - t.startedAt) / PULSE_CYCLE) * PULSE_CYCLE;
  }
})();
