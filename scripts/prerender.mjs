// Post-build prerender: emit a per-route dist/<route>/index.html whose <head>
// carries that page's title + Open Graph/Twitter meta. The SPA is client-
// rendered, so without this every shared link (LINE/FB/…) would show the
// homepage title — preview crawlers don't run our JS. Caddy's
// `try_files {path} {path}/index.html /index.html` serves these directly.
//
// Runs in `npm run build` after `vite build`. Real users still get the full
// SPA (the body is identical to index.html); only <head> differs per route.
//
// Only the map and calendar pages carry a share image (public/og/*.jpg);
// the rest get title + description text only, no thumbnail.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = 'https://bank-interview-advisor.com';
const SITE = '公股銀行新手村';

// Home is already correct in dist/index.html (the source index.html defaults),
// so it's not regenerated here. `image` (optional) → public/og/<file>.
const ROUTES = [
  { path: '/selector',       title: '面試題目篩選器', desc: '依考生背景排序 123 題公股銀行常見口試題，附答題方向與示範回答。' },
  { path: '/calendar',       title: '招考行事曆',     desc: '八大公股銀行報名、筆試、面試與放榜日期，一頁掌握。',     image: { file: 'calendar.jpg',   w: 1200, h: 938 } },
  { path: '/scores-map',     title: '筆試門檻',       desc: '以台灣地圖呈現八大公股行庫歷年各考區的筆試錄取分數。', image: { file: 'scores-map.jpg', w: 1200, h: 1200 } },
  { path: '/venues',         title: '試場資訊',       desc: '各家公股銀行招考各試場的面試情報彙整，題目方向與考驗重點一頁掌握。' },
  { path: '/experience',     title: '經驗分享',       desc: '公股銀行考試篇與工作篇的第一手經驗分享。' },
  { path: '/number-trainer', title: '大寫數字訓練器', desc: '練習壹貳參…金融大寫數字，銀行櫃檯與支票必備技能。' },
  { path: '/check-game',     title: '支票審查員',     desc: '模擬支票審查小遊戲，練習辨識票據填寫錯誤。' },
  { path: '/about',          title: '關於我們',       desc: '公股銀行新手村是非官方的公股銀行招考準備工具，集中題目、行事曆、門檻與心得；附各功能使用說明。' },
  { path: '/privacy',        title: '隱私權政策',     desc: '公股銀行新手村的隱私權政策：資料收集、Cookie、第三方服務（Google Analytics／AdSense）與你的選擇。' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace the content="" of a <meta name|property="key"> tag.
function setMeta(html, key, value) {
  const re = new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`prerender: meta "${key}" not found in index.html`);
  return html.replace(re, `$1${esc(value)}$2`);
}

// Point <link rel="canonical"> at this route's clean URL.
function setCanonical(html, url) {
  const re = /(<link rel="canonical" href=")[^"]*(")/;
  if (!re.test(html)) throw new Error('prerender: <link rel="canonical"> not found in index.html');
  return html.replace(re, `$1${esc(url)}$2`);
}

const template = await readFile(join(DIST, 'index.html'), 'utf8');

for (const r of ROUTES) {
  const fullTitle = `${r.title} | ${SITE}`;
  const url = `${BASE}${r.path}`;

  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = setMeta(html, 'description', r.desc);
  html = setCanonical(html, url);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:title', fullTitle);
  html = setMeta(html, 'og:description', r.desc);
  html = setMeta(html, 'twitter:title', fullTitle);
  html = setMeta(html, 'twitter:description', r.desc);

  // The template ships the brand share card (og/home.jpg) as the default; routes
  // with their own thumbnail just overwrite the image meta, others inherit it.
  if (r.image) {
    const img = `${BASE}/og/${r.image.file}`;
    html = setMeta(html, 'og:image', img);
    html = setMeta(html, 'og:image:width', String(r.image.w));
    html = setMeta(html, 'og:image:height', String(r.image.h));
    html = setMeta(html, 'twitter:image', img);
  }

  const out = join(DIST, r.path, 'index.html');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`prerendered ${r.path}/index.html — ${fullTitle}${r.image ? ' [+og image]' : ''}`);
}

// sitemap.xml — homepage + every prerendered route. lastmod is the build date;
// our routes are static pages, so a single shared date is fine. robots.txt
// (in public/) points crawlers here.
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', ...ROUTES.map((r) => r.path)];
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map((p) => `  <url><loc>${BASE}${p}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n') +
  '\n</urlset>\n';
await writeFile(join(DIST, 'sitemap.xml'), sitemap);
console.log(`wrote sitemap.xml — ${urls.length} URLs`);
