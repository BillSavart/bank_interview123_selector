import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPinned, FileSpreadsheet } from 'lucide-react';
import { seriesOf } from '../series';

// Easy → hard. Keep the easy end saturated enough to stay distinct from grey "無資料".
const PAL = ['#16b8a6', '#10936b', '#82b936', '#f2c12e', '#f57a1f', '#d9362f', '#8f1029'];
const GREY = '#dfe4ec';
const ISLAND_REGIONS = ['金門', '馬祖', '澎湖'] as const;

interface Region {
  region: string;
  vals: (number | null)[];
  isCore: boolean;
  parent: string | null;
  nonGeo: boolean;
}
interface Bank {
  name: string;
  rounds: string[];
  regions: Region[];
  districts: string[][][]; // per round: groups of region names sharing a district
}
interface MapData {
  width: number;
  height: number;
  counties: Record<string, string>;
  centroids: Record<string, [number, number]>;
  polys: Record<string, [number, number][][]>;
}
interface Dataset {
  meta?: { sheetUrl?: string };
  map: MapData;
  regionToCounty: Record<string, string[]>;
  banks: Bank[];
}

interface RegionValue {
  val: number | null;
  rd: string | null;
  ri: number; // round index this value came from (-1 if none)
  prev: number | null;
  isCore: boolean;
  parent: string | null;
  nonGeo: boolean;
}

interface DistrictRender {
  key: string;
  regions: string[];
  value: number | null;
  labelPoint: [number, number] | null;
}

function colorOf(v: number | null, colorScale: Map<number, number>): string {
  if (v == null) return GREY;
  return interpolatePalette(PAL, colorScale.get(v) ?? 0.5);
}

function interpolatePalette(palette: string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (palette.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(palette.length - 1, left + 1);
  const mix = scaled - left;
  const a = hexToRgb(palette[left]);
  const b = hexToRgb(palette[right]);
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * mix);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function MapPage() {
  const [data, setData] = useState<Dataset | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bankIdx, setBankIdx] = useState(0);
  const [roundIdx, setRoundIdx] = useState(-1);
  const [selRegion, setSelRegion] = useState<string | null>(null);
  // The region currently hovered on the map, so its whole combined exam district
  // can light up together (set on enter/leave, not on move — cheap re-render).
  const [hoverReg, setHoverReg] = useState<string | null>(null);
  const [roundMenuOpen, setRoundMenuOpen] = useState(false);
  const [roundYear, setRoundYear] = useState<string | null>(null);
  const roundPickerRef = useRef<HTMLDivElement | null>(null);
  // Tooltip is positioned imperatively via this ref instead of React state, so
  // moving the mouse over the map doesn't re-render the (heavy) county SVG.
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/banks-data.json')
      .then((r) => r.json())
      .then((d: Dataset) => {
        setData(d);
        setRoundIdx(Math.max(0, (d.banks[0]?.rounds.length ?? 1) - 1));
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    if (!roundMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (roundPickerRef.current?.contains(event.target as Node)) return;
      setRoundMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [roundMenuOpen]);

  // county name → every region that claims it (a county like 基隆市 belongs to
  // both 大台北 and a standalone 基隆 row when the bank has one).
  const county2regions = useMemo(() => {
    const m: Record<string, string[]> = {};
    if (data) for (const [reg, cs] of Object.entries(data.regionToCounty)) for (const c of cs) (m[c] ||= []).push(reg);
    return m;
  }, [data]);

  const bank = data?.banks[bankIdx] ?? null;

  useEffect(() => {
    if (!bank) return;
    if (roundIdx >= 0 && roundIdx < bank.rounds.length) return;
    setRoundIdx(Math.max(0, bank.rounds.length - 1));
  }, [bank, roundIdx]);

  // region → value for current bank+round, with previous-round value for the trend arrow
  const rv = useMemo(() => {
    const out: Record<string, RegionValue> = {};
    if (!bank) return out;
    for (const r of bank.regions) {
      // Non-geographic categories (不分區 / 專業人員 / 櫃台組…) and sub-districts
      // stay out of the map but are kept here so the ranking can list them.
      const present = r.vals.map((v, i) => (v == null ? null : ([i, v] as [number, number]))).filter(Boolean) as [number, number][];
      let val: number | null = null;
      let rd: string | null = null;
      let ri = -1;
      let prev: number | null = null;
      if (roundIdx === -1) {
        if (present.length) {
          [ri, val] = present[present.length - 1];
          rd = bank.rounds[ri];
          // Previous value of the SAME exam series, not just the prior round.
          const series = seriesOf(bank.name, rd);
          const same = present.filter(([i]) => seriesOf(bank.name, bank.rounds[i]) === series);
          if (same.length >= 2) prev = same[same.length - 2][1];
        }
      } else {
        val = r.vals[roundIdx];
        rd = bank.rounds[roundIdx];
        ri = val != null ? roundIdx : -1;
        // Latest earlier round of the same series as the selected round.
        const series = seriesOf(bank.name, rd);
        const same = present.filter(([i]) => i < roundIdx && seriesOf(bank.name, bank.rounds[i]) === series);
        if (same.length) prev = same[same.length - 1][1];
      }
      out[r.region] = { val, rd, ri, prev, isCore: r.isCore, parent: r.parent, nonGeo: r.nonGeo };
    }
    return out;
  }, [bank, roundIdx]);

  const [mn, mx] = useMemo(() => {
    const vals = Object.values(rv)
      .map((x) => x.val)
      .filter((v): v is number => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }, [rv]);

  const colorScale = useMemo(() => {
    const vals = [...new Set(Object.values(rv)
      .map((x) => x.val)
      .filter((v): v is number => v != null))]
      .sort((a, b) => a - b);
    return new Map(vals.map((v, i) => [v, vals.length > 1 ? i / (vals.length - 1) : 0.5]));
  }, [rv]);

  // Default selection = hardest open core region.
  useEffect(() => {
    if (!bank) return;
    if (selRegion && rv[selRegion]?.val != null) return;
    const open = Object.entries(rv)
      .filter(([, x]) => x.isCore && x.val != null)
      .sort((a, b) => (b[1].val as number) - (a[1].val as number));
    setSelRegion(open[0]?.[0] ?? null);
  }, [bank, rv]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main-island viewBox (exclude the offshore island counties so the map zooms in).
  const mainViewBox = useMemo(() => {
    if (!data) return '0 0 560 726';
    const islandCounties = new Set(ISLAND_REGIONS.flatMap((r) => data.regionToCounty[r] ?? []));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cty, rings] of Object.entries(data.map.polys)) {
      if (islandCounties.has(cty)) continue;
      for (const ring of rings)
        for (const [x, y] of ring) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
    }
    const pad = 12;
    return `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}`;
  }, [data]);

  const islandCountySet = useMemo(
    () => new Set(data ? ISLAND_REGIONS.flatMap((r) => data.regionToCounty[r] ?? []) : []),
    [data],
  );

  // For a county claimed by several regions, pick the one to colour it by: a
  // region that has a value this round wins (prefer the more specific over 大台北),
  // otherwise fall back to the first claimant (so 基隆市 follows 大台北 by default).
  const resolveRegion = (cty: string): string | null => {
    const regs = county2regions[cty];
    if (!regs || !regs.length) return null;
    const withVal = regs.filter((r) => rv[r]?.val != null);
    if (withVal.length) return withVal.find((r) => r !== '大台北') ?? withVal[0];
    return regs[0];
  };

  // Round picker grouped by 民國年; the menu shows one year's rounds at a time.
  const roundGroups = useMemo(() => {
    const groups: { year: string; items: { i: number; label: string }[] }[] = [];
    const byYear = new Map<string, { i: number; label: string }[]>();
    (bank?.rounds ?? []).forEach((r, i) => {
      const y = r.match(/^(\d{2,3})/)?.[1] ?? '其他';
      if (!byYear.has(y)) { byYear.set(y, []); groups.push({ year: y, items: byYear.get(y)! }); }
      byYear.get(y)!.push({ i, label: r });
    });
    return groups;
  }, [bank]);

  const activeRoundGroup = roundGroups.find((g) => g.items.some((it) => it.i === roundIdx)) ?? roundGroups[roundGroups.length - 1];
  const visibleRoundGroup = roundGroups.find((g) => g.year === (roundYear ?? activeRoundGroup?.year)) ?? activeRoundGroup;
  const roundLabel = bank && roundIdx >= 0 ? bank.rounds[roundIdx] : '選擇梯次';

  const selectRegion = (r: string) => setSelRegion(r);
  const moveTip = (e: React.MouseEvent, html: string) => {
    const el = tipRef.current;
    if (!el) return;
    el.innerHTML = html;
    el.style.left = `${e.clientX + 14}px`;
    el.style.top = `${e.clientY + 14}px`;
    el.style.opacity = '1';
  };
  const hideTip = () => {
    if (tipRef.current) tipRef.current.style.opacity = '0';
  };

  if (state === 'loading') return <div className="container py-4 map-page"><p className="calendar-empty">載入中…</p></div>;
  if (state === 'error' || !data || !bank)
    return <div className="container py-4 map-page"><p className="calendar-empty">資料載入失敗，請稍後再試。</p></div>;

  // ranking — every row with a score for this round: core regions, sub-districts
  // (旗山美濃…) and non-geographic categories (不分區 / 專業人員…). The map shows
  // only core regions; the ranking is where the rest surface.
  const open = Object.entries(rv)
    .filter(([, x]) => x.val != null)
    .sort((a, b) => (b[1].val as number) - (a[1].val as number));

  const selRow = selRegion ? bank.regions.find((r) => r.region === selRegion) : null;
  const selRec = selRegion ? rv[selRegion] : null;
  const currentRound = roundIdx >= 0 ? roundIdx : Math.max(0, bank.rounds.length - 1);

  // The trend line compares like-with-like: only rounds of the same exam series
  // as the selected round, and at most the most recent six (oldest→newest order).
  const currentSeries = seriesOf(bank.name, bank.rounds[currentRound] ?? '');
  const present = (selRow
    ? (selRow.vals
        .map((v, i) => (v == null || seriesOf(bank.name, bank.rounds[i]) !== currentSeries ? null : [i, v]))
        .filter(Boolean) as [number, number][])
    : []
  ).slice(-6);

  // Same-district mates of the selected region, for the selected round.
  const activeDistricts = bank.districts[currentRound] ?? [];
  const regionDistrict = new Map<string, string[]>();
  for (const group of activeDistricts) for (const reg of group) regionDistrict.set(reg, group);
  const districtRenders: DistrictRender[] = activeDistricts.map((regions) => {
    const counties = [...new Set(regions.flatMap((reg) => data.regionToCounty[reg] ?? []).filter((cty) => !islandCountySet.has(cty)))];
    const points = counties.map((cty) => data.map.centroids[cty]).filter((p): p is [number, number] => !!p);
    const labelPoint: [number, number] | null = points.length
      ? [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length]
      : null;
    const value = regions.map((reg) => rv[reg]?.val).find((v): v is number => v != null) ?? null;
    return {
      key: regions.join('|'),
      regions,
      value,
      labelPoint,
    };
  });
  const districtRegionSet = new Set(activeDistricts.flat());

  // Counties to light up on hover: the hovered region's whole combined district
  // (so 同考區 glow together), or just the hovered region's own counties.
  const hoverGroup = hoverReg ? regionDistrict.get(hoverReg) ?? [hoverReg] : [];
  const hlCounties = new Set(hoverGroup.flatMap((reg) => data.regionToCounty[reg] ?? []));

  // When the selected region is part of a merged district, show the whole
  // group's label (e.g. 「台中、彰化」) above the score, matching the ranking row.
  const selGroup = selRegion ? regionDistrict.get(selRegion) : null;
  const selLabel = selGroup ? selGroup.join('、') : selRegion;

  const rankRows = open.flatMap(([reg, x]) => {
    const group = regionDistrict.get(reg);
    if (!group) {
      // Any non-core row (sub-district like 旗山美濃, or a non-geographic
      // category like 不分區 / 專業人員) is listed but kept off the map. A
      // sub-district shows its parent region as a tag for context; categories
      // just show their own (already descriptive) name.
      const isExtra = !x.isCore;
      return [{ key: reg, label: reg, regions: [reg], value: x.val as number, prev: x.prev, isDistrict: false, isExtra, tag: x.parent }];
    }
    if (group[0] !== reg) return [];
    const first = group.map((member) => rv[member]).find((item) => item?.val != null) ?? x;
    return [{ key: group.join('|'), label: group.join('、'), regions: group, value: first.val as number, prev: first.prev, isDistrict: true, isExtra: false, tag: null }];
  }).sort((a, b) => b.value - a.value);

  const Delta = ({ cur, prev }: { cur: number | null; prev: number | null }) => {
    if (cur == null || prev == null) return <span className="delta flat">–</span>;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return <span className="delta flat">–</span>;
    return <span className={`delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(1)}</span>;
  };

  return (
    <div className="container py-4 map-page">
      <div className="map-page-head">
        <span className="interview-kicker">
          <MapPinned size={18} />
          筆試門檻
        </span>
        <h1 className="map-page-title">八大公股行庫 · 歷年筆試門檻</h1>
        {data.meta?.sheetUrl && (
          <a className="map-sheet-link" href={data.meta.sheetUrl} target="_blank" rel="noreferrer">
            <FileSpreadsheet size={16} />
            資料來源試算表
          </a>
        )}
      </div>

      <div className="map-banks">
        {data.banks.map((b, i) => (
          <button
            key={b.name}
            type="button"
            className={`map-bank ${i === bankIdx ? 'is-active' : ''}`}
            onClick={() => {
              setBankIdx(i);
              setRoundIdx(Math.max(0, b.rounds.length - 1));
              setRoundYear(null);
              setSelRegion(null);
            }}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="map-toolbar">
        <div className={`map-round-picker ${roundMenuOpen ? 'is-open' : ''}`} ref={roundPickerRef}>
          <button
            type="button"
            className="map-round-trigger"
            aria-haspopup="listbox"
            aria-expanded={roundMenuOpen}
            onClick={() => {
              setRoundYear(activeRoundGroup?.year ?? null);
              setRoundMenuOpen((v) => !v);
            }}
          >
            <span>梯次</span>
            <strong>{roundLabel}</strong>
          </button>
          <div className="map-round-menu" role="listbox" aria-label="選擇招考梯次">
            <div className="map-round-years" role="tablist" aria-label="年份">
              {roundGroups.map((g) => (
                <button
                  key={g.year}
                  type="button"
                  className={`map-round-year ${visibleRoundGroup?.year === g.year ? 'is-active' : ''}`}
                  role="tab"
                  aria-selected={visibleRoundGroup?.year === g.year}
                  onClick={() => setRoundYear(g.year)}
                >
                  {g.year === '其他' ? '其他' : `${g.year} 年`}
                </button>
              ))}
            </div>
            <div className="map-round-options">
              {visibleRoundGroup ? (
                <>
                  <div className="map-round-year-label">{visibleRoundGroup.year === '其他' ? '其他' : `${visibleRoundGroup.year} 年梯次`}</div>
                  {visibleRoundGroup.items.map((it) => (
                  <button
                    key={it.i}
                    type="button"
                    className={`map-round-option ${roundIdx === it.i ? 'is-active' : ''}`}
                    role="option"
                    aria-selected={roundIdx === it.i}
                    onClick={() => {
                      setRoundIdx(it.i);
                      setRoundYear(visibleRoundGroup.year);
                      setRoundMenuOpen(false);
                    }}
                  >
                    {it.label}
                  </button>
                  ))}
                </>
              ) : (
                <div className="map-round-empty">沒有梯次資料</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="map-layout">
        {/* ── map ── */}
        <div className="map-card">
          <div className="map-card-head">
            <h2>{bank.name}</h2>
            <span className="round">{bank.rounds[roundIdx] ?? '—'}</span>
          </div>

          <svg className="map-svg" viewBox={mainViewBox}>
            {Object.entries(data.map.counties).map(([cty, d]) => {
              if (islandCountySet.has(cty)) return null;
              const reg = resolveRegion(cty);
              const rec = reg ? rv[reg] : null;
              const v = rec ? rec.val : null;
              const group = reg ? regionDistrict.get(reg) : null;
              const groupNote = group ? `<br>同考區：${group.join('、')}` : '';
              return (
                <path
                  key={cty}
                  className={`map-county ${hlCounties.has(cty) ? 'is-hl' : ''}`}
                  d={d}
                  fill={colorOf(v, colorScale)}
                  onMouseEnter={() => setHoverReg(v != null ? reg : null)}
                  onMouseMove={(e) => moveTip(e, `<b>${reg ?? cty}</b>　${v != null ? `${v} 分` : '無資料'}${groupNote}`)}
                  onMouseLeave={() => { hideTip(); setHoverReg(null); }}
                  onClick={reg && v != null ? () => selectRegion(reg) : undefined}
                />
              );
            })}
            {Object.entries(data.map.counties).map(([cty, d]) => (
              islandCountySet.has(cty) ? null : <path key={`border-${cty}`} className="map-county-border" d={d} />
            ))}
            {Object.entries(rv).map(([reg, rec]) => {
              if (districtRegionSet.has(reg)) return null;
              if (rec.val == null) return null;
              const cty = (data.regionToCounty[reg] ?? []).find(
                (c) => !islandCountySet.has(c) && resolveRegion(c) === reg,
              );
              const c = cty ? data.map.centroids[cty] : null;
              if (!c) return null;
              return (
                <text key={reg} className="map-vlbl" x={c[0]} y={c[1]} textAnchor="middle">{rec.val}</text>
              );
            })}
            {districtRenders.map((group) => (
              group.value != null && group.labelPoint
                ? <text key={`label-${group.key}`} className="map-vlbl is-district" x={group.labelPoint[0]} y={group.labelPoint[1]} textAnchor="middle">{group.value}</text>
                : null
            ))}
          </svg>

          {/* island insets */}
          <div className="map-islands">
            {ISLAND_REGIONS.map((reg) => {
              const cty = data.regionToCounty[reg]?.[0];
              const rings = cty ? data.map.polys[cty] : null;
              const rec = rv[reg];
              const v = rec?.val ?? null;
              let vb = '0 0 10 10';
              let dPath = '';
              if (rings) {
                // 馬祖/澎湖 are widely scattered, so framing the full extent makes
                // every island tiny. Frame on the main island(s) only and let the
                // far-flung small outliers crop off the bottom/edges.
                const maxA = Math.max(...rings.map(ringArea));
                const framed = rings.filter((r) => ringArea(r) >= maxA * 0.3);
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const ring of framed)
                  for (const [x, y] of ring) {
                    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                  }
                const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
                vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
                dPath = data.map.counties[cty] ?? '';
              }
              return (
                <div
                  key={reg}
                  className={`map-island ${selRegion === reg ? 'is-sel' : ''}`}
                  onClick={v != null ? () => selectRegion(reg) : undefined}
                  onMouseMove={(e) => moveTip(e, `<b>${reg}</b>　${v != null ? `${v} 分` : '無資料'}`)}
                  onMouseLeave={hideTip}
                >
                  <svg viewBox={vb}>
                    <path className="map-county" d={dPath} fill={colorOf(v, colorScale)} />
                  </svg>
                  <div className="nm">{reg}</div>
                  {v != null ? <div className="vv">{v}</div> : <div className="vv empty">無資料</div>}
                </div>
              );
            })}
          </div>

          <div className="map-legend">
            <span>易 {isFinite(mn) ? mn.toFixed(0) : '—'}</span>
            {PAL.map((c) => (<i key={c} style={{ background: c }} />))}
            <span>難 {isFinite(mx) ? mx.toFixed(0) : '—'}</span>
            <span style={{ marginLeft: '0.6rem' }}><i style={{ background: GREY }} /> 無資料</span>
          </div>
        </div>

        {/* ── side panel ── */}
        <div className="map-card map-side">
          {selRec && (
            <>
              <div className="sel-name">{selLabel}</div>
              <div className="sel-score">{selRec.val != null ? selRec.val : '—'}<small> 分</small></div>
              <div className="sel-meta">{selRec.val != null ? `${selRec.rd} 筆試門檻` : '本梯無資料'}</div>
              {present.length >= 2 && <Sparkline bank={bank} present={present} onTip={moveTip} clearTip={hideTip} />}
            </>
          )}

          <div className="map-rank-head">
            <span>難度排行</span>
            <span>{rankRows.length} 個考區有資料</span>
          </div>
          <div className="map-rank">
            {rankRows.map((row, i) => (
              <div
                key={row.key}
                className={`map-row ${row.regions.includes(selRegion ?? '') ? 'is-sel' : ''} ${row.isDistrict ? 'is-district' : ''} ${row.isExtra ? 'is-extra' : ''}`}
                onClick={() => selectRegion(row.regions[0])}
              >
                <span className="rk">{i + 1}</span>
                <span className="nm">{row.label}{row.tag && <em className="tag">{row.tag}</em>}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${((row.value - mn) / (mx - mn || 1)) * 100}%`, background: colorOf(row.value, colorScale) }} />
                </span>
                <Delta cur={row.value} prev={row.prev} />
                <span className="v">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={tipRef} className="map-tip" style={{ opacity: 0 }} />
    </div>
  );
}

function Sparkline({
  bank,
  present,
  onTip,
  clearTip,
}: {
  bank: Bank;
  present: [number, number][];
  onTip: (e: React.MouseEvent, html: string) => void;
  clearTip: () => void;
}) {
  const W = 420, H = 158, PX = 24, PY = 30;
  const vs = present.map((p) => p[1]);
  const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const highIdx = present.findIndex((p) => p[1] === vmax);
  const lowIdx = present.findIndex((p) => p[1] === vmin);
  const X = (k: number) => PX + (W - 2 * PX) * (present.length > 1 ? k / (present.length - 1) : 0.5);
  const Y = (v: number) => PY + (H - 2 * PY) * (1 - (vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5));
  const d = present.map((p, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  return (
    <div className="map-spark">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        <defs>
          <linearGradient id="mapspark" x1="0" x2="1">
            <stop offset="0" stopColor="#0f4f49" />
            <stop offset="1" stopColor="#e7894e" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="url(#mapspark)" strokeWidth={2.4} strokeLinejoin="round" />
        {present.map((p, k) => {
          const x = X(k);
          const y = Y(p[1]);
          const labelAbove = k % 2 === 0;
          const labelY = labelAbove ? Math.max(14, y - 14) : Math.min(H - 8, y + 22);
          const labelText = String(p[1]);
          const labelWidth = Math.max(34, labelText.length * 7 + 12);
          // Keep the label box inside the chart so it never spills past the edge.
          const lx = Math.min(W - labelWidth / 2, Math.max(labelWidth / 2, x));
          return (
            <g key={p[0]} onMouseMove={(e) => onTip(e, `${bank.rounds[p[0]]}<br><b>${p[1]}</b> 分`)} onMouseLeave={clearTip}>
              <line x1={x.toFixed(1)} y1={y.toFixed(1)} x2={lx.toFixed(1)} y2={labelY.toFixed(1)} className="map-spark-stem" />
              <circle
                cx={x.toFixed(1)}
                cy={y.toFixed(1)}
                r={3.6}
                fill="#fff"
                stroke="#0f4f49"
                strokeWidth={1.8}
              />
              <rect
                className={`map-spark-label-bg ${k === highIdx || k === lowIdx || k === present.length - 1 ? 'is-key' : ''}`}
                x={(lx - labelWidth / 2).toFixed(1)}
                y={(labelY - 11).toFixed(1)}
                width={labelWidth.toFixed(1)}
                height={22}
                rx={7}
              />
              <text
                className={`map-spark-value ${k === highIdx || k === lowIdx || k === present.length - 1 ? 'is-key' : ''}`}
                x={lx.toFixed(1)}
                y={(labelY + 0.5).toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {p[1]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="ends">
        <span>{bank.rounds[present[0][0]]}</span>
        <span>歷年走勢</span>
        <span>{bank.rounds[present[present.length - 1][0]]}</span>
      </div>
    </div>
  );
}
