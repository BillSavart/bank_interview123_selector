import { describe, expect, it } from 'vitest';
import resourceGuidesJson from './resource-guides.json';

type ResourceGuide = {
  title: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
  related: Array<{ to: string; label: string }>;
  reviewed: string;
};

const guides = resourceGuidesJson as Record<string, ResourceGuide>;
const routes = ['/interview-guide', '/methodology'];

describe('long-form resource guides', () => {
  it('covers both original editorial resources', () => {
    expect(Object.keys(guides).sort()).toEqual([...routes].sort());
  });

  it.each(routes)('%s is substantial, structured and internally linked', (route) => {
    const guide = guides[route];
    const text = [
      guide.title,
      guide.intro,
      ...guide.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets || [])]),
    ].join('');

    expect(guide.sections.length).toBeGreaterThanOrEqual(6);
    expect(text.length).toBeGreaterThanOrEqual(1000);
    expect(guide.related.length).toBeGreaterThanOrEqual(3);
    expect(guide.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
