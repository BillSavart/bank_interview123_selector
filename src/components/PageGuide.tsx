import { BookOpenCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import pageGuidesJson from '../data/page-guides.json';

type GuideSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

type PageGuideContent = {
  eyebrow: string;
  heading: string;
  intro: string;
  sections: GuideSection[];
  related?: Array<{ to: string; label: string }>;
  showInApp?: boolean;
  reviewed: string;
};

const pageGuides = pageGuidesJson as Record<string, PageGuideContent>;

const guidePath = (pathname: string) => {
  if (pathname.startsWith('/official-doc-practice/')) return '/official-doc-practice';
  return pathname.replace(/\/+$/, '') || '/';
};

export function PageGuide() {
  const { pathname } = useLocation();
  const guide = pageGuides[guidePath(pathname)];

  if (!guide || guide.showInApp === false) return null;

  return (
    <section className="page-guide" aria-labelledby="page-guide-title">
      <div className="container py-5">
        <div className="page-guide-card">
          <div className="page-guide-eyebrow">
            <BookOpenCheck size={17} />
            {guide.eyebrow}
          </div>
          <h2 id="page-guide-title" className="page-guide-title">
            {guide.heading}
          </h2>
          <p className="page-guide-intro">{guide.intro}</p>

          <div className="page-guide-grid">
            {guide.sections.map((section) => (
              <section key={section.heading} className="page-guide-section">
                <h3>{section.heading}</h3>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <p className="page-guide-meta">
            內容整理：公股銀行新手村編輯　·　方法說明更新：{guide.reviewed}
          </p>
          {guide.related && (
            <nav className="page-guide-related" aria-label="延伸閱讀">
              <strong>延伸閱讀</strong>
              {guide.related.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
