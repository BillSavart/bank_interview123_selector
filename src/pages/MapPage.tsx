import { useEffect, useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';

// Soft palette that harmonises with the site's teal accent (easy → hard).
const PAL = ['#d8efe9', '#a9dcd0', '#7ec9b0', '#e9d98a', '#f0b566', '#e7894e', '#d75f47'];
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
}
interface MapData {
  width: number;
  height: number;
  counties: Record<string, string>;
  centroids: Record<string, [number, number]>;
  polys: Record<string, [number, number][][]>;
}
interface Dataset {
  map: MapData;
  regionToCounty: Record<string, string[]>;
  banks: Bank[];
}

interface RegionValue {
  val: number | null;
  rd: string | null;
  prev: number | null;
  isCore: boolean;
  parent: string | null;
}

function colorOf(v: number | null, mn: number, mx: number): string {
  if (v == null) return GREY;
  const t = mx > mn ? (v - mn) / (mx - mn) : 0.5;
  return PAL[Math.min(PAL.length - 1, Math.max(0, Math.round(t * (PAL.length - 1))))];
}

export function MapPage() {
  const [data, setData] = useState<Dataset | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bankIdx, setBankIdx] = useState(0);
  const [roundIdx, setRoundIdx] = useState(-1);
  const [selRegion, setSelRegion] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);

  useEffect(() => {
    fetch('/banks-data.json')
      .then((r) => r.json())
      .then((d: Dataset) => {
        setData(d);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  // county name → every region that claims it (a county like 基隆市 belongs to
  // both 大台北 and a standalone 基隆 row when the bank has one).
  const county2regions = useMemo(() => {
    const m: Record<string, string[]> = {};
    if (data) for (const [reg, cs] of Object.entries(data.regionToCounty)) for (const c of cs) (m[c] ||= []).push(reg);
    return m;
  }, [data]);

  const bank = data?.banks[bankIdx] ?? null;

  // region → value for current bank+round, with previous-round value for the trend arrow
  const rv = useMemo(() => {
    const out: Record<string, RegionValue> = {};
    if (!bank) return out;
    for (const r of bank.regions) {
      if (r.nonGeo) continue;
      const present = r.vals.map((v, i) => (v == null ? null : ([i, v] as [number, number]))).filter(Boolean) as [number, number][];
      let val: number | null = null;
      let rd: string | null = null;
      let prev: number | null = null;
      if (roundIdx === -1) {
        if (present.length) {
          [, val] = present[present.length - 1];
          rd = bank.rounds[present[present.length - 1][0]];
          if (present.length >= 2) prev = present[present.length - 2][1];
        }
      } else {
        val = r.vals[roundIdx];
        rd = bank.rounds[roundIdx];
        const pos = present.findIndex(([i]) => i === roundIdx);
        if (pos > 0) prev = present[pos - 1][1];
      }
      out[r.region] = { val, rd, prev, isCore: r.isCore, parent: r.parent };
    }
    return out;
  }, [bank, roundIdx]);

  const [mn, mx] = useMemo(() => {
    const vals = Object.values(rv)
      .map((x) => x.val)
      .filter((v): v is number => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
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

  // Round picker grouped by 民國年 to tame long lists (e.g. 第一銀行's 39 rounds).
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

  const selectRegion = (r: string) => setSelRegion(r);
  const moveTip = (e: React.MouseEvent, html: string) => setTip({ x: e.clientX + 14, y: e.clientY + 14, html });

  if (state === 'loading') return <div className="container py-4 map-page"><p className="calendar-empty">載入中…</p></div>;
  if (state === 'error' || !data || !bank)
    return <div className="container py-4 map-page"><p className="calendar-empty">資料載入失敗，請稍後再試。</p></div>;

  // ranking
  const core = Object.entries(rv).filter(([, x]) => x.isCore);
  const open = core.filter(([, x]) => x.val != null).sort((a, b) => (b[1].val as number) - (a[1].val as number));
  const closed = core.filter(([, x]) => x.val == null);

  const selRow = selRegion ? bank.regions.find((r) => r.region === selRegion) : null;
  const selRec = selRegion ? rv[selRegion] : null;
  const present = selRow ? (selRow.vals.map((v, i) => (v == null ? null : [i, v])).filter(Boolean) as [number, number][]) : [];

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
          錄取分數地圖
        </span>
        <h1 className="map-page-title">八大公股行庫 · 歷年錄取分數</h1>
        <p className="map-page-sub">
          顏色越暖＝門檻越高。地圖看分布，右側排行讀精確分數與升降趨勢（▲門檻變高 / ▼變低）。
        </p>
      </div>

      <div className="map-banks">
        {data.banks.map((b, i) => (
          <button
            key={b.name}
            type="button"
            className={`map-bank ${i === bankIdx ? 'is-active' : ''}`}
            onClick={() => {
              setBankIdx(i);
              setRoundIdx(-1);
              setSelRegion(null);
            }}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="map-toolbar">
        <select className="map-select" value={roundIdx} onChange={(e) => setRoundIdx(Number(e.target.value))}>
          <option value={-1}>最新</option>
          {roundGroups.map((g) => (
            <optgroup key={g.year} label={g.year === '其他' ? '其他' : `${g.year} 年`}>
              {g.items.map((it) => (
                <option key={it.i} value={it.i}>{it.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="map-toolbar-note">{bank.rounds.length} 個梯次 · {bank.regions.length} 個職缺地區</span>
      </div>

      <div className="map-layout">
        {/* ── map ── */}
        <div className="map-card">
          <div className="map-card-head">
            <h2>{bank.name}</h2>
            <span className="round">{roundIdx === -1 ? '最新' : bank.rounds[roundIdx]}</span>
          </div>

          <svg className="map-svg" viewBox={mainViewBox}>
            {Object.entries(data.map.counties).map(([cty, d]) => {
              if (islandCountySet.has(cty)) return null;
              const reg = resolveRegion(cty);
              const rec = reg ? rv[reg] : null;
              const v = rec ? rec.val : null;
              return (
                <path
                  key={cty}
                  className={`map-county ${selRegion && reg === selRegion ? 'is-sel' : ''}`}
                  d={d}
                  fill={colorOf(v, mn, mx)}
                  onMouseMove={(e) => moveTip(e, `<b>${reg ?? cty}</b>　${v != null ? `${v} 分` : '未開缺'}`)}
                  onMouseLeave={() => setTip(null)}
                  onClick={reg && v != null ? () => selectRegion(reg) : undefined}
                />
              );
            })}
            {Object.entries(rv).map(([reg, rec]) => {
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
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const ring of rings)
                  for (const [x, y] of ring) {
                    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                  }
                const pad = 3;
                vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
                dPath = data.map.counties[cty] ?? '';
              }
              return (
                <div
                  key={reg}
                  className={`map-island ${selRegion === reg ? 'is-sel' : ''}`}
                  onClick={v != null ? () => selectRegion(reg) : undefined}
                  onMouseMove={(e) => moveTip(e, `<b>${reg}</b>　${v != null ? `${v} 分` : '未開缺'}`)}
                  onMouseLeave={() => setTip(null)}
                >
                  <svg viewBox={vb}>
                    <path className="map-county" d={dPath} fill={colorOf(v, mn, mx)} />
                  </svg>
                  <div className="nm">{reg}</div>
                  {v != null ? <div className="vv">{v}</div> : <div className="vv empty">未開</div>}
                </div>
              );
            })}
          </div>

          <div className="map-legend">
            <span>易 {isFinite(mn) ? mn.toFixed(0) : '—'}</span>
            {PAL.map((c) => (<i key={c} style={{ background: c }} />))}
            <span>難 {isFinite(mx) ? mx.toFixed(0) : '—'}</span>
            <span style={{ marginLeft: '0.6rem' }}><i style={{ background: GREY }} /> 未開缺</span>
          </div>
        </div>

        {/* ── side panel ── */}
        <div className="map-card map-side">
          {selRec && (
            <>
              <div className="sel-name">{selRegion}</div>
              <div className="sel-score">{selRec.val != null ? selRec.val : '—'}<small> 分</small></div>
              <div className="sel-meta">{selRec.val != null ? `${selRec.rd} 錄取最低分` : '本梯未開缺'}</div>
              {present.length >= 2 && <Sparkline bank={bank} present={present} onTip={moveTip} clearTip={() => setTip(null)} />}
            </>
          )}

          <div className="map-rank-head">
            <span>難度排行</span>
            <span>{open.length} 區開缺</span>
          </div>
          <div className="map-rank">
            {open.map(([reg, x], i) => (
              <div
                key={reg}
                className={`map-row ${reg === selRegion ? 'is-sel' : ''}`}
                onClick={() => selectRegion(reg)}
              >
                <span className="rk">{i + 1}</span>
                <span className="nm">{reg}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(((x.val as number) - mn) / (mx - mn || 1)) * 100}%`, background: colorOf(x.val, mn, mx) }} />
                </span>
                <Delta cur={x.val} prev={x.prev} />
                <span className="v">{x.val}</span>
              </div>
            ))}
            {closed.map(([reg]) => (
              <div key={reg} className="map-row is-empty">
                <span className="rk" />
                <span className="nm">{reg}</span>
                <span className="track" />
                <span className="delta flat" />
                <span className="v">未開</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {tip && (
        <div className="map-tip" style={{ left: tip.x, top: tip.y, opacity: 1 }} dangerouslySetInnerHTML={{ __html: tip.html }} />
      )}
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
  const W = 320, H = 64, P = 6;
  const xmax = bank.rounds.length - 1;
  const vs = present.map((p) => p[1]);
  const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const X = (i: number) => P + (W - 2 * P) * (xmax ? i / xmax : 0.5);
  const Y = (v: number) => P + (H - 2 * P) * (1 - (vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5));
  const d = present.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
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
        {present.map((p) => (
          <circle
            key={p[0]}
            cx={X(p[0]).toFixed(1)}
            cy={Y(p[1]).toFixed(1)}
            r={3}
            fill="#fff"
            stroke="#0f4f49"
            strokeWidth={1.6}
            onMouseMove={(e) => onTip(e, `${bank.rounds[p[0]]}<br><b>${p[1]}</b> 分`)}
            onMouseLeave={clearTip}
          />
        ))}
      </svg>
      <div className="ends">
        <span>{bank.rounds[present[0][0]]}</span>
        <span>歷年走勢</span>
        <span>{bank.rounds[present[present.length - 1][0]]}</span>
      </div>
    </div>
  );
}
