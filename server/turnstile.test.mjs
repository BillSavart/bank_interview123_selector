import { describe, expect, it, vi } from 'vitest';
import { createTurnstileVerifier } from './turnstile.mjs';

const successResponse = (overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    hostname: 'bank-interview-advisor.com',
    action: 'post-submit',
    ...overrides,
  }),
});

describe('Turnstile verifier', () => {
  it('stays disabled when neither key is configured', async () => {
    const fetchImpl = vi.fn();
    const verifier = createTurnstileVerifier({ siteKey: '', secretKey: '', fetchImpl });

    expect(verifier.enabled).toBe(false);
    await expect(verifier.verify({ token: '', action: 'post-submit' })).resolves.toEqual({
      ok: true,
      skipped: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when only one key is configured', async () => {
    const verifier = createTurnstileVerifier({ siteKey: 'site-key', secretKey: '' });

    expect(verifier.partiallyConfigured).toBe(true);
    await expect(verifier.verify({ token: 'token', action: 'post-submit' })).resolves.toMatchObject({
      ok: false,
      status: 503,
      reason: 'misconfigured',
    });
  });

  it('requires a token without calling Siteverify', async () => {
    const fetchImpl = vi.fn();
    const verifier = createTurnstileVerifier({ siteKey: 'site-key', secretKey: 'secret-key', fetchImpl });

    await expect(verifier.verify({ token: '', action: 'post-submit' })).resolves.toMatchObject({
      ok: false,
      status: 400,
      reason: 'missing-token',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('validates the token, hostname, action, and client IP', async () => {
    const fetchImpl = vi.fn(async () => successResponse());
    const verifier = createTurnstileVerifier({
      siteKey: 'site-key',
      secretKey: 'secret-key',
      expectedHostnames: 'bank-interview-advisor.com,www.bank-interview-advisor.com',
      fetchImpl,
    });

    await expect(
      verifier.verify({ token: 'browser-token', remoteIp: '203.0.113.8', action: 'post-submit' }),
    ).resolves.toMatchObject({ ok: true, hostname: 'bank-interview-advisor.com', action: 'post-submit' });

    const [url, request] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(request.body);
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(body.get('secret')).toBe('secret-key');
    expect(body.get('response')).toBe('browser-token');
    expect(body.get('remoteip')).toBe('203.0.113.8');
    expect(body.get('idempotency_key')).toMatch(/^[a-f0-9-]{36}$/);
  });

  it.each([
    [{ success: false, 'error-codes': ['invalid-input-response'] }, 'provider-rejected'],
    [{ hostname: 'attacker.example' }, 'hostname-mismatch'],
    [{ action: 'comment-submit' }, 'action-mismatch'],
  ])('rejects an invalid Siteverify result', async (overrides, reason) => {
    const verifier = createTurnstileVerifier({
      siteKey: 'site-key',
      secretKey: 'secret-key',
      expectedHostnames: 'bank-interview-advisor.com',
      fetchImpl: vi.fn(async () => successResponse(overrides)),
    });

    await expect(verifier.verify({ token: 'token', action: 'post-submit' })).resolves.toMatchObject({
      ok: false,
      status: 400,
      reason,
    });
  });

  it('returns a temporary failure when Siteverify is unavailable', async () => {
    const verifier = createTurnstileVerifier({
      siteKey: 'site-key',
      secretKey: 'secret-key',
      fetchImpl: vi.fn(async () => ({ ok: false, status: 502 })),
    });

    await expect(verifier.verify({ token: 'token', action: 'post-submit' })).resolves.toMatchObject({
      ok: false,
      status: 503,
      reason: 'provider-502',
    });
  });
});
