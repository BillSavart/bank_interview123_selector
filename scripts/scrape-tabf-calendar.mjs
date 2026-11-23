// Scrape 台灣金融研訓院 (TABF) 受託甄試專區 (https://www.tabf.org.tw/Exam.aspx)
// and each exam's 重要時程表 PDF into a JSON payload ready for POST /api/admin/calendar/sync.
//
// Usage:
//   node scripts/scrape-tabf-calendar.mjs                     # JSON to stdout
//   node scripts/scrape-tabf-calendar.mjs --out events.json   # write to file

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';
import {
  hasAnyCalendarDate,
  parseExamListingHtml,
  parseSchedulePageHtml,
  parseSchedulePdfData,
} from './tabf-calendar-parser.mjs';

const execFileAsync = promisify(execFile);

const EXAM_LIST_URL = 'https://www.tabf.org.tw/Exam.aspx';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const REQUEST_DELAY_MS = 350;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch via curl --http1.1 because svc.tabf.org.tw intermittently sends HTTP/2
// RST_STREAM (CANCEL) to automated clients while HTTP/1.1 succeeds reliably.
async function fetchBuffer(url, { maxBytes = MAX_PDF_BYTES, retries = 2 } = {}) {
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
          String(Math.ceil(FETCH_TIMEOUT_MS / 1000)),
          '--max-filesize',
          String(maxBytes),
          '-A',
          USER_AGENT,
          url,
        ],
        { encoding: 'buffer', maxBuffer: maxBytes + 65_536 },
      );
      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchText(url) {
  const buf = await fetchBuffer(url, { maxBytes: 2 * 1024 * 1024 });
  return buf.toString('utf8');
}

async function scrapeOneExam(card) {
  const scheduleHtml = await fetchText(card.scheduleUrl);
  const { pdfUrl, pageTitle } = parseSchedulePageHtml(scheduleHtml, card.scheduleUrl);
  if (!pdfUrl) {
    throw new Error(`Schedule PDF link not found at ${card.scheduleUrl}`);
  }

  await sleep(REQUEST_DELAY_MS);
  const pdfBuf = await fetchBuffer(pdfUrl, { maxBytes: MAX_PDF_BYTES });
  if (pdfBuf.length < 100 || pdfBuf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(`Downloaded schedule is not a valid PDF (${pdfUrl})`);
  }

  const parser = new PDFParse({ data: pdfBuf });
  try {
    // Run sequentially: PDFParse transfers its underlying buffer on first load,
    // so calling getTable() and getText() concurrently triggers DataCloneError.
    const tableResult = await parser.getTable();
    const textResult = await parser.getText();
    const tables = (tableResult?.pages || []).flatMap((p) => p.tables || []);
    const text = textResult?.text || '';
    const title = card.title || pageTitle;
    return parseSchedulePdfData({
      tables,
      text,
      title,
      url: card.url,
      slug: card.slug,
    });
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let outFile = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outFile = args[++i];
    }
  }

  console.error(`[tabf-scraper] fetching ${EXAM_LIST_URL}`);
  const listingHtml = await fetchText(EXAM_LIST_URL);
  const cards = parseExamListingHtml(listingHtml);
  console.error(`[tabf-scraper] found ${cards.length} unique exams on Exam.aspx`);

  if (cards.length === 0) {
    throw new Error('Exam.aspx returned 0 recruitment cards; refusing to produce an empty sync.');
  }

  const events = [];
  const failures = [];

  for (const card of cards) {
    try {
      await sleep(REQUEST_DELAY_MS);
      const event = await scrapeOneExam(card);
      if (!hasAnyCalendarDate(event)) {
        console.error(`[tabf-scraper] skip (no parseable dates): ${card.slug} ${card.title}`);
        failures.push({ slug: card.slug, reason: 'no dates extracted' });
        continue;
      }
      events.push(event);
      console.error(
        `[tabf-scraper] ok ${card.slug}: ${event.org} | 報名 ${event.signupStart || '-'}~${event.signupEnd || '-'} | 筆試 ${event.writtenExam || '-'} | 面試 ${event.interview || '-'} | 放榜 ${event.finalResult || '-'}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[tabf-scraper] fail ${card.slug} (${card.title}): ${msg}`);
      failures.push({ slug: card.slug, reason: msg });
    }
  }

  if (events.length === 0) {
    throw new Error(`All ${cards.length} exams failed to parse; aborting sync.`);
  }
  if (failures.length > cards.length / 2) {
    throw new Error(`Too many failures (${failures.length}/${cards.length}); aborting sync to avoid partial data.`);
  }

  const payload = {
    source: 'tabf',
    scrapedAt: new Date().toISOString(),
    events,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (outFile) {
    await writeFile(outFile, json, 'utf8');
    console.error(`[tabf-scraper] wrote ${events.length} events (${failures.length} failed) to ${outFile}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(`[tabf-scraper] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
