// Validate public/banks-data.json before it ships.
//
// build-banks-data.mjs scrapes a Google Sheet (by regex + column order + cell
// fill colours) and, critically, runs on a daily cron that auto-deploys. A bad
// sheet edit would otherwise silently push broken data live — a sheet that
// failed to download only `console.warn`s and drops the bank. This script turns
// those silent failures into a hard build error.
//
// Run after build:banks-data (wired into the prebuild step).
import fs from 'node:fs';

const PATH = new URL('../public/banks-data.json', import.meta.url);

// Must match BANK_SHEETS in build-banks-data.mjs (display order).
const EXPECTED_BANKS = ['臺灣銀行', '土地銀行', '合作金庫', '第一銀行', '華南銀行', '彰化銀行', '兆豐銀行', '台灣企銀'];
// Must match ROUND_EXCLUDE in build-banks-data.mjs.
const EXCLUDED_ROUNDS = { 土地銀行: ['114總行'] };

const errors = [];
const fail = (msg) => errors.push(msg);

let data;
try {
  data = JSON.parse(fs.readFileSync(PATH, 'utf8'));
} catch (e) {
  console.error(`✗ cannot read/parse banks-data.json: ${e.message}`);
  process.exit(1);
}

// ---- meta ----
const sheetUrl = data.meta?.sheetUrl;
if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(sheetUrl ?? '')) {
  fail(`meta.sheetUrl missing or not a Google Sheets URL: ${JSON.stringify(sheetUrl)}`);
}

// ---- map ----
if (!data.map || !data.map.counties || Object.keys(data.map.counties).length < 20) {
  fail(`map.counties looks empty/short (${Object.keys(data.map?.counties ?? {}).length} counties)`);
}

// ---- banks ----
const banks = data.banks ?? [];
const names = banks.map((b) => b.name);
for (const expected of EXPECTED_BANKS) {
  if (!names.includes(expected)) fail(`missing bank sheet: ${expected}`);
}
if (banks.length !== EXPECTED_BANKS.length) {
  fail(`expected ${EXPECTED_BANKS.length} banks, got ${banks.length}: ${JSON.stringify(names)}`);
}

for (const b of banks) {
  const where = `bank "${b.name}"`;
  if (!Array.isArray(b.rounds) || b.rounds.length === 0) { fail(`${where}: no rounds`); continue; }
  if (b.rounds.some((r) => typeof r !== 'string' || !r)) fail(`${where}: blank round label`);

  // Length invariant: a region's values and the per-round district groups must
  // line up with rounds, or the map/chart render against the wrong column.
  if (!Array.isArray(b.districts) || b.districts.length !== b.rounds.length) {
    fail(`${where}: districts length ${b.districts?.length} ≠ rounds length ${b.rounds.length}`);
  }
  if (!Array.isArray(b.regions) || b.regions.length === 0) { fail(`${where}: no regions`); continue; }
  for (const r of b.regions) {
    if (!r.region) fail(`${where}: a region has a blank name`);
    if (!Array.isArray(r.vals) || r.vals.length !== b.rounds.length) {
      fail(`${where} / region "${r.region}": vals length ${r.vals?.length} ≠ rounds length ${b.rounds.length}`);
    }
    if (r.vals?.some((v) => v !== null && typeof v !== 'number')) {
      fail(`${where} / region "${r.region}": a value is neither number nor null`);
    }
  }
  // Every region in a district group must be a real region of this bank.
  const regionSet = new Set(b.regions.map((r) => r.region));
  for (const round of b.districts ?? []) {
    for (const group of round) {
      for (const reg of group) {
        if (!regionSet.has(reg)) fail(`${where}: district references unknown region "${reg}"`);
      }
    }
  }

  // Excluded rounds must really be gone.
  for (const dropped of EXCLUDED_ROUNDS[b.name] ?? []) {
    if (b.rounds.includes(dropped)) fail(`${where}: excluded round "${dropped}" is still present`);
  }
}

if (errors.length) {
  console.error(`✗ banks-data.json failed validation (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ banks-data.json valid: ${banks.length} banks, ${banks.reduce((n, b) => n + b.rounds.length, 0)} rounds total`);
