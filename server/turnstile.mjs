import { randomUUID } from 'node:crypto';

const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const defaultHostnames = 'bank-interview-advisor.com,www.bank-interview-advisor.com';

const parseHostnames = (value) =>
  String(value || '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

const failure = (status, error, reason) => ({ ok: false, status, error, reason });

/**
 * Server-side Cloudflare Turnstile verification.
 *
 * No keys means deliberately disabled, which keeps local development and
 * existing installations working. Supplying only one key is treated as a
 * deployment error and fails closed for protected writes.
 */
export function createTurnstileVerifier(options = {}) {
  const siteKey = String(options.siteKey ?? process.env.TURNSTILE_SITE_KEY ?? '').trim();
  const secretKey = String(options.secretKey ?? process.env.TURNSTILE_SECRET_KEY ?? '').trim();
  const expectedHostnames = parseHostnames(
    options.expectedHostnames ?? process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? defaultHostnames,
  );
  const timeoutMs = Number(options.timeoutMs ?? process.env.TURNSTILE_TIMEOUT_MS ?? 5000);
  const fetchImpl = options.fetchImpl ?? fetch;
  const enabled = Boolean(siteKey && secretKey);
  const partiallyConfigured = Boolean(siteKey || secretKey) && !enabled;

  return {
    enabled,
    partiallyConfigured,
    missing: [!siteKey && 'TURNSTILE_SITE_KEY', !secretKey && 'TURNSTILE_SECRET_KEY'].filter(Boolean),
    publicConfig: {
      enabled,
      siteKey: enabled ? siteKey : '',
    },

    async verify({ token, remoteIp, action }) {
      if (partiallyConfigured) {
        return failure(503, '安全驗證服務設定不完整，請稍後再試。', 'misconfigured');
      }
      if (!enabled) return { ok: true, skipped: true };

      const responseToken = typeof token === 'string' ? token.trim() : '';
      if (!responseToken) {
        return failure(400, '請先完成安全驗證。', 'missing-token');
      }
      if (responseToken.length > 2048) {
        return failure(400, '安全驗證資料無效，請重新驗證。', 'invalid-token');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);

      try {
        const form = new URLSearchParams({
          secret: secretKey,
          response: responseToken,
          idempotency_key: randomUUID(),
        });
        if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);

        const response = await fetchImpl(siteverifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: controller.signal,
        });
        if (!response.ok) {
          return failure(503, '安全驗證服務暫時無法使用，請稍後再試。', `provider-${response.status}`);
        }

        const result = await response.json();
        if (!result?.success) {
          const codes = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];
          const duplicate = codes.includes('timeout-or-duplicate');
          return failure(
            400,
            duplicate ? '安全驗證已逾時，請重新驗證。' : '安全驗證失敗，請重新驗證。',
            duplicate ? 'expired-or-duplicate' : 'provider-rejected',
          );
        }

        const hostname = String(result.hostname || '').toLowerCase();
        if (expectedHostnames.length > 0 && !expectedHostnames.includes(hostname)) {
          return failure(400, '安全驗證來源不符，請重新整理後再試。', 'hostname-mismatch');
        }
        if (action && result.action !== action) {
          return failure(400, '安全驗證用途不符，請重新整理後再試。', 'action-mismatch');
        }

        return { ok: true, hostname, action: result.action || '' };
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timeout' : 'network-error';
        return failure(503, '安全驗證服務暫時無法使用，請稍後再試。', reason);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
