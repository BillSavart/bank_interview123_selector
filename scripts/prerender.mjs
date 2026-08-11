// Post-build prerender: emit a per-route dist/<route>/index.html whose <head>
// carries that page's title + Open Graph/Twitter meta and whose #root contains
// a concise, visible HTML version of the page's purpose and editorial guide.
// React replaces this fallback when JavaScript loads, while crawlers and users
// without JavaScript can still understand the page. Caddy serves these files
// directly instead of treating every route as the homepage shell.
//
// Only the map and calendar pages carry a share image (public/og/*.jpg);
// the rest get title + description text only, no thumbnail.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = 'https://bank-interview-advisor.com';
const SITE = '公股銀行新手村';
const PAGE_GUIDES = JSON.parse(await readFile(join(ROOT, 'src/data/page-guides.json'), 'utf8'));

const HOME = {
  path: '/',
  title: '公股銀行招考一站式準備',
  desc: '公股銀行招考一站式準備：面試口試題篩選、招考行事曆、筆試門檻地圖與上榜經驗分享，集中在一個地方。',
};

// Home is already correct in dist/index.html (the source index.html defaults),
// so it's not regenerated here. `image` (optional) → public/og/<file>.
const ROUTES = [
  { path: '/selector',       title: '面試題目篩選器', desc: '依考生背景排序 123 題公股銀行常見口試題，附答題方向與示範回答。' },
  { path: '/calendar',       title: '招考行事曆',     desc: '八大公股銀行報名、筆試、面試與放榜日期，一頁掌握。',     image: { file: 'calendar.jpg',   w: 1200, h: 938 } },
  { path: '/scores-map',     title: '筆試門檻',       desc: '以台灣地圖呈現八大公股行庫歷年各考區的筆試錄取分數。', image: { file: 'scores-map.jpg', w: 1200, h: 1200 } },
  { path: '/venues',         title: '試場資訊',       desc: '各家公股銀行招考各試場的面試情報彙整，題目方向與考驗重點一頁掌握。' },
  { path: '/official-doc-practice', title: '公文練習器', desc: '練習公股銀行與國營事業考試常見的簽與函題型，直接在真實公文格式中撰寫主旨與說明。' },
  { path: '/experience',     title: '經驗分享',       desc: '公股銀行考試篇與工作篇的第一手經驗分享。' },
  { path: '/salary',         title: '年薪計算機',     desc: '設定 1～30 年年資，試算公股銀行的總薪資、當年年薪與平均月領，含每年調薪 2% 與升等機制說明。' },
  { path: '/number-trainer', title: '大寫數字訓練器', desc: '練習壹貳參…金融大寫數字，銀行櫃檯與支票必備技能。' },
  { path: '/check-game',     title: '支票審查員',     desc: '模擬支票審查小遊戲，練習辨識票據填寫錯誤。' },
  { path: '/about',          title: '關於我們',       desc: '公股銀行新手村是非官方的公股銀行招考準備工具，集中題目、行事曆、門檻與心得；附各功能使用說明。' },
  { path: '/privacy',        title: '隱私權政策',     desc: '公股銀行新手村的隱私權政策：資料收集、Cookie、第三方服務（Google Analytics／AdSense）與你的選擇。' },
  { path: '/terms',          title: '服務條款',       desc: '公股銀行新手村的服務條款：服務說明、使用規範、投稿與留言規則、智慧財產權與責任限制。' },
  { path: '/disclaimer',     title: '免責聲明',       desc: '公股銀行新手村為非官方學習工具，內容僅供參考；招考資訊以各單位正式公告為準，不保證錄取。' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV_LINKS = [
  ['/', '首頁'],
  ['/selector', '面試題目'],
  ['/calendar', '招考行事曆'],
  ['/scores-map', '筆試門檻'],
  ['/venues', '試場資訊'],
  ['/official-doc-practice', '公文練習'],
  ['/experience', '經驗分享'],
];

function renderGuide(path) {
  const guide = PAGE_GUIDES[path];
  if (!guide) return '';

  const sections = guide.sections
    .map((section) => {
      const paragraphs = (section.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('\n');
      const bullets = section.bullets?.length
        ? `<ul>${section.bullets.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
        : '';
      return `<section class="page-guide-section">
<h3>${esc(section.heading)}</h3>
${paragraphs}
${bullets}
</section>`;
    })
    .join('\n');

  return `<section class="page-guide" aria-labelledby="page-guide-title">
<div class="container py-5">
<div class="page-guide-card">
<div class="page-guide-eyebrow">${esc(guide.eyebrow)}</div>
<h2 id="page-guide-title" class="page-guide-title">${esc(guide.heading)}</h2>
<p class="page-guide-intro">${esc(guide.intro)}</p>
<div class="page-guide-grid">${sections}</div>
<p class="page-guide-meta">內容整理：公股銀行新手村編輯　·　方法說明更新：${esc(guide.reviewed)}</p>
</div>
</div>
</section>`;
}

function renderFallback(route) {
  const nav = NAV_LINKS.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('　');
  return `<header class="container py-3"><nav aria-label="主要導覽">${nav}</nav></header>
<main class="site-main">
<article class="container py-4">
<p class="interview-kicker">公股銀行招考準備</p>
<h1 class="display-title mb-3">${esc(route.title)}</h1>
<p class="page-intro">${esc(route.desc)}</p>
</article>
${renderGuide(route.path)}
</main>
<footer class="site-footer">
<span>公股銀行新手村為非官方學習工具，正式資訊請以各招考單位公告為準。</span>
<nav aria-label="網站資訊"><a href="/about">關於我們</a>　<a href="/terms">服務條款</a>　<a href="/disclaimer">免責聲明</a>　<a href="/privacy">隱私權政策</a></nav>
</footer>`;
}

function setRootContent(html, content) {
  const re = /<div id="root">[\s\S]*?<\/div>/;
  if (!re.test(html)) throw new Error('prerender: #root not found in index.html');
  return html.replace(re, `<div id="root">${content}</div>`);
}

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

// Vite's homepage output also starts as an empty SPA shell. Give it the same
// crawlable, visible fallback as the other public routes.
await writeFile(join(DIST, 'index.html'), setRootContent(template, renderFallback(HOME)));
console.log(`prerendered homepage fallback — ${SITE}`);

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
  html = setRootContent(html, renderFallback(r));

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
