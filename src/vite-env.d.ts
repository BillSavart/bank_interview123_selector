/// <reference types="vite/client" />

interface ImportMetaEnv {
  // AdSense publisher id, e.g. "ca-pub-1234567890123456". Leave unset locally → ads show a placeholder.
  readonly VITE_ADSENSE_CLIENT?: string;
  // Production ad master switch. Ads only render in a production build when this
  // is exactly "true" AND VITE_ADSENSE_CLIENT is set. Unset → no ads on production.
  readonly VITE_ADS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  adsbygoogle?: unknown[];
}

// Build timestamp (ISO string) injected at build time via vite.config.ts `define`.
declare const __BUILD_TIME__: string;
