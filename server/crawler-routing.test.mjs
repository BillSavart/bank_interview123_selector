import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const configs = ['deploy/Caddyfile.docker', 'deploy/Caddyfile'].map((file) => ({
  file,
  text: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
}));

describe.each(configs)('$file crawler routing', ({ text }) => {
  it('routes both AdSense crawler identities with article crawlers', () => {
    const matcher = text.match(/header_regexp User-Agent[^\n]+/i)?.[0] || '';
    expect(matcher).toMatch(/mediapartners-google/i);
    expect(matcher).toMatch(/google-display-ads-bot/i);
  });

  it('keeps unknown public paths out of the SPA homepage fallback', () => {
    expect(text).toContain('# Unknown public paths and files are served without an SPA fallback');
  });
});
