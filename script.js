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
  document.querySelectorAll('[data-enter]').forEach((el, i) => el.style.setProperty('--i', i));
  requestAnimationFrame(() => root.classList.add('is-ready'));

  /* Nav — hairline once the page moves. */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Reveal on scroll. */
  document.querySelectorAll('.bento > .card, .more > li').forEach((el, i) => el.style.setProperty('--d', `${(i % 2) * 70}ms`));

  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal]').forEach((el) => revealer.observe(el));

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

    for (const char of 'Cad') {
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

  const canHover = window.matchMedia('(hover: hover)').matches;

  const demos = {
    focus: { hold: 2600 },
    links: { hold: 2400, prepare: drawThread },
  };

  document.querySelectorAll('[data-demo]').forEach((card) => {
    const demo = demos[card.dataset.demo];
    const play = () => { demo.prepare?.(card); card.classList.add('is-playing'); };
    const rewind = () => card.classList.remove('is-playing');

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
  function drawThread(card) {
    const stage = card.querySelector('.link-stage');
    const path = card.querySelector('.thread path');
    const from = card.querySelector('.n-link').getClientRects();
    const to = card.querySelector('.n-back').getBoundingClientRect();
    const dot = card.querySelector('.thread circle');
    const box = stage.getBoundingClientRect();
    const last = from[from.length - 1];

    const x1 = last.left + last.width / 2 - box.left;
    const y1 = last.bottom - box.top + 2;
    const x2 = to.left - box.left + 2;
    const y2 = to.top + to.height / 2 - box.top;
    const d = `M ${x1} ${y1} C ${x1} ${y1 + 60}, ${x2 - 60} ${y2}, ${x2} ${y2}`;

    if (path.getAttribute('d') === d) return;
    path.setAttribute('d', d);
    dot.setAttribute('cx', x2);
    dot.setAttribute('cy', y2);
    const length = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.getBoundingClientRect();
    path.style.transition = '';
  }
})();
