import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = 'https://bank-interview-advisor.com';
const guides = JSON.parse(await readFile(join(ROOT, 'src/data/page-guides.json'), 'utf8'));
const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
const paths = [...sitemap.matchAll(/<loc>https:\/\/bank-interview-advisor\.com([^<]*)<\/loc>/g)].map((match) => match[1] || '/');

if (!paths.length) throw new Error('check-prerender: sitemap contains no public routes');

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
}

console.log(`checked prerendered HTML — ${paths.length} routes contain canonical, h1 and crawlable body content`);
