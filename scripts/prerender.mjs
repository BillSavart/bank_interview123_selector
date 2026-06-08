// Post-build prerender: emit a per-route dist/<route>/index.html whose <head>
// carries that page's title + Open Graph/Twitter meta. The SPA is client-
// rendered, so without this every shared link (LINE/FB/…) would show the
// homepage title — preview crawlers don't run our JS. Caddy's
// `try_files {path} {path}/index.html /index.html` serves these directly.
//
// Runs in `npm run build` after `vite build`. Real users still get the full
// SPA (the body is identical to index.html); only <head> differs per route.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = 'https://bank-interview-advisor.com';
const SITE = '公股銀行新手村';

// Home is already correct in dist/index.html (the source index.html defaults),
// so it's not regenerated here. slug → public/og/<slug>.png must exist.
const ROUTES = [
  { path: '/calendar',       slug: 'calendar',       title: '招考行事曆',     desc: '八大公股銀行報名、筆試、面試與放榜日期，一頁掌握。' },
  { path: '/scores-map',     slug: 'scores-map',     title: '筆試門檻',       desc: '以台灣地圖呈現八大公股行庫歷年各考區的筆試錄取分數。' },
  { path: '/number-trainer', slug: 'number-trainer', title: '大寫數字訓練器', desc: '練習壹貳參…金融大寫數字，銀行櫃檯與支票必備技能。' },
  { path: '/check-game',     slug: 'check-game',     title: '支票審查員',     desc: '模擬支票審查小遊戲，練習辨識票據填寫錯誤。' },
  { path: '/about',          slug: 'about',          title: '使用說明',       desc: '公股銀行新手村的各功能介紹與使用教學。' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace the content="" of a <meta name|property="key"> tag.
function setMeta(html, key, value) {
  const re = new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`prerender: meta "${key}" not found in index.html`);
  return html.replace(re, `$1${esc(value)}$2`);
}

const template = await readFile(join(DIST, 'index.html'), 'utf8');

for (const r of ROUTES) {
  const fullTitle = `${r.title} | ${SITE}`;
  const url = `${BASE}${r.path}`;
  const image = `${BASE}/og/${r.slug}.png`;

  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = setMeta(html, 'description', r.desc);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:title', fullTitle);
  html = setMeta(html, 'og:description', r.desc);
  html = setMeta(html, 'og:image', image);
  html = setMeta(html, 'twitter:title', fullTitle);
  html = setMeta(html, 'twitter:description', r.desc);
  html = setMeta(html, 'twitter:image', image);

  const out = join(DIST, r.path, 'index.html');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`prerendered ${r.path}/index.html — ${fullTitle}`);
}
