export interface TurnstilePublicConfig {
  enabled: boolean;
  siteKey: string;
}

let configPromise: Promise<TurnstilePublicConfig> | null = null;

/** Fetch once per page load; the site key is public, while the secret stays server-side. */
export function fetchTurnstileConfig(): Promise<TurnstilePublicConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/security-config', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('security config unavailable');
        const payload = (await response.json()) as { turnstile?: Partial<TurnstilePublicConfig> };
        return {
          enabled: payload.turnstile?.enabled === true,
          siteKey: typeof payload.turnstile?.siteKey === 'string' ? payload.turnstile.siteKey : '',
        };
      })
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}
