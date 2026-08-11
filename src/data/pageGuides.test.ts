import { describe, expect, it } from 'vitest';
import pageGuidesJson from './page-guides.json';

type Guide = {
  heading: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>;
  reviewed: string;
};

const guides = pageGuidesJson as Record<string, Guide>;
const coreRoutes = ['/', '/selector', '/calendar', '/scores-map', '/venues', '/official-doc-practice', '/experience', '/salary'];

describe('page editorial guides', () => {
  it('covers every core route in the minimum AdSense-ready scope', () => {
    expect(Object.keys(guides).sort()).toEqual([...coreRoutes].sort());
  });

  it.each(coreRoutes)('%s has substantial, structured copy', (route) => {
    const guide = guides[route];
    const text = [
      guide.heading,
      guide.intro,
      ...guide.sections.flatMap((section) => [section.heading, ...(section.paragraphs || []), ...(section.bullets || [])]),
    ].join('');

    expect(guide.sections.length).toBeGreaterThanOrEqual(2);
    expect(text.length).toBeGreaterThanOrEqual(220);
    expect(guide.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
