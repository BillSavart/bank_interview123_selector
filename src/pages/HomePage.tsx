import { Fragment, useMemo, useState } from 'react';
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { hasAnswer, renderStoredAnswer } from '../data/answerBank';
import { interviewQuestions } from '../data/questions.generated';
import { AdSlot } from '../AdSlot';
import { CandidateControls } from '../components/CandidateControls';
import { categorySummary, defaultProfile, isProfileEmpty, scoreQuestion, tagLabels } from '../lib/scoring';
import type { CandidateProfile, InterviewQuestion } from '../data/types';

export function HomePage() {
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile);
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeDifficulty, setActiveDifficulty] = useState<InterviewQuestion['difficulty'] | '全部'>('全部');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(() => new Set());

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(interviewQuestions.map((question) => question.category)))],
    [],
  );

  const rankedQuestions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const hasProfileCriteria = !isProfileEmpty(profile);
    const scoringProfile: CandidateProfile = hasProfileCriteria
      ? {
          ...profile,
          isFreshGraduate: profile.isFreshGraduate === 'yes' ? 'yes' : 'no',
          hasBankExperience: profile.hasBankExperience === 'yes' ? 'yes' : 'no',
          hasSalesExperience: profile.hasSalesExperience === 'yes' ? 'yes' : 'no',
        }
      : profile;

    const filteredQuestions = interviewQuestions
      .filter((question) => activeDifficulty === '全部' || question.difficulty === activeDifficulty)
      .filter((question) => activeCategory === '全部' || question.category === activeCategory)
      .filter((question) => {
        if (!normalizedKeyword) return true;
        return `${question.question} ${question.category} ${question.tags.join(' ')}`.toLowerCase().includes(normalizedKeyword);
      });

    return filteredQuestions
      .map((question) => (hasProfileCriteria ? scoreQuestion(question, scoringProfile) : { question, score: 0, reasons: [] }))
      .sort((a, b) => (hasProfileCriteria ? b.score - a.score || a.question.id - b.question.id : a.question.id - b.question.id))
      .slice(0, profile.practiceSize);
  }, [activeCategory, activeDifficulty, keyword, profile]);

  const overviewQuestions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return interviewQuestions
      .filter((question) => activeDifficulty === '全部' || question.difficulty === activeDifficulty)
      .filter((question) => {
        if (!normalizedKeyword) return true;
        return `${question.question} ${question.category} ${question.tags.join(' ')}`.toLowerCase().includes(normalizedKeyword);
      });
  }, [activeDifficulty, keyword]);

  const profileIsEmpty = isProfileEmpty(profile);
  const visibleQuestions = rankedQuestions.map((item) => item.question);
  const showDefaultCategoryOverview = profileIsEmpty && !keyword.trim() && activeDifficulty === '全部' && activeCategory === '全部';
  const summary = categorySummary(showDefaultCategoryOverview ? interviewQuestions : visibleQuestions);
  const topScore = rankedQuestions[0]?.score ?? 0;

  const handleResetFilters = () => {
    setProfile(defaultProfile);
    setKeyword('');
    setActiveCategory('全部');
    setActiveDifficulty('全部');
    setExpandedAnswers(new Set());
  };

  const toggleDifficulty = (difficulty: InterviewQuestion['difficulty']) => {
    setActiveDifficulty((current) => (current === difficulty ? '全部' : difficulty));
  };

  const toggleCategory = (category: string) => {
    setActiveCategory((current) => (current === category ? '全部' : category));
  };

  const toggleAnswer = (questionId: number) => {
    setExpandedAnswers((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const updateProfile = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    setProfile((current) => {
      if (key === 'hasBankExperience' && value !== 'yes') {
        return { ...current, hasBankExperience: value as CandidateProfile['hasBankExperience'], bankYears: defaultProfile.bankYears };
      }

      return { ...current, [key]: value };
    });
  };

  return (
    <>
      <section className="hero-band">
        <div className="container py-4 py-lg-5">
          <div className="row g-4 align-items-end">
            <div className="col-lg-7">
              <div className="d-inline-flex align-items-center gap-2 hero-kicker mb-3">
                <Banknote size={18} />
                公股銀行面試題庫
              </div>
              <h1 className="display-title mb-3">公股銀行面試題目選擇器</h1>
              <p className="hero-copy mb-0">
                依照考生背景排序 123 題常見口試題，快速抓出最該優先練的動機題、情境題、業務題與時事題。
                選好條件後可直接展開每題的答題方向與示範回答。
              </p>
            </div>
            <div className="col-lg-5">
              <div className="hero-metrics">
                <div>
                  <strong>{interviewQuestions.length}</strong>
                  <span>題庫題目</span>
                </div>
                <div>
                  <strong>{categories.length - 1}</strong>
                  <span>題型分類</span>
                </div>
                <div>
                  <strong>{rankedQuestions.length}</strong>
                  <span>本次推薦</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-band">
        <div className="container py-4">
          <button className="btn btn-dark mobile-filter-button mb-3" type="button" onClick={() => setIsFilterOpen(true)}>
            <SlidersHorizontal size={18} />
            考生條件
          </button>

          <div className="row g-4">
            <aside className="col-lg-4 col-xl-3 desktop-filter-panel">
              <CandidateControls profile={profile} onUpdate={updateProfile} onReset={handleResetFilters} idPrefix="desktop" />
            </aside>

            <div className="col-lg-8 col-xl-9">
              <div className="toolbar">
                <div className="search-box">
                  <Search size={19} />
                  <input
                    type="search"
                    placeholder="搜尋題目、分類或標籤"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    aria-label="搜尋題目"
                  />
                </div>
                <select
                  className="form-select category-select"
                  value={activeCategory}
                  onChange={(event) => setActiveCategory(event.target.value)}
                  aria-label="題型分類"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="result-overview">
                <div className="overview-summary">
                  <div className="overview-item accent-teal" aria-live="polite">
                    <ClipboardCheck size={20} />
                    <div>
                      <span>題目適配度</span>
                      <strong>{profileIsEmpty ? '未排序' : `${Math.round((topScore / 100) * 100)}%`}</strong>
                    </div>
                  </div>
                  <button
                    className={`overview-item overview-button accent-amber ${activeDifficulty === '進階' ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => toggleDifficulty('進階')}
                    aria-pressed={activeDifficulty === '進階'}
                  >
                    <ShieldCheck size={20} />
                    <div>
                      <span>進階題</span>
                      <strong>{overviewQuestions.filter((question) => question.difficulty === '進階').length}</strong>
                    </div>
                  </button>
                </div>
                <div className="category-pills">
                  {Object.entries(summary).map(([category, count]) => (
                    <button
                      className={activeCategory === category ? 'is-active' : ''}
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      aria-pressed={activeCategory === category}
                    >
                      {category} {count}
                    </button>
                  ))}
                </div>
              </div>

              <AdSlot slot="0000000000" label="贊助" />

              <div className="question-list">
                {rankedQuestions.map(({ question, score, reasons }, index) => (
                  <Fragment key={question.id}>
                    {index > 0 && index % 8 === 0 && <AdSlot slot="1111111111" />}
                    <article className="question-card">
                      <div className="question-rank">
                        <span>#{question.id}</span>
                      </div>
                      <div className="question-body">
                        <div className="question-meta">
                          <span>{question.category}</span>
                          <span>{question.difficulty}</span>
                        </div>
                        <h3>{question.question}</h3>
                        {!profileIsEmpty && (
                          <div className="reason-row">
                            {(reasons.length ? reasons : ['一般題庫練習']).map((reason) => (
                              <span key={reason}>{reason}</span>
                            ))}
                          </div>
                        )}
                        <div className="tag-row">
                          {question.tags.slice(0, 6).map((tag) => (
                            <span key={tag}>{tagLabels[tag]}</span>
                          ))}
                        </div>
                        <div className="question-actions">
                          {!profileIsEmpty && <div className="match-score">題目適配度 {score}%</div>}
                          <button
                            className="btn btn-dark answer-toggle-button"
                            type="button"
                            onClick={() => toggleAnswer(question.id)}
                            aria-expanded={expandedAnswers.has(question.id)}
                          >
                            {expandedAnswers.has(question.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {expandedAnswers.has(question.id) ? '收合答案' : hasAnswer(question.id) ? '展開答案' : '尚未填答'}
                          </button>
                        </div>
                        {expandedAnswers.has(question.id) && (
                          <div className="prebuilt-answer">
                            {renderStoredAnswer(question, profile)}
                          </div>
                        )}
                      </div>
                    </article>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isFilterOpen && (
        <div className="filter-modal" role="dialog" aria-modal="true" aria-label="考生條件">
          <button
            className="filter-backdrop"
            type="button"
            aria-label="關閉考生條件"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="filter-drawer">
            <CandidateControls
              profile={profile}
              onUpdate={updateProfile}
              onReset={handleResetFilters}
              idPrefix="mobile"
              showClose
              onClose={() => setIsFilterOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
