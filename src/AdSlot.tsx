import { useEffect, useRef } from 'react';

interface AdSlotProps {
  // The ad unit's slot id from AdSense (data-ad-slot). Required for real ads.
  slot: string;
  // Optional label shown on the placeholder while no publisher id is configured.
  label?: string;
}

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;

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

  useEffect(() => {
    if (!ADSENSE_CLIENT) return;
    ensureAdScript(ADSENSE_CLIENT);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle may not be ready yet; it retries on next render/script load
    }
  }, []);

  if (!ADSENSE_CLIENT) {
    return (
      <div className="ad-slot ad-slot-placeholder" aria-hidden="true">
        {label}（廣告位 · 設定 VITE_ADSENSE_CLIENT 後顯示）
      </div>
    );
  }

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
