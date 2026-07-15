import { useEffect, useRef, useState } from 'react';
import { fetchTurnstileConfig } from '../lib/turnstile';

const scriptId = 'cloudflare-turnstile-script';
const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileChallenge {
  /** null while runtime configuration is loading. */
  required: boolean | null;
  token: string;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: 'auto';
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile API unavailable'));
    };
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Turnstile script failed')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export function TurnstileWidget({
  action,
  challenge,
  onChange,
  resetKey = 0,
}: {
  action: 'post-submit' | 'comment-submit';
  challenge: TurnstileChallenge;
  onChange: (next: TurnstileChallenge) => void;
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    onChange({ required: null, token: '' });

    fetchTurnstileConfig()
      .then((config) => {
        if (cancelled) return;
        if (!config.enabled || !config.siteKey) {
          setEnabled(false);
          onChange({ required: false, token: '' });
          return;
        }

        setEnabled(true);
        onChange({ required: true, token: '' });
        return loadTurnstile().then((api) => {
          if (cancelled || !containerRef.current) return;
          widgetIdRef.current = api.render(containerRef.current, {
            sitekey: config.siteKey,
            action,
            theme: 'auto',
            language: 'zh-TW',
            callback: (token) => {
              setError('');
              onChange({ required: true, token });
            },
            'expired-callback': () => {
              onChange({ required: true, token: '' });
              setError('安全驗證已逾時，請再試一次。');
            },
            'error-callback': () => {
              onChange({ required: true, token: '' });
              setError('安全驗證載入失敗，請重新整理後再試。');
            },
          });
        });
      })
      .catch(() => {
        if (cancelled) return;
        setEnabled(true);
        onChange({ required: true, token: '' });
        setError('安全驗證載入失敗，請重新整理後再試。');
      });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [action, onChange]);

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onChange({ required: true, token: '' });
    }
  }, [onChange, resetKey]);

  if (enabled === false) return null;

  return (
    <div className="turnstile-challenge" aria-live="polite">
      <div ref={containerRef} />
      {enabled === null && <span className="turnstile-status">正在載入安全驗證…</span>}
      {error && <span className="turnstile-error">{error}</span>}
      {enabled && !error && challenge.required && !challenge.token && (
        <span className="turnstile-status">請完成安全驗證後再送出。</span>
      )}
    </div>
  );
}
