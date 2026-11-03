// Bank of Taiwan (臺灣銀行) branch queue collector, daily factual aggregator, and read-only query store.
//
// Core principles:
// 1. Zero impact on Bank of Taiwan's system:
//    - Strictly read-only (hard whitelist on __EVENTTARGET and hfKEY === '').
//    - Session-Pinned `lbtRenew` caching (1 lightweight POST per branch after warm-up).
//    - Single-fiber sequential execution (concurrency = 1) with polite jitter.
//    - Circuit breaker on slow responses (>3.5s) or HTTP errors (15-min cooldown).
//    - Strict business-hours gate (Monday–Friday 08:55–17:00 Asia/Taipei).
// 2. 100% Factual Statistics Only (Zero modeled/estimated metrics):
//    - Only records and aggregates actual observed waiting headcounts and total called numbers.

import https from 'node:https';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'bot-branches-seed.json');

export const defaultBotQueueDbFile =
  process.env.BOT_QUEUE_DB_FILE ||
  (process.env.NODE_ENV === 'production'
    ? '/data/bot_queue.db'
    : join(__dirname, '..', 'bot-queue-analytics', 'data', 'bot_queue.db'));

const BASE_URL = 'https://ino.bot.com.tw/INOWeb';
const DEFAULT_URL = `${BASE_URL}/Default.aspx`;
const BRANCH_URL = `${BASE_URL}/ImmOrder/Branch.aspx`;
const SERVICE_URL = `${BASE_URL}/ImmOrder/Service.aspx`;

const ALLOWED_POSTBACK_TARGETS = new Set([
  'lbtImmOrder',
  'lbtSearch',
  'lbtSearch2',
  'lbtCheck',
  'lbtRenew',
]);

// TWCA / GRCA intermediate certificate on ino.bot.com.tw is often missing from minimal container CA bundles.
const botHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 1,
  rejectUnauthorized: false,
});

const CITY_ORDER = [
  '台北市',
  '新北市',
  '基隆市',
  '桃園市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '台中市',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '台南市',
  '高雄市',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
];

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS branches (
    branch_id            TEXT PRIMARY KEY,
    branch_name          TEXT NOT NULL,
    city                 TEXT NOT NULL DEFAULT '',
    phone                TEXT NOT NULL DEFAULT '',
    address              TEXT NOT NULL DEFAULT '',
    is_disabled_on_site  INTEGER NOT NULL DEFAULT 0,
    active               INTEGER NOT NULL DEFAULT 1,
    first_seen_at        TEXT NOT NULL,
    last_seen_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_types (
    branch_id            TEXT NOT NULL,
    service_code         TEXT NOT NULL,
    service_name         TEXT NOT NULL,
    service_desc         TEXT NOT NULL DEFAULT '',
    slot_class           TEXT NOT NULL DEFAULT 's1',
    active               INTEGER NOT NULL DEFAULT 1,
    first_seen_at        TEXT NOT NULL,
    last_seen_at         TEXT NOT NULL,
    PRIMARY KEY (branch_id, service_code),
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at           TEXT NOT NULL,
    finished_at          TEXT NULL,
    mode                 TEXT NOT NULL DEFAULT 'all_enabled',
    total_targets        INTEGER NOT NULL DEFAULT 0,
    success_count        INTEGER NOT NULL DEFAULT 0,
    failure_count        INTEGER NOT NULL DEFAULT 0,
    renew_hit_count      INTEGER NOT NULL DEFAULT 0,
    http_status_summary  TEXT NULL,
    error_summary        TEXT NULL
);

CREATE TABLE IF NOT EXISTS queue_snapshots (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id             TEXT NOT NULL,
    service_code          TEXT NOT NULL,
    observed_at           TEXT NOT NULL,
    source_reported_at    TEXT NULL,
    current_ticket_raw    TEXT NULL,
    ticket_prefix         TEXT NULL,
    ticket_number         INTEGER NULL,
    waiting_count         INTEGER NULL,
    page_valid            INTEGER NOT NULL DEFAULT 1,
    status                TEXT NOT NULL,
    crawl_run_id          INTEGER NOT NULL,
    source_hash           TEXT NULL,
    UNIQUE(branch_id, service_code, observed_at),
    FOREIGN KEY (crawl_run_id) REFERENCES crawl_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_branch_service_time
    ON queue_snapshots(branch_id, service_code, observed_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_observed_at
    ON queue_snapshots(observed_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_reported_at
    ON queue_snapshots(branch_id, service_code, source_reported_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
    date_local                TEXT NOT NULL,
    branch_id                 TEXT NOT NULL,
    service_code              TEXT NOT NULL,
    first_observed_at         TEXT NULL,
    last_observed_at          TEXT NULL,
    avg_waiting_count         REAL NULL,
    min_waiting_count         INTEGER NULL,
    max_waiting_count         INTEGER NULL,
    max_waiting_at            TEXT NULL,
    peak_hour_local           TEXT NULL,
    total_called_count        INTEGER NULL,
    updated_at                TEXT NOT NULL,
    PRIMARY KEY (date_local, branch_id, service_code)
);

CREATE TABLE IF NOT EXISTS session_cache (
    branch_id             TEXT PRIMARY KEY,
    cookies_json          TEXT NOT NULL,
    hidden_fields_json    TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
`;

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function getTaipeiNowParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    dateLocal: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday, // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    hour,
    minute,
    second,
    hm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    hms: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
  };
}

export function isWithinBusinessHours(now = new Date(), startHm = '08:55', endHm = '17:00') {
  const p = getTaipeiNowParts(now);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') {
    return { allowed: false, reason: `Weekend (${p.weekday})` };
  }
  if (p.hm < startHm || p.hm > endHm) {
    return { allowed: false, reason: `Outside business hours (${p.hm} not in ${startHm}..${endHm})` };
  }
  return { allowed: true, reason: `Within business hours (${p.hm})` };
}

export function loadSeedBranches() {
  if (!existsSync(SEED_PATH)) return [];
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const rawList = Array.isArray(seed) ? seed : Array.isArray(seed.branches) ? seed.branches : [];
  return rawList.map((b) => {
    const disabled = b.is_disabled_on_site || b.disabled ? 1 : 0;
    return {
      branch_id: String(b.branch_id),
      branch_name: String(b.branch_name || ''),
      city: String(b.city || ''),
      phone: String(b.phone || ''),
      address: String(b.address || ''),
      is_disabled_on_site: disabled,
      active: disabled ? 0 : 1,
    };
  });
}

export function openBotQueueDb(file = defaultBotQueueDbFile) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const Database = require('better-sqlite3');
  const db = new Database(file);

  const cols = db
    .prepare('PRAGMA table_info(daily_metrics)')
    .all()
    .map((r) => r.name);
  if (
    cols.length > 0 &&
    (cols.includes('estimated_wait_minutes') ||
      cols.includes('official_wait_samples') ||
      cols.includes('zero_wait_samples') ||
      cols.includes('ticket_span') ||
      cols.includes('sample_count'))
  ) {
    db.exec('DROP TABLE daily_metrics');
  }

  const snapCols = db
    .prepare('PRAGMA table_info(queue_snapshots)')
    .all()
    .map((r) => r.name);
  if (snapCols.includes('official_wait_minutes')) {
    db.exec('ALTER TABLE queue_snapshots DROP COLUMN official_wait_minutes');
  }

  db.exec(SCHEMA_SQL);
  seedBranchesIfNeeded(db);
  return db;
}

export function seedBranchesIfNeeded(db) {
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM branches').get();
  if (countRow && countRow.cnt >= 160) return countRow.cnt;
  const branches = loadSeedBranches();
  if (branches.length === 0) return 0;

  const now = utcNowIso();
  const upsert = db.prepare(`
    INSERT INTO branches (
      branch_id, branch_name, city, phone, address,
      is_disabled_on_site, active, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(branch_id) DO UPDATE SET
      branch_name = excluded.branch_name,
      city = CASE WHEN excluded.city != '' THEN excluded.city ELSE branches.city END,
      phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE branches.phone END,
      address = CASE WHEN excluded.address != '' THEN excluded.address ELSE branches.address END,
      is_disabled_on_site = excluded.is_disabled_on_site,
      active = excluded.active,
      last_seen_at = excluded.last_seen_at
  `);

  const tx = db.transaction((items) => {
    for (const b of items) {
      upsert.run(
        b.branch_id,
        b.branch_name,
        b.city,
        b.phone,
        b.address,
        b.is_disabled_on_site,
        b.active,
        now,
        now,
      );
    }
  });
  tx(branches);
  return branches.length;
}

function unescapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractHiddenFields(htmlText) {
  const fields = {};
  const tagRe = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m;
  while ((m = tagRe.exec(htmlText)) !== null) {
    const tag = m[0];
    const nameM = /name=["']([^"']+)["']/i.exec(tag) || /id=["']([^"']+)["']/i.exec(tag);
    const valM = /value=["']([^"']*)["']/i.exec(tag);
    if (nameM) {
      fields[nameM[1]] = valM ? unescapeHtml(valM[1]) : '';
    }
  }
  return fields;
}

export function parseTicketString(raw) {
  if (raw == null) return [null, null];
  const cleaned = String(raw).trim();
  if (!cleaned) return [null, null];
  if (/^\d+$/.test(cleaned)) {
    const num = Number.parseInt(cleaned, 10);
    const prefix = cleaned.length >= 4 ? cleaned.slice(0, 2) : '00';
    return [prefix, num];
  }
  const m = /^([A-Za-z]+)(\d+)$/.exec(cleaned);
  if (m) {
    return [m[1].toUpperCase(), Number.parseInt(m[2], 10)];
  }
  return [null, null];
}

export function parseReportedTimeIso(rawTime) {
  if (!rawTime) return null;
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(rawTime.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`;
}

export function parseServicePageHtml(htmlText, branchId = '') {
  const sourceHash = createHash('sha256').update(htmlText, 'utf8').digest('hex').slice(0, 16);

  if (
    htmlText.includes('action="./Default.aspx"') ||
    htmlText.includes('SessionLogout.aspx') ||
    (htmlText.includes('id="lbtImmOrder"') && !htmlText.includes('id="lbBrname"'))
  ) {
    return {
      branchId,
      branchName: null,
      phone: null,
      address: null,
      dataTimeRaw: null,
      sourceReportedAt: null,
      pageValid: false,
      closeMessage: null,
      status: 'session_expired',
      sourceHash,
      services: [],
    };
  }

  const brnameM = /<span[^>]+id=["']lbBrname["'][^>]*>([^<]*)<\/span>/i.exec(htmlText);
  const lbtimeM = /<span[^>]+id=["']lbTime["'][^>]*>([^<]*)<\/span>/i.exec(htmlText);
  const phoneM = /<span[^>]+id=["']lbPhone["'][^>]*>([^<]*)<\/span>/i.exec(htmlText);
  const addrM = /<span[^>]+id=["']lbAddr["'][^>]*>([^<]*)<\/span>/i.exec(htmlText);
  const validM = /<input[^>]+id=["']hfPageValid["'][^>]+value=["']([^"']*)["']/i.exec(htmlText);
  const closeM = /<div[^>]+id=["']CLOSEMESSAGE["'][^>]*>([^<]*)<\/div>/i.exec(htmlText);

  const branchName = brnameM ? unescapeHtml(brnameM[1]).trim() : null;
  const dataTimeRaw = lbtimeM ? unescapeHtml(lbtimeM[1]).trim() : null;
  const sourceReportedAt = parseReportedTimeIso(dataTimeRaw);
  const phone = phoneM ? unescapeHtml(phoneM[1]).trim() : null;
  const address = addrM ? unescapeHtml(addrM[1]).trim() : null;
  const pageValid = validM ? validM[1].trim().toLowerCase() === 'true' : true;
  const closeMessage = closeM ? unescapeHtml(closeM[1]).trim() : null;

  if (!branchName && !dataTimeRaw) {
    return {
      branchId,
      branchName: null,
      phone: null,
      address: null,
      dataTimeRaw: null,
      sourceReportedAt: null,
      pageValid: false,
      closeMessage,
      status: 'parse_error',
      sourceHash,
      services: [],
    };
  }

  const blockRe =
    /<div\s+class=["']service\s+(s\d+t?)["']\s*>([\s\S]*?)(?=<div\s+class=["']service\s+s\d+t?["']|<div\s+class=["']center_area\s+service_area["']|<input[^>]+name=["']hfKEY["'])/gi;
  const services = [];
  let m;
  let idx = 0;

  while ((m = blockRe.exec(htmlText)) !== null) {
    idx += 1;
    const slotClass = m[1].trim();
    const block = m[2];

    const titleM = /<p\s+class=["']service_title["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const tyM = /<p\s+class=["']service_ty["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const twM = /<p\s+class=["']service_tw[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const tcM = /<p\s+class=["']service_tc[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const keyM = /data-order-key=["']([^"']+)["']/i.exec(block);

    const serviceName = titleM
      ? unescapeHtml(titleM[1].replace(/<[^>]+>/g, '')).trim()
      : `業務_${idx}`;

    let serviceDesc = '';
    if (tyM) {
      const rawDesc = unescapeHtml(
        tyM[1].replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, ''),
      ).replace(/\u00a0/g, ' ');
      serviceDesc = rawDesc
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean)
        .join(' / ');
    }

    const serviceCode = keyM ? keyM[1].trim() : `slot_${idx}`;
    const currentTicketRaw = twM
      ? unescapeHtml(twM[1].replace(/<[^>]+>/g, '')).trim()
      : null;
    const [ticketPrefix, ticketNumber] = parseTicketString(currentTicketRaw);

    let waitingCount = null;
    if (tcM) {
      const tcText = unescapeHtml(tcM[1].replace(/<[^>]+>/g, '')).trim();
      const numM = /\d+/.exec(tcText);
      if (numM) waitingCount = Number.parseInt(numM[0], 10);
    }

    let rowStatus = 'parse_error';
    if (waitingCount !== null && currentTicketRaw) {
      rowStatus = 'ok';
    } else if (!pageValid) {
      rowStatus = 'closed';
    }

    services.push({
      serviceCode,
      serviceName,
      serviceDesc,
      slotClass,
      currentTicketRaw,
      ticketPrefix,
      ticketNumber,
      waitingCount,
      status: rowStatus,
    });
  }

  let overallStatus = 'parse_error';
  if (services.some((s) => s.status === 'ok')) {
    overallStatus = 'ok';
  } else if (!pageValid || services.some((s) => s.status === 'closed')) {
    overallStatus = 'closed';
  }

  return {
    branchId,
    branchName,
    phone,
    address,
    dataTimeRaw,
    sourceReportedAt,
    pageValid,
    closeMessage,
    status: overallStatus,
    sourceHash,
    services,
  };
}

export function assertReadOnlyPost(formData) {
  const target = (formData.__EVENTTARGET || '').trim();
  if (!ALLOWED_POSTBACK_TARGETS.has(target)) {
    throw new Error(`SAFETY LOCK: PostBack target '${target}' is not in the read-only whitelist.`);
  }
  const hfKey = (formData.hfKEY || '').trim();
  if (hfKey !== '') {
    throw new Error(`SAFETY LOCK: Non-empty hfKEY ('${hfKey}') is strictly forbidden.`);
  }
}

function parseTimeFromIso(tsStr) {
  if (!tsStr) return null;
  const m = /T(\d{2}):(\d{2}):(\d{2})/.exec(tsStr);
  if (m) {
    return {
      hms: `${m[1]}:${m[2]}:${m[3]}`,
      hour: Number.parseInt(m[1], 10),
    };
  }
  return null;
}

export function computeServiceDailyMetric(dateLocal, branchId, serviceCode, snapshots) {
  const validRows = [];
  for (const row of snapshots) {
    if (row.status !== 'ok') continue;
    if (row.waiting_count == null) continue;
    const tsIso = row.source_reported_at || row.observed_at;
    const t = parseTimeFromIso(tsIso);
    if (!t) continue;
    validRows.push({ tsIso, hms: t.hms, hour: t.hour, row });
  }

  validRows.sort((a, b) => a.hms.localeCompare(b.hms));
  const sampleCount = validRows.length;

  if (sampleCount === 0) {
    return {
      date_local: dateLocal,
      branch_id: branchId,
      service_code: serviceCode,
      first_observed_at: null,
      last_observed_at: null,
      avg_waiting_count: null,
      min_waiting_count: null,
      max_waiting_count: null,
      max_waiting_at: null,
      peak_hour_local: null,
      total_called_count: null,
    };
  }

  const firstObservedAt = validRows[0].hms;
  const lastObservedAt = validRows[validRows.length - 1].hms;

  const waitingValues = validRows.map((v) => Number(v.row.waiting_count));
  const sumWait = waitingValues.reduce((a, b) => a + b, 0);
  const avgWaitingCount = Math.round((sumWait / sampleCount) * 100) / 100;
  const minWaitingCount = Math.min(...waitingValues);
  const maxWaitingCount = Math.max(...waitingValues);

  const maxWaitingAt =
    validRows.find((v) => Number(v.row.waiting_count) === maxWaitingCount)?.hms || null;

  const hourlyBuckets = new Map();
  for (const v of validRows) {
    const list = hourlyBuckets.get(v.hour) || [];
    list.push(Number(v.row.waiting_count));
    hourlyBuckets.set(v.hour, list);
  }

  let bestHour = validRows[0].hour;
  let bestAvg = -1;
  let bestMax = -1;
  for (const [hour, list] of hourlyBuckets.entries()) {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    const max = Math.max(...list);
    if (
      avg > bestAvg ||
      (avg === bestAvg && max > bestMax) ||
      (avg === bestAvg && max === bestMax && hour < bestHour)
    ) {
      bestHour = hour;
      bestAvg = avg;
      bestMax = max;
    }
  }
  const peakHourLocal = `${String(bestHour).padStart(2, '0')}:00-${String((bestHour + 1) % 24).padStart(2, '0')}:00`;

  const ticketRows = validRows.filter(
    (v) => v.row.current_ticket_raw != null && String(v.row.current_ticket_raw).trim() !== '',
  );
  let totalCalledCount = null;
  if (ticketRows.length > 0) {
    const firstR = ticketRows[0].row;
    const lastR = ticketRows[ticketRows.length - 1].row;
    const nFirst = firstR.ticket_number;
    const nLast = lastR.ticket_number;
    const pFirst = firstR.ticket_prefix;
    const pLast = lastR.ticket_prefix;
    if (nFirst != null && nLast != null) {
      const sameSeries =
        pFirst === pLast ||
        (pFirst != null &&
          pLast != null &&
          /^\d+$/.test(String(pFirst)) &&
          /^\d+$/.test(String(pLast)) &&
          String(pFirst)[0] === String(pLast)[0]);
      if (sameSeries && Number(nLast) >= Number(nFirst)) {
        totalCalledCount = Number(nLast) - Number(nFirst);
      }
    }
  }

  return {
    date_local: dateLocal,
    branch_id: branchId,
    service_code: serviceCode,
    first_observed_at: firstObservedAt,
    last_observed_at: lastObservedAt,
    avg_waiting_count: avgWaitingCount,
    min_waiting_count: minWaitingCount,
    max_waiting_count: maxWaitingCount,
    max_waiting_at: maxWaitingAt,
    peak_hour_local: peakHourLocal,
    total_called_count: totalCalledCount,
  };
}

export function aggregateDailyForDate(db, dateLocal) {
  const branchRows = db
    .prepare(
      `
      SELECT DISTINCT branch_id
      FROM queue_snapshots
      WHERE service_code != '__BRANCH__'
        AND (
          substr(source_reported_at, 1, 10) = ?
          OR (source_reported_at IS NULL AND substr(observed_at, 1, 10) = ?)
        )
      ORDER BY branch_id ASC
    `,
    )
    .all(dateLocal, dateLocal);

  const selectBranchSnaps = db.prepare(
    `
      SELECT
        branch_id,
        service_code,
        observed_at,
        source_reported_at,
        current_ticket_raw,
        ticket_prefix,
        ticket_number,
        waiting_count,
        status
      FROM queue_snapshots
      WHERE branch_id = ?
        AND service_code != '__BRANCH__'
        AND (
          substr(source_reported_at, 1, 10) = ?
          OR (source_reported_at IS NULL AND substr(observed_at, 1, 10) = ?)
        )
      ORDER BY observed_at ASC
    `,
  );

  const computed = [];
  for (const { branch_id: bId } of branchRows) {
    const rows = selectBranchSnaps.all(bId, dateLocal, dateLocal);
    const grouped = new Map();
    for (const r of rows) {
      const list = grouped.get(r.service_code) || [];
      list.push(r);
      grouped.set(r.service_code, list);
    }
    for (const [serviceCode, snapList] of grouped.entries()) {
      const metric = computeServiceDailyMetric(dateLocal, bId, serviceCode, snapList);
      if (metric.first_observed_at !== null) {
        computed.push(metric);
      }
    }
  }

  if (computed.length > 0) {
    const now = utcNowIso();
    const upsert = db.prepare(`
      INSERT INTO daily_metrics (
        date_local, branch_id, service_code,
        first_observed_at, last_observed_at,
        avg_waiting_count, min_waiting_count, max_waiting_count,
        max_waiting_at, peak_hour_local, total_called_count,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date_local, branch_id, service_code) DO UPDATE SET
        first_observed_at = excluded.first_observed_at,
        last_observed_at = excluded.last_observed_at,
        avg_waiting_count = excluded.avg_waiting_count,
        min_waiting_count = excluded.min_waiting_count,
        max_waiting_count = excluded.max_waiting_count,
        max_waiting_at = excluded.max_waiting_at,
        peak_hour_local = excluded.peak_hour_local,
        total_called_count = excluded.total_called_count,
        updated_at = excluded.updated_at
    `);
    const tx = db.transaction((items) => {
      for (const m of items) {
        upsert.run(
          m.date_local,
          m.branch_id,
          m.service_code,
          m.first_observed_at,
          m.last_observed_at,
          m.avg_waiting_count,
          m.min_waiting_count,
          m.max_waiting_count,
          m.max_waiting_at,
          m.peak_hour_local,
          m.total_called_count,
          now,
        );
      }
    });
    tx(computed);
  }

  return computed;
}

export function getBotQueueSummary(db, { date = '', city = '', branchId = '', serviceName = '' } = {}) {
  const counts = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_disabled_on_site = 0 THEN 1 ELSE 0 END) AS enabled,
        SUM(CASE WHEN is_disabled_on_site = 1 THEN 1 ELSE 0 END) AS disabled
      FROM branches
    `,
    )
    .get();

  const availableDates = db
    .prepare('SELECT DISTINCT date_local FROM daily_metrics ORDER BY date_local DESC LIMIT 90')
    .all()
    .map((r) => r.date_local);

  const selectedDate = date && availableDates.includes(date) ? date : availableDates[0] || getTaipeiNowParts().dateLocal;

  let mSql = `
    SELECT
      m.date_local,
      m.branch_id,
      b.branch_name,
      b.city,
      s.service_name,
      m.first_observed_at,
      m.last_observed_at,
      m.avg_waiting_count,
      m.min_waiting_count,
      m.max_waiting_count,
      m.max_waiting_at,
      m.peak_hour_local,
      m.total_called_count,
      m.updated_at
    FROM daily_metrics m
    LEFT JOIN branches b ON b.branch_id = m.branch_id
    LEFT JOIN service_types s ON s.branch_id = m.branch_id AND s.service_code = m.service_code
    WHERE m.date_local = ?
  `;
  const params = [selectedDate];

  if (city) {
    mSql += ' AND b.city = ?';
    params.push(city);
  }
  if (branchId) {
    mSql += ' AND m.branch_id = ?';
    params.push(branchId);
  }
  if (serviceName) {
    mSql += ' AND s.service_name = ?';
    params.push(serviceName);
  }
  mSql += ' ORDER BY COALESCE(m.total_called_count, -1) DESC, COALESCE(m.avg_waiting_count, -1) DESC, m.branch_id ASC';

  const dailyMetrics = db.prepare(mSql).all(...params);

  const servicesOnDate = db
    .prepare(
      `
      SELECT DISTINCT s.service_name
      FROM daily_metrics m
      JOIN service_types s ON s.branch_id = m.branch_id AND s.service_code = m.service_code
      WHERE m.date_local = ? AND s.service_name != ''
      ORDER BY s.service_name ASC
    `,
    )
    .all(selectedDate)
    .map((r) => r.service_name);

  const branches = db
    .prepare(
      `
      SELECT branch_id, branch_name, city, phone, address, is_disabled_on_site
      FROM branches
      ORDER BY branch_id ASC
    `,
    )
    .all();

  const presentCities = new Set(branches.map((b) => b.city).filter(Boolean));
  const cities = [
    ...CITY_ORDER.filter((c) => presentCities.has(c)),
    ...[...presentCities].filter((c) => !CITY_ORDER.includes(c)),
  ];

  const lastRun = db
    .prepare(
      `
      SELECT id, started_at, finished_at, mode, total_targets, success_count, failure_count, renew_hit_count, http_status_summary, error_summary
      FROM crawl_runs
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .get();

  const nowParts = getTaipeiNowParts();
  const gate = isWithinBusinessHours();

  return {
    available_dates: availableDates,
    selected_date: selectedDate,
    branch_counts: {
      total: counts?.total || 0,
      enabled: counts?.enabled || 0,
      disabled: counts?.disabled || 0,
    },
    cities,
    services: servicesOnDate,
    daily_metrics: dailyMetrics,
    branches,
    last_run: lastRun || null,
    scheduler: {
      enabled: process.env.BOT_QUEUE_SCHEDULER !== '0' && process.env.BOT_QUEUE_SCHEDULER !== 'false',
      mode: process.env.BOT_QUEUE_MODE || 'all_enabled',
      interval_min: Math.max(5, Number(process.env.BOT_QUEUE_INTERVAL_MIN || 10)),
      business_hours: 'Mon-Fri 08:55-17:00 (Asia/Taipei)',
      taipei_now: `${nowParts.dateLocal} ${nowParts.hms} (${nowParts.weekday})`,
      within_business_hours: gate.allowed,
      in_progress: crawlInProgress,
      skip_partial_date: '2026-11-02',
    },
  };
}

export function getBotBranchHistory(db, branchId) {
  const branch = db
    .prepare('SELECT branch_id, branch_name, city, phone, address, is_disabled_on_site FROM branches WHERE branch_id = ?')
    .get(branchId);
  if (!branch) return null;

  const history = db
    .prepare(
      `
      SELECT
        m.date_local,
        m.branch_id,
        s.service_name,
        m.first_observed_at,
        m.last_observed_at,
        m.avg_waiting_count,
        m.min_waiting_count,
        m.max_waiting_count,
        m.max_waiting_at,
        m.peak_hour_local,
        m.total_called_count
      FROM daily_metrics m
      LEFT JOIN service_types s ON s.branch_id = m.branch_id AND s.service_code = m.service_code
      WHERE m.branch_id = ?
      ORDER BY m.date_local DESC, s.service_name ASC
      LIMIT 180
    `,
    )
    .all(branchId);

  return { branch, history };
}

// --- Low-impact HTTP client & Session-Pinned lbtRenew collector --------------

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function requestHttp(urlStr, { method = 'GET', headers = {}, body = null, cookies = {}, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    const reqHeaders = {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...headers,
    };

    const started = Date.now();
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
        agent: botHttpsAgent,
        timeout: timeoutMs,
      },
      (res) => {
        const setCookie = res.headers['set-cookie'];
        const updatedCookies = { ...cookies };
        if (Array.isArray(setCookie)) {
          for (const sc of setCookie) {
            const firstPart = sc.split(';')[0];
            const eqIdx = firstPart.indexOf('=');
            if (eqIdx > 0) {
              updatedCookies[firstPart.slice(0, eqIdx).trim()] = firstPart.slice(eqIdx + 1).trim();
            }
          }
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const elapsedMs = Date.now() - started;
          resolve({
            statusCode: res.statusCode || 200,
            location: res.headers.location || null,
            text,
            cookies: updatedCookies,
            elapsedMs,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

async function fetchHttpWithRedirects(urlStr, opts = {}, maxRedirects = 5) {
  let currentUrl = urlStr;
  let currentMethod = opts.method || 'GET';
  let currentBody = opts.body || null;
  let currentHeaders = { ...(opts.headers || {}) };
  let currentCookies = { ...(opts.cookies || {}) };
  let totalElapsedMs = 0;

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await requestHttp(currentUrl, {
      method: currentMethod,
      headers: currentHeaders,
      body: currentBody,
      cookies: currentCookies,
      timeoutMs: opts.timeoutMs || 12000,
    });
    totalElapsedMs += res.elapsedMs;
    currentCookies = res.cookies;

    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.location) {
      currentUrl = new URL(res.location, currentUrl).toString();
      if ([301, 302, 303].includes(res.statusCode)) {
        currentMethod = 'GET';
        currentBody = null;
        delete currentHeaders['Content-Type'];
        delete currentHeaders['Content-Length'];
      }
      continue;
    }
    return { ...res, finalUrl: currentUrl, elapsedMs: totalElapsedMs };
  }
  throw new Error('Too many redirects');
}

async function postForm(urlStr, formFields, cookies, referer = urlStr) {
  assertReadOnlyPost(formFields);

  const encoded = new URLSearchParams(formFields).toString();
  return fetchHttpWithRedirects(urlStr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(encoded)),
      Origin: 'https://ino.bot.com.tw',
      Referer: referer,
    },
    body: encoded,
    cookies,
  });
}

export async function fetchBranchServiceColdStart(branchId, branchName = '') {
  let maxStepElapsedMs = 0;
  const r1 = await fetchHttpWithRedirects(DEFAULT_URL);
  maxStepElapsedMs = Math.max(maxStepElapsedMs, r1.elapsedMs);
  const u1 = r1.finalUrl || DEFAULT_URL;
  const h1 = extractHiddenFields(r1.text);

  await sleep(400);
  const p1 = {
    __EVENTTARGET: 'lbtImmOrder',
    __EVENTARGUMENT: '',
    __VIEWSTATE: h1.__VIEWSTATE || '',
    __VIEWSTATEGENERATOR: h1.__VIEWSTATEGENERATOR || '',
    __EVENTVALIDATION: h1.__EVENTVALIDATION || '',
    txtPhone1: '',
    txtPhone2: '',
    txtCAPTCHA: '',
    IMMORDER: '',
    IMMORDER_BRN: '',
    RSVORDER_BRN: '',
    ACTION: '',
  };
  const r2 = await postForm(u1, p1, r1.cookies, u1);
  maxStepElapsedMs = Math.max(maxStepElapsedMs, r2.elapsedMs);
  const branchUrl = r2.finalUrl || BRANCH_URL;
  const h2 = extractHiddenFields(r2.text);

  await sleep(400);
  const kw = branchName || (branchId === '003' ? '營業部' : '分行');
  const pKw = {
    __EVENTTARGET: 'lbtSearch2',
    __EVENTARGUMENT: '',
    __VIEWSTATE: h2.__VIEWSTATE || '',
    __VIEWSTATEGENERATOR: h2.__VIEWSTATEGENERATOR || '',
    __EVENTVALIDATION: h2.__EVENTVALIDATION || '',
    txtKey: kw,
    selCity: '',
    selArea: '',
    selCity2: '',
    selArea2: '',
    txtaddr: '',
    hfBRNO: '',
    hfBRNO2: '',
    hfCITY: '',
    hfAREA: '',
    hfLONG: '',
    hfLATI: '',
    hfTAB: '1',
  };
  const r3 = await postForm(branchUrl, pKw, r2.cookies, branchUrl);
  maxStepElapsedMs = Math.max(maxStepElapsedMs, r3.elapsedMs);
  const branchUrl2 = r3.finalUrl || branchUrl;
  const h3 = extractHiddenFields(r3.text);

  await sleep(400);
  const pCheck = {
    __EVENTTARGET: 'lbtCheck',
    __EVENTARGUMENT: '',
    __VIEWSTATE: h3.__VIEWSTATE || '',
    __VIEWSTATEGENERATOR: h3.__VIEWSTATEGENERATOR || '',
    __EVENTVALIDATION: h3.__EVENTVALIDATION || '',
    txtKey: kw,
    selCity: '',
    selArea: '',
    brn: branchId,
    selCity2: '',
    selArea2: '',
    txtaddr: '',
    hfBRNO: branchId,
    hfBRNO2: '',
    hfCITY: '',
    hfAREA: '',
    hfLONG: '',
    hfLATI: '',
    hfTAB: '1',
  };
  const r4 = await postForm(branchUrl2, pCheck, r3.cookies, branchUrl2);
  maxStepElapsedMs = Math.max(maxStepElapsedMs, r4.elapsedMs);
  return {
    statusCode: r4.statusCode,
    text: r4.text,
    cookies: r4.cookies,
    hiddenFields: extractHiddenFields(r4.text),
    elapsedMs: maxStepElapsedMs,
    usedRenewCache: false,
  };
}

export async function fetchBranchServiceWithCache(db, branchId, branchName = '') {
  const cached = db
    .prepare('SELECT cookies_json, hidden_fields_json FROM session_cache WHERE branch_id = ?')
    .get(branchId);

  if (cached) {
    try {
      const cookies = JSON.parse(cached.cookies_json);
      const hidden = JSON.parse(cached.hidden_fields_json);
      if (hidden.__VIEWSTATE) {
        const pRenew = {
          __EVENTTARGET: 'lbtRenew',
          __EVENTARGUMENT: '',
          __VIEWSTATE: hidden.__VIEWSTATE || '',
          __VIEWSTATEGENERATOR: hidden.__VIEWSTATEGENERATOR || '',
          __EVENTVALIDATION: hidden.__EVENTVALIDATION || '',
          hfKEY: '',
        };
        const rRenew = await postForm(SERVICE_URL, pRenew, cookies, SERVICE_URL);
        const parsed = parseServicePageHtml(rRenew.text, branchId);
        if ((parsed.status === 'ok' || parsed.status === 'closed') && parsed.services.length > 0) {
          const newHidden = extractHiddenFields(rRenew.text);
          db.prepare(
            `
            INSERT INTO session_cache (branch_id, cookies_json, hidden_fields_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(branch_id) DO UPDATE SET
              cookies_json = excluded.cookies_json,
              hidden_fields_json = excluded.hidden_fields_json,
              updated_at = excluded.updated_at
          `,
          ).run(branchId, JSON.stringify(rRenew.cookies), JSON.stringify(newHidden), utcNowIso());

          return {
            statusCode: rRenew.statusCode,
            parsed,
            elapsedMs: rRenew.elapsedMs,
            usedRenewCache: true,
          };
        }
      }
    } catch {
      // Fall back to cold start
    }
  }

  const cold = await fetchBranchServiceColdStart(branchId, branchName);
  const parsed = parseServicePageHtml(cold.text, branchId);
  if ((parsed.status === 'ok' || parsed.status === 'closed') && parsed.services.length > 0 && cold.hiddenFields.__VIEWSTATE) {
    db.prepare(
      `
      INSERT INTO session_cache (branch_id, cookies_json, hidden_fields_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(branch_id) DO UPDATE SET
        cookies_json = excluded.cookies_json,
        hidden_fields_json = excluded.hidden_fields_json,
        updated_at = excluded.updated_at
    `,
    ).run(branchId, JSON.stringify(cold.cookies), JSON.stringify(cold.hiddenFields), utcNowIso());
  }

  return {
    statusCode: cold.statusCode,
    parsed,
    elapsedMs: cold.elapsedMs,
    usedRenewCache: false,
  };
}

export function saveBranchPageResult(db, crawlRunId, result, observedAt = utcNowIso()) {
  let inserted = 0;
  const tx = db.transaction(() => {
    if (!result.services || result.services.length === 0) {
      return;
    }
    for (const svc of result.services) {
      let resolvedCode = svc.serviceCode;
      if (resolvedCode.startsWith('slot_') && svc.serviceName) {
        const known = db
          .prepare(
            `
            SELECT service_code FROM service_types
            WHERE branch_id = ? AND service_name = ? AND service_code NOT LIKE 'slot_%'
            ORDER BY service_code ASC LIMIT 1
          `,
          )
          .get(result.branchId, svc.serviceName);
        if (known) resolvedCode = String(known.service_code);
      }

      if (svc.status === 'closed' && svc.waitingCount === null && !svc.currentTicketRaw) {
        continue;
      }

      db.prepare(
        `
        INSERT INTO service_types (
          branch_id, service_code, service_name, service_desc,
          slot_class, active, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(branch_id, service_code) DO UPDATE SET
          service_name = excluded.service_name,
          service_desc = CASE WHEN excluded.service_desc != '' THEN excluded.service_desc ELSE service_types.service_desc END,
          slot_class = excluded.slot_class,
          active = 1,
          last_seen_at = excluded.last_seen_at
      `,
      ).run(
        result.branchId,
        resolvedCode,
        svc.serviceName,
        svc.serviceDesc,
        svc.slotClass,
        observedAt,
        observedAt,
      );

      if (result.sourceReportedAt) {
        const dup = db
          .prepare(
            `
            SELECT id FROM queue_snapshots
            WHERE branch_id = ? AND service_code = ? AND source_reported_at = ?
            LIMIT 1
          `,
          )
          .get(result.branchId, resolvedCode, result.sourceReportedAt);
        if (dup) continue;
      }

      db.prepare(
        `
        INSERT OR IGNORE INTO queue_snapshots (
          branch_id, service_code, observed_at, source_reported_at,
          current_ticket_raw, ticket_prefix, ticket_number,
          waiting_count, page_valid, status, crawl_run_id, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        result.branchId,
        resolvedCode,
        observedAt,
        result.sourceReportedAt,
        svc.currentTicketRaw,
        svc.ticketPrefix,
        svc.ticketNumber,
        svc.waitingCount,
        result.pageValid ? 1 : 0,
        svc.status,
        crawlRunId,
        result.sourceHash,
      );
      inserted += 1;
    }
  });
  tx();
  return inserted;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let circuitCooldownUntil = 0;
let crawlInProgress = false;

export async function runCrawlOnce(db, { mode = 'all_enabled', forceOffHours = false } = {}) {
  if (crawlInProgress) {
    return { status: 'skipped_already_running' };
  }
  if (Date.now() < circuitCooldownUntil) {
    return { status: 'skipped_circuit_breaker' };
  }
  if (!forceOffHours) {
    const gate = isWithinBusinessHours();
    if (!gate.allowed) {
      return { status: 'skipped_off_hours', reason: gate.reason };
    }
  }

  crawlInProgress = true;
  try {
    const pilotIds = ['003', '007', '012', '064', '205'];
    const targetBranches =
      mode === 'pilot'
        ? db
            .prepare(
              `SELECT branch_id, branch_name FROM branches WHERE active = 1 AND is_disabled_on_site = 0 AND branch_id IN (${pilotIds.map(() => '?').join(',')}) ORDER BY branch_id`,
            )
            .all(...pilotIds)
        : db
            .prepare(
              'SELECT branch_id, branch_name FROM branches WHERE active = 1 AND is_disabled_on_site = 0 ORDER BY branch_id',
            )
            .all();

    const runInfo = db
      .prepare('INSERT INTO crawl_runs (started_at, mode, total_targets) VALUES (?, ?, ?)')
      .run(utcNowIso(), mode, targetBranches.length);
    const crawlRunId = Number(runInfo.lastInsertRowid);

    let successCount = 0;
    let failureCount = 0;
    let renewHitCount = 0;
    let consecutiveFailures = 0;
    let consecutiveSlow = 0;
    const statusSummary = {};
    const errors = [];
    const todayLocal = getTaipeiNowParts().dateLocal;

    for (let i = 0; i < targetBranches.length; i++) {
      const branchId = targetBranches[i].branch_id;
      const branchName = targetBranches[i].branch_name || '';
      if (i > 0) {
        const jitterMs = 1500 + Math.floor(Math.random() * 900);
        await sleep(jitterMs);
      }

      try {
        const res = await fetchBranchServiceWithCache(db, branchId, branchName);
        const codeKey = String(res.statusCode);
        statusSummary[codeKey] = (statusSummary[codeKey] || 0) + 1;

        if ([429, 403, 500, 502, 503, 504].includes(res.statusCode)) {
          failureCount += 1;
          errors.push(`HTTP ${res.statusCode} on branch ${branchId}`);
          circuitCooldownUntil = Date.now() + 15 * 60 * 1000;
          break;
        }

        if (res.elapsedMs > 3500) {
          consecutiveSlow += 1;
        } else {
          consecutiveSlow = 0;
        }
        if (consecutiveSlow >= 3) {
          errors.push(`3 consecutive slow responses (>3.5s) at branch ${branchId}`);
          circuitCooldownUntil = Date.now() + 15 * 60 * 1000;
          break;
        }

        if (res.parsed.status === 'ok' || res.parsed.status === 'closed') {
          saveBranchPageResult(db, crawlRunId, res.parsed);
          successCount += 1;
          consecutiveFailures = 0;
          if (res.usedRenewCache) renewHitCount += 1;
          // Incrementally update daily_metrics so the webpage shows live progress without waiting for all 151 branches
          if (successCount === 5 || successCount % 20 === 0) {
            aggregateDailyForDate(db, todayLocal);
          }
        } else {
          failureCount += 1;
          consecutiveFailures += 1;
          errors.push(`Branch ${branchId}: status=${res.parsed.status}`);
        }
      } catch (err) {
        failureCount += 1;
        consecutiveFailures += 1;
        errors.push(`Branch ${branchId}: ${err?.message || String(err)}`);
      }

      if (consecutiveFailures >= 3) {
        circuitCooldownUntil = Date.now() + 15 * 60 * 1000;
        break;
      }
    }

    db.prepare(
      `
      UPDATE crawl_runs
      SET finished_at = ?,
          success_count = ?,
          failure_count = ?,
          renew_hit_count = ?,
          http_status_summary = ?,
          error_summary = ?
      WHERE id = ?
    `,
    ).run(
      utcNowIso(),
      successCount,
      failureCount,
      renewHitCount,
      JSON.stringify(statusSummary),
      errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
      crawlRunId,
    );

    aggregateDailyForDate(db, todayLocal);

    // Keep raw snapshots bounded to 14 days so disk usage stays tiny while daily_metrics is kept forever.
    db.prepare("DELETE FROM queue_snapshots WHERE observed_at < datetime('now', '-14 days')").run();
    db.prepare("DELETE FROM crawl_runs WHERE started_at < datetime('now', '-14 days')").run();

    return {
      status: 'completed',
      crawlRunId,
      successCount,
      failureCount,
      renewHitCount,
    };
  } finally {
    crawlInProgress = false;
  }
}

export function startBotQueueScheduler(db) {
  const enabled = process.env.BOT_QUEUE_SCHEDULER !== '0' && process.env.BOT_QUEUE_SCHEDULER !== 'false';
  if (!enabled) return null;

  const mode = process.env.BOT_QUEUE_MODE || 'all_enabled';
  const intervalMin = Math.max(5, Number(process.env.BOT_QUEUE_INTERVAL_MIN || 10));
  let lastAggregatedCloseDate = '';

  const tick = async () => {
    try {
      const nowParts = getTaipeiNowParts();
      // Skip 2026-11-02 so deploying mid-afternoon does not create a partial day record.
      if (nowParts.dateLocal <= '2026-11-02') {
        return;
      }
      const gate = isWithinBusinessHours();
      if (gate.allowed) {
        const res = await runCrawlOnce(db, { mode });
        if (res.status === 'completed') {
          console.log(
            `[bot-queue] run #${res.crawlRunId} completed: ok=${res.successCount}, fail=${res.failureCount}, renew_hits=${res.renewHitCount}`,
          );
        }
      } else if (
        nowParts.weekday !== 'Sat' &&
        nowParts.weekday !== 'Sun' &&
        nowParts.hm >= '17:01' &&
        nowParts.hm <= '17:30' &&
        lastAggregatedCloseDate !== nowParts.dateLocal
      ) {
        // Final end-of-day aggregation right after 17:00 business hours close
        aggregateDailyForDate(db, nowParts.dateLocal);
        lastAggregatedCloseDate = nowParts.dateLocal;
        console.log(`[bot-queue] daily close aggregation finished for ${nowParts.dateLocal}`);
      }
    } catch (err) {
      console.warn('[bot-queue] scheduler tick error:', err?.message || err);
    }
  };

  // Run an initial check 15 seconds after server startup, then every intervalMin minutes.
  const startupTimer = setTimeout(tick, 15_000);
  startupTimer.unref?.();
  const intervalTimer = setInterval(tick, intervalMin * 60 * 1000);
  intervalTimer.unref?.();
  return intervalTimer;
}
