// Builds the site into dist/: one page per file in locales/, rendered from
// src/index.html, next to a copy of everything else in src/.
//
// The template's {{keys}} are the locale's strings, flattened to dotted paths
// ({"hero": {"tag": "ideas"}} → {{hero.tag}}), plus page.* filled in here.
// A key the template asks for and a locale lacks, or a string no page uses,
// fails the build, so the languages can't drift apart.
//
//   node build.mjs         build once
//   node build.mjs --dev   build, rebuild on every change, serve on :8000

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const SITE = 'https://mori.danieljesus.dev/';
const DEFAULT = 'en';
const SRC = 'src';
const LOCALES = 'locales';
const OUT = 'dist';
const TEMPLATE = 'index.html';

// Only the default page carries this: readers whose browser asks for another
// of the site's languages go to that page, unless they picked one in the footer.
const redirect = (pages) => `<script>
    (() => {
      const pages = ${JSON.stringify(pages)};
      let lang = null;
      try { lang = localStorage.getItem('lang'); } catch {}
      lang ??= (navigator.languages?.[0] ?? navigator.language ?? '').split('-')[0].toLowerCase();
      if (pages[lang]) location.replace(\`\${pages[lang]}\${location.search}\${location.hash}\`);
    })();
  </script>`;

const flatten =(object, prefix = '') => Object.entries(object).reduce((flat, [key, value]) => (
  typeof value === 'object'
    ? { ...flat, ...flatten(value, `${prefix}${key}.`) }
    : { ...flat, [`${prefix}${key}`]: value }
), {});

function build() {
  const template = fs.readFileSync(path.join(SRC, TEMPLATE), 'utf8');
  const locales = fs.readdirSync(LOCALES).filter((file) => file.endsWith('.json')).map((file) => {
    const code = path.basename(file, '.json');
    const strings = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8')));
    return { code, strings, path: code === DEFAULT ? '' : `${code}/` };
  });
  const others = (locale) => locales.filter((other) => other !== locale);

  const pages = locales.map((locale) => {
    const root = locale.path ? '../' : '';
    const page = {
      'page.lang': locale.strings['locale.lang'],
      'page.root': root,
      'page.url': SITE + locale.path,
      'page.ogLocale': locale.strings['locale.og'],
      'page.alternates': [
        ...locales.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${SITE}${l.path}">`),
        `<link rel="alternate" hreflang="x-default" href="${SITE}">`,
      ].join('\n  '),
      'page.ogAlternates': others(locale)
        .map((l) => `<meta property="og:locale:alternate" content="${l.strings['locale.og']}">`)
        .join('\n  '),
      'page.switcher': others(locale)
        .map((l) => `<a class="footer-lang" href="${root}${l.path}" hreflang="${l.code}" lang="${l.strings['locale.lang']}" data-lang="${l.code}">${l.strings['locale.name']}</a>`)
        .join('\n      '),
      'page.redirect': locale.path ? '' : redirect(Object.fromEntries(others(locale).map((l) => [l.code, l.path]))),
    };
    const values = { ...locale.strings, ...page };

    const missing = new Set();
    const used = new Set();
    const html = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
      if (!(key in values)) return missing.add(key), match;
      used.add(key);
      return values[key];
    });
    const unused = Object.keys(locale.strings).filter((key) => !used.has(key) && !key.startsWith('locale.'));

    const problems = [
      ...[...missing].map((key) => `missing "${key}"`),
      ...unused.map((key) => `unused "${key}"`),
    ];
    if (problems.length) throw new Error(`${LOCALES}/${locale.code}.json:\n  ${problems.join('\n  ')}`);
    return { file: path.join(OUT, locale.path, 'index.html'), html };
  });

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true, filter: (file) => path.relative(SRC, file) !== TEMPLATE });
  pages.forEach(({ file, html }) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  });
  console.log(`Built ${locales.map((l) => `/${l.path}`).join(', ')}`);
}

if (!process.argv.includes('--dev')) {
  build();
} else {
  const rebuild = () => {
    try { build(); } catch (error) { console.error(error.message); }
  };
  rebuild();

  let timer;
  [SRC, LOCALES].forEach((dir) => fs.watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 50);
  }));

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const out = path.resolve(OUT);
  http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = path.join(out, decodeURIComponent(pathname));
    if (!file.startsWith(out)) return res.writeHead(403).end();
    if (fs.statSync(file, { throwIfNoEntry: false })?.isDirectory()) {
      // Like GitHub Pages: a folder without its slash gets one, so relative links resolve.
      if (!pathname.endsWith('/')) return res.writeHead(301, { Location: `${pathname}/` }).end();
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end('Not found');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    });
  }).listen(8000, () => console.log('Serving on http://localhost:8000'));
}
