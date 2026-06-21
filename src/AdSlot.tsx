import { useEffect, useRef } from 'react';

// === Adsterra 廣告單元設定 =================================================
// 每個「邏輯版位」對應一個 Adsterra 廣告單元。等你從 Adsterra 後台拿到各單元的
// 程式碼後，把對應欄位填進這張表即可，呼叫端（各頁面）完全不用改。
//
// Banner 單元的後台程式碼長這樣：
//   atOptions = { 'key':'XXXX', 'format':'iframe', 'height':250, 'width':300, ... };
//   <script src="//www.highperformanceformat.com/XXXX/invoke.js"></script>
//   → key 填 'XXXX'；width/height 照後台；host 預設 highperformanceformat.com，
//     若你的 <script src> 網域不同就填 invokeHost。
//
// Native Banner 單元的後台程式碼長這樣：
//   <script async src="//plXXXX.somehost.com/<hash>/invoke.js"></script>
//   <div id="container-<hash>"></div>
//   → key 填 '<hash>'（對應 container- 後面那段）；src 填整段 <script> 的網址。
type BannerSpec = {
  key: string;
  width: number;
  height: number;
  invokeHost?: string; // 預設 www.highperformanceformat.com
};
type BannerUnit = {
  format: 'banner';
  desktop: BannerSpec; // ≥768px 載入這個
  mobile?: BannerSpec; // <768px 載入這個；省略則沿用 desktop
};
type NativeUnit = {
  format: 'native';
  key: string; // 容器 hash，對應 <div id="container-${key}">
  src: string; // 整段 async invoke.js 的網址（含子網域）
};
// 內容中可重複插入的 banner：實際 spec 從 FEED_BANNERS 池依 variant 輪流取用。
type FeedBannerUnit = { format: 'feed-banner' };
type AdUnit = BannerUnit | NativeUnit | FeedBannerUnit;

const DEFAULT_BANNER_HOST = 'www.highperformanceformat.com';

// 目前全站統一使用最小的 320×50 banner（大尺寸素材品質差）。300×250 單元保留
// 備用——要改回大尺寸時，把對應版位 / FEED_BANNERS 換成 BANNER_300x250 即可。
const BANNER_320x50: BannerSpec = { key: '0c7ff4a858fd628149179a6084782ae2', width: 320, height: 50 };
const BANNER_300x250: BannerSpec = { key: '51df605e351cba0f6ceb784cc9233022', width: 300, height: 250 };

// 內插 banner 池：題目列表 / 文章內每個內插位置，依序輪流取用池中的下一個
// （variant % 長度）。⚠️ 現在只有 1 個 320×50 key → 內插位置全部共用它，Adsterra
// 可能只穩定填第一個、其餘空白或重複同素材。建好更多獨立 320×50 單元後，把每個
// spec 加進這個陣列即可——內插廣告會自動分散到不同 key，穩定填充又不重複。
const FEED_BANNERS: BannerSpec[] = [
  BANNER_320x50,
  // { key: '（新單元 key）', width: 320, height: 50 },
];

// 全站固定版位（上 / 下）與內插位置都用 320×50。⚠️ 因此整站只用到同一個 key，
// 同一頁多個版位會共用它（同上：可能只填第一個）；要穩定填充就多建獨立單元。
// key 留空 = 該版位在正式環境不顯示（本地仍會顯示佔位框供檢視）。
const AD_UNITS: Record<string, AdUnit> = {
  'landing-top': { format: 'banner', desktop: BANNER_320x50 },
  'site-top': { format: 'banner', desktop: BANNER_320x50 },
  'site-bottom': { format: 'banner', desktop: BANNER_320x50 },
  'home-feed': { format: 'feed-banner' },
  'article-mid': { format: 'feed-banner' },
};
// ==========================================================================

// 本地開發 (vite dev) 一律顯示佔位框讓你檢視版位。
const IS_DEV = import.meta.env.DEV;
// 正式環境必須「明確」開啟廣告（VITE_ADS_ENABLED=true）才會載入 Adsterra。
// 預設為關，確保上線版本在你還沒填 key 前不會出現任何廣告。
const ADS_ENABLED_PROD = import.meta.env.VITE_ADS_ENABLED === 'true';

// 廣告是否會實際呈現（本地佔位 or 正式已開啟）。供呼叫端決定要不要連同外層
// 容器一起渲染，避免正式環境出現一堆空的廣告間距。
export const AD_ENABLED = IS_DEV || ADS_ENABLED_PROD;

interface AdSlotProps {
  // 邏輯版位名稱，對應上面 AD_UNITS 的 key。
  slot: string;
  // 佔位框（本地）顯示的標籤文字。
  label?: string;
  // 同一版位重複出現時的序號（0 起）。feed-banner 用它從 FEED_BANNERS 池輪流取 key。
  variant?: number;
}

// 把 feed-banner 解析成實際的 banner 單元：依 variant 從 FEED_BANNERS 池輪流取用。
function resolveUnit(unit: AdUnit | undefined, variant: number): BannerUnit | NativeUnit | undefined {
  if (unit?.format !== 'feed-banner') return unit;
  const pool = FEED_BANNERS;
  if (pool.length === 0) return undefined;
  return { format: 'banner', desktop: pool[variant % pool.length] };
}

// 非侵入式的內嵌廣告：只有 banner 與 native banner，沒有彈窗 / 插頁 / social bar。
// 本地顯示佔位框；正式環境且該版位已設定 key 時才載入 Adsterra 程式碼。
export function AdSlot({ slot, label = '廣告', variant = 0 }: AdSlotProps) {
  const unit = resolveUnit(AD_UNITS[slot], variant);

  // 本地：顯示預留版位的佔位框（不載入任何 Adsterra 程式碼）。
  if (IS_DEV) {
    let desc = '未設定';
    if (unit?.format === 'banner') {
      const d = unit.desktop;
      const m = unit.mobile;
      desc = `Banner 桌機 ${d.width}×${d.height}` + (m ? ` / 手機 ${m.width}×${m.height}` : '');
    } else if (unit?.format === 'native') {
      desc = 'Native Banner';
    }
    return (
      <div className="ad-slot ad-slot-placeholder" aria-hidden="true">
        {label}（{desc} · 僅本地顯示，正式上線才載入）
      </div>
    );
  }

  // 正式環境：沒開廣告、版位沒設定、或 key 還沒填 → 不渲染任何東西。
  const configured = unit && (unit.format === 'banner' ? !!unit.desktop.key : !!unit.key);
  if (!ADS_ENABLED_PROD || !configured) return null;

  return unit.format === 'banner' ? (
    <AdsterraBanner unit={unit} />
  ) : (
    <AdsterraNative unit={unit} />
  );
}

// Banner：依視窗寬度挑桌機 / 手機尺寸，只載入其中一個（不重複載入、不重複計費）。
// 用 iframe srcdoc 隔離：Adsterra banner 透過「全域」atOptions 設定，同一頁多個
// banner 會互相覆蓋；包進各自的 iframe 就不會打架，卸載也乾淨。
function AdsterraBanner({ unit }: { unit: BannerUnit }) {
  // createRoot 只在瀏覽器跑（prerender 不渲染 React），window 一定存在。
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const spec = isDesktop ? unit.desktop : unit.mobile ?? unit.desktop;
  const host = spec.invokeHost ?? DEFAULT_BANNER_HOST;
  const atOptions = JSON.stringify({
    key: spec.key,
    format: 'iframe',
    height: spec.height,
    width: spec.width,
    params: {},
  });
  const srcDoc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>' +
    `<script type="text/javascript">atOptions=${atOptions};</script>` +
    `<script type="text/javascript" src="//${host}/${spec.key}/invoke.js"></script>` +
    '</body></html>';

  return (
    <div className="ad-slot" style={{ display: 'flex', justifyContent: 'center' }}>
      <iframe
        title="廣告"
        srcDoc={srcDoc}
        width={spec.width}
        height={spec.height}
        style={{ border: 0, overflow: 'hidden', width: spec.width, height: spec.height }}
      />
    </div>
  );
}

// Native Banner：載入 async invoke.js，腳本會自己找 container-<key> 的 div 填內容。
function AdsterraNative({ unit }: { unit: NativeUnit }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !unit.src) return;
    // 避免重複插入（route 切換 / 重新掛載）。
    if (host.querySelector('script[data-adsterra-native]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.setAttribute('data-cfasync', 'false');
    s.setAttribute('data-adsterra-native', 'true');
    s.src = /^(https?:)?\/\//.test(unit.src) ? unit.src : `//${unit.src}`;
    host.appendChild(s);
  }, [unit.src]);

  return (
    <div className="ad-slot" ref={hostRef}>
      <div id={`container-${unit.key}`} />
    </div>
  );
}
