import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = 'https://bank-interview-advisor.com';
const guides = JSON.parse(await readFile(join(ROOT, 'src/data/page-guides.json'), 'utf8'));
const resourceGuides = JSON.parse(await readFile(join(ROOT, 'src/data/resource-guides.json'), 'utf8'));
const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
const sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/bank-interview-advisor\.com([^<]*)<\/loc>/g)].map((match) => match[1] || '/');
const noindexPaths = ['/privacy', '/terms', '/disclaimer'];
const paths = [...sitemapPaths, ...noindexPaths];

if (!sitemapPaths.length) throw new Error('check-prerender: sitemap contains no public routes');

const bodyText = (html) => {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

for (const path of paths) {
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, path.slice(1), 'index.html');
  const html = await readFile(file, 'utf8');
  const canonical = `${BASE}${path}`;
  const text = bodyText(html);

  if (!html.includes(`<link rel="canonical" href="${canonical}"`)) {
    throw new Error(`check-prerender: canonical mismatch for ${path}`);
  }
  if (!/<h1\b/i.test(html)) throw new Error(`check-prerender: missing h1 for ${path}`);
  if (/<div id="root"><\/div>/.test(html)) throw new Error(`check-prerender: empty root for ${path}`);
  if (text.length < 100) throw new Error(`check-prerender: body is too thin for ${path} (${text.length} chars)`);

  const guide = guides[path];
  if (guide && (!text.includes(guide.heading) || text.length < 300)) {
    throw new Error(`check-prerender: editorial guide missing or incomplete for ${path}`);
  }

  const resourceGuide = resourceGuides[path];
  if (resourceGuide && (!text.includes(resourceGuide.title) || text.length < 1000)) {
    throw new Error(`check-prerender: long-form resource missing or incomplete for ${path}`);
  }

  if (noindexPaths.includes(path)) {
    if (!html.includes('<meta name="robots" content="noindex, follow"')) {
      throw new Error(`check-prerender: missing noindex directive for ${path}`);
    }
    if (sitemapPaths.includes(path)) throw new Error(`check-prerender: noindex route is present in sitemap: ${path}`);
  }
}

for (const path of Object.keys(resourceGuides)) {
  if (!sitemapPaths.includes(path)) throw new Error(`check-prerender: resource guide missing from sitemap: ${path}`);
}

console.log(
  `checked prerendered HTML — ${sitemapPaths.length} indexable routes plus ${noindexPaths.length} policy routes contain canonical, h1 and crawlable body content`,
);
