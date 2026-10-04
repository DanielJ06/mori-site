(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const threads = new WeakMap();

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

  /* Dot fields — shared by the horizon and the fields further down the page.
     Dots are 1.5px, snapped to whole device pixels so they stay crisp: 2px
     on standard displays, 3 device pixels on retina. Randomness is seeded,
     so a resize or a scroll redraws the same pattern instead of reshuffling it. */
  // Every field's dots: grey, some tinted with the accent. DOT_STRENGTH scales
  // them all at once; lower is quieter.
  const DOT_STRENGTH = 0.65;
  const dotColor = (tint, alpha) => (tint
    ? `rgba(122, 160, 238, ${(alpha + 0.08) * DOT_STRENGTH})`
    : `rgba(196, 204, 220, ${alpha * DOT_STRENGTH})`);

  const seeded = (seed) => {
    let state = seed;
    return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
  };

  const fitCanvas = (canvas) => {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return {
      ctx,
      width,
      height,
      dot: Math.max(2, Math.round(1.5 * dpr)) / dpr,
      snap: (v) => Math.round(v * dpr) / dpr,
    };
  };

  const onWidthChange = (callback) => {
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      callback();
    });
  };

  /* Horizon — an ordered-looking but random dot field: dense at the line,
     sparse as it rises, fading out toward the page's edges. */
  const field = document.querySelector('.horizon canvas');
  if (field) {
    const PITCH = 6;
    const drawField = () => {
      const { ctx, width, height, dot, snap } = fitCanvas(field);
      const rand = seeded(7);
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
          ctx.fillStyle = dotColor(tint, alpha);
          ctx.fillRect(snap(x), snap(y), dot, dot);
        }
      }
    };
    drawField();
    onWidthChange(drawField);
  }

  /* Fields — the same dots as the horizon, drawn from a progress t: 0 as the
     field enters the screen, 1 once it sits above the middle, so it moves
     with the reader's scroll.
       settle: loose dots fall into the page's 16px lattice, thinning out as
               they rise: ideas turning into structure.
       sides:  dense at the page's edges, thinning toward the middle, so the
               closing's copy has the dark to itself. */
  const fields = {
    settle(canvas, t) {
      const { ctx, width, height, dot, snap } = fitCanvas(canvas);
      const PITCH = 16;
      const cols = Math.floor(width / PITCH);
      const rows = Math.floor((height - 40) / PITCH);
      const left = (width - (cols - 1) * PITCH) / 2;
      const loose = 1 - t;
      const rand = seeded(11);

      for (let r = 0; r < rows; r++) {
        const depth = (r + 1) / rows;             // 0 at the top, 1 at the bottom
        for (let c = 0; c < cols; c++) {
          // Always draw the same numbers, so a dot keeps its identity as it moves.
          const n = rand();
          const jx = rand() - 0.5;
          const jy = rand() - 0.5;
          const tint = rand() < 0.1 + 0.25 * depth;
          const tone = rand();
          const edge = Math.min(1, Math.min(c, cols - 1 - c) / (cols * 0.16));
          // Under the essay's picture the dots lean to the right, then even out.
          const lean = (1 - depth) * (0.35 + (0.65 * c) / cols) + depth;
          if (n > (0.05 + 0.55 * depth ** 1.5) * edge * lean) continue;
          const reach = 56 * loose * (1.15 - depth);
          const x = left + c * PITCH + jx * reach;
          const y = r * PITCH + PITCH / 2 + jy * reach;
          const alpha = 0.14 + tone * 0.4 * (0.35 + depth * 0.65);
          ctx.fillStyle = dotColor(tint, alpha);
          ctx.fillRect(snap(x), snap(y), dot, dot);
        }
      }
    },

    sides(canvas, t) {
      const { ctx, width, height, dot, snap } = fitCanvas(canvas);
      const PITCH = 6;
      // The centre stays clear for the copy, and the field reaches a little
      // further in as it arrives. A phone has no margins to spare, so there
      // it takes a share of the width and lets the copy's edges overlap it.
      const room = width < 640 ? width * 0.3 : Math.min(width * 0.5, Math.max(40, (width - 380) / 2));
      const reach = room * (0.75 + 0.25 * t);
      const cols = Math.ceil(width / PITCH);
      const rows = Math.floor(height / PITCH);
      const rand = seeded(31);

      for (let r = 0; r < rows; r++) {
        const y = r * PITCH + PITCH / 2;
        const vertical = Math.min(1, Math.min(y, height - y) / (height * 0.3));
        for (let c = 0; c < cols; c++) {
          const n = rand();
          const tint = rand() < 0.14;
          const tone = rand();
          const x = c * PITCH + PITCH / 2;
          const inward = Math.min(x, width - x) / reach;  // 0 at the page's edge, 1 where the field ends
          if (inward >= 1) continue;
          if (n > (1 - inward) ** 1.5 * vertical * 0.85) continue;
          const alpha = (0.14 + tone * 0.4 * (0.4 + (1 - inward) * 0.6)) * (0.35 + (1 - inward) * 0.65);
          ctx.fillStyle = dotColor(tint, alpha);
          ctx.fillRect(snap(x), snap(y), dot, dot);
        }
      }
    },
  };

  document.querySelectorAll('[data-field]').forEach((canvas) => {
    const draw = fields[canvas.dataset.field];
    const box = canvas.parentElement;
    let visible = false;
    let queued = false;

    const progress = () => {
      const { top, height } = box.getBoundingClientRect();
      const centre = top + height / 2;
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh * 0.95 - centre) / (vh * 0.6)));
    };
    const paint = () => {
      queued = false;
      draw(canvas, reduceMotion ? 1 : progress());
    };
    const queue = () => {
      if (queued || !visible) return;
      queued = true;
      requestAnimationFrame(paint);
    };

    paint();
    onWidthChange(paint);
    if (reduceMotion) return;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      queue();
    }, { rootMargin: '10% 0px' }).observe(box);
    window.addEventListener('scroll', queue, { passive: true });
  });

  /* Nav — hairline once the page moves. */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Reveal on scroll. */
  document.querySelectorAll('.bento > .card').forEach((el, i) => el.style.setProperty('--d', `${(i % 2) * 70}ms`));
  document.querySelectorAll('.more > li').forEach((el, i) => el.style.setProperty('--d', `${(i % 3) * 70}ms`));
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

  const phone = window.matchMedia('(max-width: 640px)');

  // iOS only applies :active to a touch when something listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });

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
      suggest.hidden = false; // measured below, so shown first (same frame: it never paints unplaced)
      const ed = editor.getBoundingClientRect();
      const c = caret.getBoundingClientRect();
      const left = Math.min(c.left - ed.left - 14, ed.width - suggest.offsetWidth - 12);
      suggest.style.left = `${Math.max(12, left)}px`;
      suggest.style.top = `${c.bottom - ed.top + 6}px`;
      filter('');
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

    for (const char of suggest.dataset.query) {
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

  /* ───── Markdown card ─────
     The note is written in the markup as it rests, rendered. Once it's on
     screen it is emptied and typed back in: each piece of syntax ([data-md])
     shows while the caret is inside it and folds away once the caret leaves. */

  const mdPage = document.querySelector('.md-page');
  if (mdPage && !reduceMotion) runMarkdownDemo(mdPage);

  async function runMarkdownDemo(page) {
    const doc = page.querySelector('.md-doc');
    const caret = doc.querySelector('.caret');
    const task = doc.querySelector('.md-task');

    // Every text node in reading order, skipping the markup's whitespace between lines.
    const nodes = [];
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.parentElement !== doc) nodes.push(walker.currentNode);
    const texts = nodes.map((n) => n.data);
    const scopes = [...doc.querySelectorAll('[data-md]')];
    const lastNode = new Map(scopes.map((s) => [s, nodes.filter((n) => s.contains(n)).at(-1)]));

    nodes.forEach((n) => n.data = '');
    scopes.forEach((s) => s.classList.remove('is-done'));
    task.classList.remove('is-checked');
    [...doc.children].forEach((line) => line.classList.add('is-pending'));
    doc.firstElementChild.classList.remove('is-pending');
    doc.firstElementChild.prepend(caret);

    await new Promise((r) => onSeen(page, r, 0.6));
    await wait(600);

    let raw = null;
    let line = doc.firstElementChild;
    for (const [i, node] of nodes.entries()) {
      const next = node.parentElement.closest('.md-doc > *');
      if (next !== line) {
        await wait(500); // Return.
        line = next;
        line.classList.remove('is-pending');
      }

      const scope = node.parentElement.closest('[data-md]');
      if (scope !== raw) {
        raw?.classList.remove('is-raw');
        scope?.classList.add('is-raw');
        raw = scope;
      }

      // The caret never sits inside a mark, which folds to nothing.
      (node.parentElement.closest('.md-mark') ?? node).after(caret);

      caret.classList.add('is-typing');
      for (const char of texts[i]) {
        node.data += char;
        await wait(45 + Math.random() * 50 + (char === ' ' ? 34 : 0));
      }
      caret.classList.remove('is-typing');

      for (const [s, last] of lastNode) if (last === node) s.classList.add('is-done');
    }

    raw?.classList.remove('is-raw');
    await wait(1200);
    task.classList.add('is-checked');
  }

  /* ───── Highlight demos ─────
     Hover plays a card's demo and leaving rewinds it. Without hover,
     demos play a few times on their own while the card is on screen,
     then rest — nothing loops for good without a way to stop it. */

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const demos = {
    links: { hold: 2400, prepare: drawThread, start: startPulse, stop: stopPulse },
  };

  document.querySelectorAll('[data-demo]').forEach((card) => {
    const demo = demos[card.dataset.demo];
    const play = () => {
      demo.prepare?.(card);
      demo.start?.(card);
      card.classList.add('is-playing');
    };
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

    const PLAYS = 2;
    let timer = null;
    let plays = 0;

    // A tap is the touch screen's hover: it plays one more pass.
    let replay = null;
    card.addEventListener('click', () => {
      clearInterval(timer);
      clearTimeout(replay);
      plays = PLAYS;
      play();
      replay = setTimeout(rewind, demo.hold);
    });
    const io = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (!entry.isIntersecting) return rewind();
      if (plays >= PLAYS) return;
      play();
      plays++;
      timer = setInterval(() => {
        if (card.classList.contains('is-playing')) {
          rewind();
          if (plays >= PLAYS) clearInterval(timer);
        } else {
          play();
          plays++;
        }
      }, demo.hold);
    }, { threshold: 0.6 });
    io.observe(card);
  });

  /* ───── Themes deck, on a phone ─────
     The three notes stack; a tap sends the front one to the back. On first
     sight the deck deals itself once round, ending where it began. */

  const deck = document.querySelector('.deck');
  if (deck && phone.matches) runThemeDeck(deck);

  function runThemeDeck(deck) {
    const pages = [...deck.querySelectorAll('.t-page')];
    const depth = (page) => Number(page.style.getPropertyValue('--k'));
    let busy = false;

    const deal = async () => {
      if (busy) return;
      busy = true;
      const front = pages.find((page) => depth(page) === 0);
      if (!reduceMotion) {
        front.classList.add('is-leaving');
        await wait(240);
      }
      pages.forEach((page) => page.style.setProperty('--k', (depth(page) + pages.length - 1) % pages.length));
      front.classList.remove('is-leaving');
      await wait(reduceMotion ? 0 : 420);
      busy = false;
    };

    let auto = !reduceMotion;
    deck.closest('.card-visual').addEventListener('click', () => { auto = false; deal(); });
    if (!auto) return;
    onSeen(deck, async () => {
      for (let i = 0; i < pages.length && auto; i++) {
        await wait(i === 0 ? 900 : 2200);
        if (auto) await deal();
      }
    }, 0.6);
  }

  /* A hub and its spokes. Every note that links to the one in the middle gets
     a circuit-like line into it: out of the note's edge, along the gap, then
     into a port on the hub. Everything is measured from the layout, so the
     lines follow whatever the notes' widths turn out to be. */

  const SVG = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs = {}) => {
    const el = document.createElementNS(SVG, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  };

  // Straight segments through the points, each inner corner rounded.
  const roundedPath = (points, radius) => points.map(([x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!next) return `L ${x} ${y}`;
    const r = Math.min(radius, Math.hypot(x - prev[0], y - prev[1]) / 2, Math.hypot(next[0] - x, next[1] - y) / 2);
    const before = [x - Math.sign(x - prev[0]) * r, y - Math.sign(y - prev[1]) * r];
    const after = [x + Math.sign(next[0] - x) * r, y + Math.sign(next[1] - y) * r];
    return `L ${before[0]} ${before[1]} Q ${x} ${y} ${after[0]} ${after[1]}`;
  }).join(' ');

  function drawThread(card) {
    const stage = card.querySelector('.link-stage');
    const svg = stage.querySelector('.thread');
    const hub = card.querySelector('.n-hub').getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    if (!box.width) return;

    // [start, end] of each spoke, from the note's edge to its port on the hub:
    // notes above and below share the hub's top and bottom edges between them,
    // the ones beside it meet its sides head-on.
    const chips = [...stage.querySelectorAll('.n-chip')].map((el) => el.getBoundingClientRect());
    const hubMid = hub.top + hub.height / 2;
    const groups = { above: [], below: [], left: [], right: [] };
    chips.forEach((chip) => {
      const side = chip.bottom <= hub.top ? 'above' : chip.top >= hub.bottom ? 'below'
        : chip.left + chip.width / 2 < hub.left + hub.width / 2 ? 'left' : 'right';
      groups[side].push(chip);
    });

    const spokes = [];
    const add = (x1, y1, x2, y2) => spokes.push([[x1 - box.left, y1 - box.top], [x2 - box.left, y2 - box.top]]);
    ['above', 'below'].forEach((side) => {
      const group = groups[side].sort((a, b) => a.left - b.left);
      group.forEach((chip, i) => {
        const port = hub.left + (hub.width * (i + 1)) / (group.length + 1);
        add(chip.left + chip.width / 2, side === 'above' ? chip.bottom : chip.top, port, side === 'above' ? hub.top : hub.bottom);
      });
    });
    groups.left.forEach((chip) => add(chip.right, chip.top + chip.height / 2, hub.left, hubMid));
    groups.right.forEach((chip) => add(chip.left, chip.top + chip.height / 2, hub.right, hubMid));

    // The elements are made once, then only their geometry changes.
    if (!svg.querySelector('.thread-base')) {
      const defs = svgEl('defs');
      svg.append(defs);
      spokes.forEach((_, i) => {
        const gradient = svgEl('linearGradient', { id: `thread-pulse-${i}`, gradientUnits: 'userSpaceOnUse' });
        gradient.append(svgEl('stop', { 'stop-opacity': 0 }), svgEl('stop', { offset: 0.5 }), svgEl('stop', { offset: 1, 'stop-opacity': 0 }));
        defs.append(gradient);
        svg.append(
          svgEl('path', { class: 'thread-base' }),
          svgEl('path', { class: 'thread-pulse', stroke: `url(#thread-pulse-${i})` }),
        );
      });
    }

    const paths = svg.querySelectorAll('.thread-base, .thread-pulse');
    const lines = spokes.map(([[x1, y1], [x2, y2]], i) => {
      const jog = (y1 + y2) / 2;
      const d = roundedPath(Math.abs(x1 - x2) < 1 || Math.abs(y1 - y2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1, jog], [x2, jog], [x2, y2]], 10);
      paths[i * 2].setAttribute('d', d);
      paths[i * 2 + 1].setAttribute('d', d);

      const length = Math.hypot(x2 - x1, y2 - y1);
      return {
        gradient: svg.querySelector(`#thread-pulse-${i}`),
        x1, y1, length,
        ux: (x2 - x1) / length,
        uy: (y2 - y1) / length,
      };
    });

    // Mutated in place so a pulse already running picks up the new geometry.
    const t = threads.get(card) ?? { raf: 0, hovering: false, startedAt: 0, stopAt: Infinity };
    t.lines = lines;
    threads.set(card, t);
    if (!t.raf) setPulse(card, 0);
  }

  /* Like Rauno's Next.js pulse: each line's second path is stroked with a
     linearGradient (transparent → accent → transparent) whose x1/y1/x2/y2
     slide along the line's axis, so the glow travels while the base line
     stays still. Lines start a beat apart, so they don't pulse in unison. */
  const PULSE_TRAVEL = 1300;
  const PULSE_CYCLE = 1800;
  const PULSE_STAGGER = 140;
  const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

  function setPulse(card, elapsed) {
    const t = threads.get(card);
    t.lines.forEach((line, i) => {
      const local = elapsed - i * PULSE_STAGGER;
      const progress = local < 0 ? 0 : easeInOut(Math.min((local % PULSE_CYCLE) / PULSE_TRAVEL, 1));
      const band = line.length * 0.7;
      const head = -band + progress * (line.length + band);
      const set = (name, value) => line.gradient.setAttribute(name, value);
      set('x1', line.x1 + line.ux * head);
      set('y1', line.y1 + line.uy * head);
      set('x2', line.x1 + line.ux * (head + band));
      set('y2', line.y1 + line.uy * (head + band));
    });
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
      setPulse(card, elapsed);
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
