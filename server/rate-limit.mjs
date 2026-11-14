// Fixed windows keep both counters and their storage bounded on the small VM.
export function createRateLimit({ windowMs, limit, maxKeys = 2048 }) {
  let window = -1;
  const counts = new Map();
  return (key) => {
    const current = Math.floor(Date.now() / windowMs);
    if (current !== window) {
      counts.clear();
      window = current;
    }
    const count = counts.get(key) || 0;
    if (count >= limit || (count === 0 && counts.size >= maxKeys)) return false;
    counts.set(key, count + 1);
    return true;
  };
}
