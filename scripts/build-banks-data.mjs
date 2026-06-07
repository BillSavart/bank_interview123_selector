// Build a compact, pre-projected dataset for the 8-bank Taiwan-map dashboard.
//
// Source of truth is the user's Google Sheet, exported as XLSX (not CSV) because
// cell FILL COLORS encode combined exam districts: two regions sharing a fill are
// one district that tiles the timeline, so a region inherits its colour-partner's
// score in any year it has no value of its own. CSV export drops that, which made
// combined-district years show up wrongly as 未開缺.
//
// Self-contained: downloads the XLSX + g0v county geojson into /tmp if missing.
// Writes: public/banks-data.json
import fs from "node:fs";
import { execSync } from "node:child_process";

const SHEET_ID = "1vqqs2Ik2BrGqgusvdRKQZ_4Aij_9fPdiiMtffOwhpg0";
const GEO = "/tmp/tw_full.json";
const XLSX = "/tmp/banks.xlsx";
const XDIR = "/tmp/banks_xlsx";
const OUT = new URL("../public/banks-data.json", import.meta.url);

// Sheet (tab) names of the 8 banks to include, in display order.
// Excludes 信保基金 and 農業金庫.
const BANK_SHEETS = ["臺灣銀行", "土地銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行", "兆豐銀行", "台灣企銀"];

function prep() {
  if (!fs.existsSync(GEO)) {
    execSync(`curl -sL "https://raw.githubusercontent.com/g0v/twgeojson/master/json/twCounty2010.geo.json" -o "${GEO}"`);
  }
  // Always re-pull the sheet so a rebuild reflects the latest edits.
  execSync(`curl -sL "https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx" -o "${XLSX}"`);
  fs.rmSync(XDIR, { recursive: true, force: true });
  fs.mkdirSync(XDIR, { recursive: true });
  execSync(`cd "${XDIR}" && unzip -oq "${XLSX}"`);
}
prep();

// 18 core regions -> county names present in the geojson (桃園縣 is 2010 naming)
const REGION_TO_COUNTY = {
  "大台北": ["台北市", "新北市", "基隆市"],
  "桃園": ["桃園縣"],
  "新竹": ["新竹縣", "新竹市"],
  "苗栗": ["苗栗縣"],
  "台中": ["台中市"],
  "彰化": ["彰化縣"],
  "南投": ["南投縣"],
  "雲林": ["雲林縣"],
  "嘉義": ["嘉義縣", "嘉義市"],
  "台南": ["台南市"],
  "高雄": ["高雄市"],
  "屏東": ["屏東縣"],
  "宜蘭": ["宜蘭縣"],
  "花蓮": ["花蓮縣"],
  "台東": ["台東縣"],
  "澎湖": ["澎湖縣"],
  "金門": ["金門縣"],
  "馬祖": ["連江縣"],
  "基隆": ["基隆市"],
};
// sub-district / category rows -> parent core region (for drill-down grouping)
const SUBREGION_PARENT = {
  "苑裡": "苗栗", "瑞芳": "大台北", "恆春": "屏東", "龍潭": "桃園", "楊梅": "桃園",
  "大園": "桃園", "大溪": "桃園", "林口蘆竹龜山": "桃園", "竹東": "新竹", "湖口": "新竹",
  "竹山": "南投", "水裡坑": "南投", "埔里": "南投", "東勢": "台中", "大甲": "台中",
  "大甲清水": "台中", "豐原東勢": "台中", "清水沙鹿大肚": "台中", "二林": "彰化",
  "北彰化": "彰化", "南彰化": "彰化", "北港": "雲林", "大林": "嘉義", "北港朴子": "嘉義",
  "新營": "台南", "北台南": "台南", "路竹": "高雄", "旗山": "高雄", "旗山美濃": "高雄",
  "北高雄": "高雄", "林園東港": "屏東", "東港枋寮": "屏東",
};
// non-geographic categories -> shown separately, not on map
const NON_GEO = new Set([
  "櫃台組雙北", "櫃台組台北", "金融組台北", "不分區", "專業人員（一）", "專業人員（二）",
]);

// ---------- geometry: Douglas-Peucker + equirectangular projection ----------
function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  if (!L2) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps);
    const r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

const geo = JSON.parse(fs.readFileSync(GEO, "utf8"));
// bounds
let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
for (const f of geo.features) {
  const walk = (c) => { if (typeof c[0] === "number") { minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0]); minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]); } else c.forEach(walk); };
  walk(f.geometry.coordinates);
}
const W = 560;
const latMid = (minLat + maxLat) / 2;
const kx = Math.cos((latMid * Math.PI) / 180);
const spanLon = (maxLon - minLon) * kx;
const spanLat = maxLat - minLat;
const scale = W / spanLon;
const H = spanLat * scale;
const proj = ([lon, lat]) => [
  +(((lon - minLon) * kx) * scale).toFixed(1),
  +((maxLat - lat) * scale).toFixed(1),
];
const EPS = 0.004; // ~ degrees tolerance for simplification

const counties = {};
const centroids = {};
const polysJson = {}; // name -> array of rings (each ring = array of [x,y]) for 3D extrusion
for (const f of geo.features) {
  const name = f.properties.COUNTYNAME || f.properties.name;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "", cx = 0, cy = 0, cn = 0, biggest = 0;
  const rings = [];
  for (const poly of polys) {
    const ring = poly[0];
    // drop tiny islets to cut size, but keep the largest ring always
    const area = Math.abs(ringArea(ring));
    if (area < 0.0008 && area < biggest) continue;
    biggest = Math.max(biggest, area);
    let pts = ring.map(proj);
    pts = rdp(pts, EPS * scale);
    if (pts.length < 3) continue;
    d += "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
    rings.push(pts);
    // centroid weighting by this ring's projected bbox center
    for (const p of pts) { cx += p[0]; cy += p[1]; cn++; }
  }
  counties[name] = d;
  centroids[name] = [+(cx / cn).toFixed(1), +(cy / cn).toFixed(1)];
  polysJson[name] = rings;
}
function ringArea(r) { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return a / 2; }

// ---------- parse XLSX (values + fill colours) ----------
const X = (p) => fs.readFileSync(`${XDIR}/${p}`, "utf8");
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const colToNum = (l) => [...l].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);

// theme palette → rgb, with the SpreadsheetML 0/1 and 2/3 swap for the `theme` attr.
function themePalette() {
  const cs = X("xl/theme/theme1.xml").match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/)[1];
  const order = [];
  for (const m of cs.matchAll(/<a:(\w+)>([\s\S]*?)<\/a:\1>/g)) {
    const rgb = m[2].match(/(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/);
    order.push(rgb ? rgb[1].toUpperCase() : "FFFFFF");
  }
  // order = [dk1,lt1,dk2,lt2,accent1..6,...]; theme attr index → palette index
  const swap = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11];
  return swap.map((i) => order[i] ?? "FFFFFF");
}

// fillId → highlight colour (null for none / white / black).
function fillColours() {
  const TH = themePalette();
  const styles = X("xl/styles.xml");
  const fillsXml = styles.match(/<fills count="\d+">([\s\S]*?)<\/fills>/)[1];
  const fills = [...fillsXml.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => {
    const f = m[1];
    if (!/patternType="solid"/.test(f)) return null;
    const rgb = f.match(/fgColor rgb="FF([0-9A-Fa-f]{6})"/);
    const th = f.match(/fgColor theme="(\d+)"/);
    const col = rgb ? rgb[1].toUpperCase() : th ? TH[Number(th[1])] : null;
    return col === "FFFFFF" || col === "000000" ? null : col;
  });
  const cxXml = styles.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)[1];
  const xfFill = [...cxXml.matchAll(/<xf [^>]*\/?>/g)].map((m) => {
    const fm = m[0].match(/fillId="(\d+)"/);
    return fm ? Number(fm[1]) : 0;
  });
  return (s) => fills[xfFill[s] ?? 0] ?? null;
}

function sharedStrings() {
  if (!fs.existsSync(`${XDIR}/xl/sharedStrings.xml`)) return [];
  return [...X("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, ""));
}

// sheet name → worksheet file (via workbook.xml r:id → rels target)
function sheetFiles() {
  const wb = X("xl/workbook.xml");
  const rels = X("xl/_rels/workbook.xml.rels");
  const relMap = {};
  for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="(worksheets\/[^"]+)"/g)) relMap[m[1]] = m[2];
  const out = {};
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    if (relMap[m[2]]) out[m[1]] = `xl/${relMap[m[2]]}`;
  }
  return out;
}

const colourOf = fillColours();
const strs = sharedStrings();
const files = sheetFiles();

// Parse one worksheet into { rounds, rows:[{region, vals, colors}] } (vals numeric|null, "不詳"→null).
function parseSheet(file) {
  const xml = X(file);
  const headers = {}; // colNum -> round label
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rn = rm[1];
    const cells = {};
    // Match BOTH <c .../> (self-closing, blank-but-styled — these carry the fill
    // colour of a combined-district cell whose score sits in a partner cell) and
    // the full <c>…<v>…</v></c> form. Missing the self-closing form was dropping
    // shared-district scores and showing them as 未開缺.
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"(?: s="(\d+)")?(?: t="(\w+)")?[^>]*?(?:\/>|>(?:<v>([\s\S]*?)<\/v>)?<\/c>)/g)) {
      const col = colToNum(cm[1]);
      const s = cm[2] ? Number(cm[2]) : 0;
      const raw = cm[3] === "s" && cm[4] !== undefined ? strs[Number(cm[4])] : cm[4];
      cells[col] = { raw: raw ?? "", color: colourOf(s) };
    }
    if (rn === "1") {
      for (const [c, { raw }] of Object.entries(cells)) if (Number(c) > 1 && raw) headers[c] = String(raw).replace(/\.0$/, "").trim();
      continue;
    }
    const region = (cells[1]?.raw || "").trim();
    if (!region) continue;
    rows.push({ region, cells });
  }
  const roundCols = Object.keys(headers).map(Number).sort((a, b) => a - b);
  const rounds = roundCols.map((c) => headers[c]);
  const parsed = rows.map(({ region, cells }) => ({
    region,
    vals: roundCols.map((c) => num(cells[c]?.raw)),
    colors: roundCols.map((c) => cells[c]?.color ?? null),
    // region's own fill colour (from whichever cells are highlighted)
  }));
  return { rounds, rows: parsed };
}

// Combined-district sharing, evaluated PER YEAR by cell fill colour: in a given
// round, all cells sharing a fill colour are one exam district and share its one
// score, so blank-but-coloured cells inherit the valued cell of the same colour.
// Uncoloured cells (incl. 不詳) are NOT part of any district and keep their own
// value. Done per-column so a region only shares in the years it's actually
// coloured (e.g. 南投 shares with 彰化 in 105–107一招, runs alone afterwards).
function applySharing(rounds, rows) {
  for (let k = 0; k < rounds.length; k++) {
    const byColor = {}; // color -> { values:Set, blanks:[rowIdx] }
    rows.forEach((r, ri) => {
      const c = r.colors[k];
      if (!c) return;
      const g = (byColor[c] ||= { values: new Set(), blanks: [] });
      if (r.vals[k] != null) g.values.add(r.vals[k]);
      else g.blanks.push(ri);
    });
    for (const g of Object.values(byColor)) {
      if (g.values.size === 1) {
        const v = [...g.values][0];
        for (const ri of g.blanks) rows[ri].vals[k] = v;
      }
    }
  }
}

const banksOut = [];
for (const name of BANK_SHEETS) {
  const file = files[name];
  if (!file) { console.warn(`!! sheet not found: ${name}`); continue; }
  const { rounds, rows } = parseSheet(file);
  applySharing(rounds, rows);
  // Per-round combined districts: regions sharing a fill colour that year (≥2
  // members), so the UI can show "these are the same exam district".
  const districts = rounds.map((_, k) => {
    const byColor = {};
    for (const r of rows) {
      const c = r.colors[k];
      if (!c || r.vals[k] == null) continue;
      (byColor[c] ||= []).push(r.region);
    }
    return Object.values(byColor).filter((g) => g.length >= 2);
  });
  const regions = [];
  for (const { region, vals } of rows) {
    if (!vals.some((v) => v !== null)) continue; // all-empty / all-不詳 row
    regions.push({
      region,
      vals,
      isCore: !!REGION_TO_COUNTY[region],
      parent: SUBREGION_PARENT[region] || null,
      nonGeo: NON_GEO.has(region),
    });
  }
  banksOut.push({ name, rounds, regions, districts });
}

const out = {
  meta: { generated: new Date().toISOString().slice(0, 10), source: "user Google Sheet" },
  map: { width: +W.toFixed(1), height: +H.toFixed(1), counties, centroids, polys: polysJson },
  regionToCounty: REGION_TO_COUNTY,
  banks: banksOut,
};
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote public/banks-data.json (${kb} KB)`);
console.log(`map ${W}x${H.toFixed(0)}, ${Object.keys(counties).length} counties`);
for (const b of banksOut) console.log(`  ${b.name}: ${b.rounds.length} rounds, ${b.regions.length} regions`);
