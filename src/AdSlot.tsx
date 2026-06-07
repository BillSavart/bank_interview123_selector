import { useEffect, useRef } from 'react';

interface AdSlotProps {
  // The ad unit's slot id from AdSense (data-ad-slot). Required for real ads.
  slot: string;
  // Optional label shown on the placeholder while no publisher id is configured.
  label?: string;
}

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
// 本地開發 (vite dev) 一律顯示佔位框讓你檢視版位。
const IS_DEV = import.meta.env.DEV;
// 正式環境必須「明確」開啟廣告（VITE_ADS_ENABLED=true）且有設定 client 才會顯示。
// 預設為關，確保上線版本先不出現任何廣告——即使 CI 帶了 ADSENSE_CLIENT 也不會顯示。
const ADS_ENABLED_PROD = import.meta.env.VITE_ADS_ENABLED === 'true' && !!ADSENSE_CLIENT;

// 廣告是否會實際呈現（本地佔位 or 正式已正式開啟）。供呼叫端決定要不要連同外層
// 容器一起渲染，避免正式環境出現一堆空的廣告間距。
export const AD_ENABLED = IS_DEV || ADS_ENABLED_PROD;

// Inject the AdSense loader script once, only when a publisher id is configured.
// (Keeps Google's script out of local dev / unconfigured builds entirely.)
function ensureAdScript(client: string) {
  if (document.querySelector('script[data-adsense-loader]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-adsense-loader', 'true');
  document.head.appendChild(s);
}

// Non-intrusive in-feed/display ad. No pop-ups, no interstitials.
// Renders a visible placeholder until VITE_ADSENSE_CLIENT is set, so the
// layout can be tested locally without an AdSense account.
export function AdSlot({ slot, label = '廣告' }: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const showReal = !IS_DEV && ADS_ENABLED_PROD;

  useEffect(() => {
    if (!showReal) return;
    ensureAdScript(ADSENSE_CLIENT as string);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle may not be ready yet; it retries on next render/script load
    }
  }, [showReal]);

  // 本地：顯示預留版位的佔位框。
  if (IS_DEV) {
    return (
      <div className="ad-slot ad-slot-placeholder" aria-hidden="true">
        {label}（廣告版位 · 僅本地顯示，正式上線暫不顯示）
      </div>
    );
  }

  // 正式環境且尚未設定 AdSense client → 預留版位但先不顯示任何東西。
  if (!ADSENSE_CLIENT) return null;

  return (
    <div className="ad-slot">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
