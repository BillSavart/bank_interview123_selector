import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = 'bank-voter';
const maxAge = 365 * 24 * 60 * 60;

export function createVoterSessions({ secret, secure }) {
  const sign = (id) => createHmac('sha256', secret).update(`bank-voter:${id}`).digest('hex');
  return {
    read(req) {
      const match = (req.headers.cookie || '').match(/(?:^|;\s*)bank-voter=(v2_[a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/);
      if (!match) return null;
      const [, id, signature] = match;
      return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id))) ? id : null;
    },
    issue() {
      const id = `v2_${randomBytes(16).toString('hex')}`;
      return `${cookieName}=${id}.${sign(id)}; Max-Age=${maxAge}; Path=/api; HttpOnly; SameSite=Strict` +
        (secure ? '; Secure' : '');
    },
  };
}
