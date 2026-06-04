/// <reference types="vite/client" />

interface ImportMetaEnv {
  // AdSense publisher id, e.g. "ca-pub-1234567890123456". Leave unset locally → ads show a placeholder.
  readonly VITE_ADSENSE_CLIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  adsbygoogle?: unknown[];
}
