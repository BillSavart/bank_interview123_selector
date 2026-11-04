import { describe, expect, it } from 'vitest';
import pageGuidesJson from './page-guides.json';

type Guide = {
  heading: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>;
  related?: Array<{ to: string; label: string }>;
  showInApp?: boolean;
  reviewed: string;
};

const guides = pageGuidesJson as Record<string, Guide>;
const interactiveRoutes = [
  '/',
  '/selector',
  '/calendar',
  '/scores-map',
  '/venues',
  '/official-doc-practice',
  '/experience',
  '/salary',
  '/number-trainer',
  '/check-game',
];
const fallbackOnlyRoutes = ['/about', '/privacy', '/terms', '/disclaimer'];
const allRoutes = [...interactiveRoutes, ...fallbackOnlyRoutes];

describe('page editorial guides', () => {
  it('covers every public tool plus the non-JavaScript trust-page fallback', () => {
    expect(Object.keys(guides).sort()).toEqual([...allRoutes].sort());
  });

  it.each(allRoutes)('%s has substantial, structured copy', (route) => {
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

  it.each(interactiveRoutes)('%s exposes useful internal next steps', (route) => {
    expect(guides[route].related?.length).toBeGreaterThanOrEqual(2);
    expect(guides[route].showInApp).not.toBe(false);
  });

  it.each(fallbackOnlyRoutes)('%s does not duplicate the full React trust page', (route) => {
    expect(guides[route].showInApp).toBe(false);
  });
});
