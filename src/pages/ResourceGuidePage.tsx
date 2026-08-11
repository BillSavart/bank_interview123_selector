import { BookOpenCheck, CalendarCheck, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import resourceGuidesJson from '../data/resource-guides.json';

type ResourceSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

type ResourceGuide = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ResourceSection[];
  related: Array<{ to: string; label: string }>;
  reviewed: string;
};

const resourceGuides = resourceGuidesJson as Record<string, ResourceGuide>;

export function ResourceGuidePage({ guidePath }: { guidePath: string }) {
  const guide = resourceGuides[guidePath];

  if (!guide) return null;

  return (
    <article className="container py-4 resource-guide-page">
      <header className="resource-guide-hero">
        <div className="interview-kicker">
          <BookOpenCheck size={18} />
          {guide.eyebrow}
        </div>
        <h1 className="display-title mb-3">{guide.title}</h1>
        <p className="page-intro">{guide.intro}</p>
        <p className="resource-guide-reviewed">
          <CalendarCheck size={16} />
          人工檢視日期：{guide.reviewed}
        </p>
      </header>

      <div className="resource-guide-content">
        {guide.sections.map((section) => (
          <section key={section.heading} className="resource-guide-section">
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>

      <aside className="resource-guide-next" aria-labelledby="resource-guide-next-title">
        <h2 id="resource-guide-next-title">接著使用站內工具</h2>
        <div className="resource-guide-links">
          {guide.related.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
              <ExternalLink size={15} />
            </Link>
          ))}
        </div>
      </aside>
    </article>
  );
}
