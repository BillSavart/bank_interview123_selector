// Fetch https://www.tabf.org.tw/Exam.aspx (reachable from cloud runners) and emit
// the deduplicated recruitment listing JSON for POST /api/admin/calendar/alerts.
//
// Uses only Node built-ins + pure HTML parser (no pdf-parse needed).
// Usage:
//   node scripts/watch-tabf-exams.mjs                     # JSON to stdout
//   node scripts/watch-tabf-exams.mjs --out watch.json    # write to file

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseExamListingHtml } from './tabf-calendar-parser.mjs';

const execFileAsync = promisify(execFile);

const EXAM_LIST_URL = 'https://www.tabf.org.tw/Exam.aspx';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 2 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchExamListingHtml(retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        [
          '-fsSL',
          '--http1.1',
          '--proto',
          '=https',
          '--proto-redir',
          '=https',
          '--connect-timeout',
          '10',
          '--max-time',
          '20',
          '--max-filesize',
          String(MAX_HTML_BYTES),
          '-A',
          USER_AGENT,
          EXAM_LIST_URL,
        ],
        { encoding: 'utf8', maxBuffer: MAX_HTML_BYTES + 65_536 },
      );
      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}

async function main() {
  const args = process.argv.slice(2);
  let outFile = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outFile = args[++i];
    }
  }

  console.error(`[tabf-watch] fetching ${EXAM_LIST_URL}`);
  const html = await fetchExamListingHtml();
  const cards = parseExamListingHtml(html);
  console.error(`[tabf-watch] found ${cards.length} unique exams on Exam.aspx`);

  if (cards.length === 0) {
    throw new Error('Exam.aspx returned 0 recruitment cards; aborting alert check.');
  }

  const payload = {
    source: 'tabf',
    checkedAt: new Date().toISOString(),
    exams: cards.map(({ externalKey, slug, title, url, isRegistering }) => ({
      externalKey,
      slug,
      title,
      url,
      isRegistering,
    })),
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (outFile) {
    await writeFile(outFile, json, 'utf8');
    console.error(`[tabf-watch] wrote ${cards.length} exams to ${outFile}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(`[tabf-watch] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
