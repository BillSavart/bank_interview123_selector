/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Production ad master switch (Adsterra). Ads only load in a production build
  // when this is exactly "true" AND the slot has a key set in AdSlot.tsx's
  // AD_UNITS table. Unset → no ads on production.
  readonly VITE_ADS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build timestamp (ISO string) injected at build time via vite.config.ts `define`.
declare const __BUILD_TIME__: string;
