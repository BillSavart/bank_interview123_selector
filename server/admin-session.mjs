import { randomBytes, timingSafeEqual } from 'node:crypto';

const sessionLifetimeMs = 60 * 60 * 1000;
const maxSessions = 32;

export function createAdminSessions({ token, origin }) {
  const expected = Buffer.from(token);
  const originUrl = origin ? new URL(origin) : null;
  const cookieName = originUrl?.protocol === 'https:' ? '__Host-admin-session' : 'admin-session';
  const sessions = new Map();

  const sessionKey = (req) =>
    (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1];

  const cookie = (value, maxAge) =>
    `${cookieName}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict` +
    (originUrl?.protocol === 'https:' ? '; Secure' : '');

  return {
    acceptsHost(req) {
      return !originUrl || req.headers.host?.toLowerCase() === originUrl.host;
    },

    acceptsOrigin(req) {
      return req.headers.origin === (originUrl?.origin || `http://${req.headers.host}`);
    },

    matchesToken(value) {
      if (!expected.length || typeof value !== 'string') return false;
      const supplied = Buffer.from(value);
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    },

    authenticated(req) {
      const key = sessionKey(req);
      const expiry = sessions.get(key);
      if (expiry > Date.now()) return true;
      sessions.delete(key);
      return false;
    },

    start(req) {
      sessions.delete(sessionKey(req));
      const now = Date.now();
      for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      const key = randomBytes(32).toString('hex');
      sessions.set(key, now + sessionLifetimeMs);
      return cookie(key, sessionLifetimeMs / 1000);
    },

    end(req) {
      sessions.delete(sessionKey(req));
      return cookie('', 0);
    },
  };
}
