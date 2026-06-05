import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  ClipboardCheck,
  Download,
  MessageSquare,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import { interviewQuestions } from '../data/questions.generated';
import { AdSlot } from '../AdSlot';
import {
  categorySummary,
  defaultProfile,
  focusLabel,
  isProfileEmpty,
  scoreQuestion,
  tagLabels,
} from '../lib/scoring';
import type { CandidateProfile, InterviewQuestion } from '../data/types';

export function HomePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile);
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeDifficulty, setActiveDifficulty] = useState<InterviewQuestion['difficulty'] | '全部'>('全部');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
  };

  const toggleDifficulty = (difficulty: InterviewQuestion['difficulty']) => {
    setActiveDifficulty((current) => (current === difficulty ? '全部' : difficulty));
  };

  const toggleCategory = (category: string) => {
    setActiveCategory((current) => (current === category ? '全部' : category));
  };

  const updateProfile = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    setProfile((current) => {
      if (key === 'hasBankExperience' && value !== 'yes') {
        return { ...current, hasBankExperience: value as CandidateProfile['hasBankExperience'], bankYears: defaultProfile.bankYears };
      }

      return { ...current, [key]: value };
    });
  };

  const renderAnswerCheckbox = (
    idPrefix: string,
    key: 'isFreshGraduate' | 'hasBankExperience' | 'hasSalesExperience',
    label: string,
  ) => (
    <label className="switch-row">
      <input
        type="checkbox"
        checked={profile[key] === 'yes'}
        onChange={(event) => updateProfile(key, event.target.checked ? 'yes' : 'unset')}
      />
      <span>{label}</span>
      <span className="visually-hidden" id={`${idPrefix}-${key}-hint`}>
        未勾選代表否
      </span>
    </label>
  );

  const renderCandidateControls = (idPrefix: string, showClose = false) => (
    <div className="control-panel">
      <div className="panel-heading">
        <UserRound size={20} />
        <h2>考生條件</h2>
        {showClose && (
          <button
            className="icon-button ms-auto"
            type="button"
            aria-label="關閉考生條件"
            onClick={() => setIsFilterOpen(false)}
          >
            <X size={19} />
          </button>
        )}
      </div>

      <label className="form-label" htmlFor={`${idPrefix}-ageRange`}>
        年齡
      </label>
      <select
        className="form-select mb-3"
        id={`${idPrefix}-ageRange`}
        value={profile.ageRange}
        onChange={(event) => updateProfile('ageRange', event.target.value as CandidateProfile['ageRange'])}
      >
        <option value="unset">未選擇</option>
        <option value="under24">24 歲以下</option>
        <option value="25to29">25-29 歲</option>
        <option value="30plus">30 歲以上</option>
      </select>

      <label className="form-label" htmlFor={`${idPrefix}-workYears`}>
        工作年資
      </label>
      <select
        className="form-select mb-3"
        id={`${idPrefix}-workYears`}
        value={profile.workYears}
        onChange={(event) => updateProfile('workYears', event.target.value as CandidateProfile['workYears'])}
      >
        <option value="unset">未選擇</option>
        <option value="none">無正式工作經驗</option>
        <option value="under2">未滿 2 年</option>
        <option value="2to5">2-5 年</option>
        <option value="5plus">5 年以上</option>
      </select>

      <div className="toggle-stack mb-3">
        {renderAnswerCheckbox(idPrefix, 'isFreshGraduate', '應屆畢業生')}
        {renderAnswerCheckbox(idPrefix, 'hasBankExperience', '有銀行經驗')}
        {renderAnswerCheckbox(idPrefix, 'hasSalesExperience', '有銷售經驗')}
      </div>

      {profile.hasBankExperience === 'yes' && (
        <>
          <label className="form-label" htmlFor={`${idPrefix}-bankYears`}>
            銀行年資
          </label>
          <select
            className="form-select mb-3"
            id={`${idPrefix}-bankYears`}
            value={profile.bankYears}
            onChange={(event) => updateProfile('bankYears', event.target.value as CandidateProfile['bankYears'])}
          >
            <option value="under1">未滿 1 年</option>
            <option value="1to3">1-3 年</option>
            <option value="3plus">3 年以上</option>
          </select>
        </>
      )}

      <label className="form-label" htmlFor={`${idPrefix}-targetFocus`}>
        準備重點
      </label>
      <select
        className="form-select mb-3"
        id={`${idPrefix}-targetFocus`}
        value={profile.targetFocus}
        onChange={(event) => updateProfile('targetFocus', event.target.value as CandidateProfile['targetFocus'])}
      >
        {Object.entries(focusLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <label className="form-label d-flex justify-content-between" htmlFor={`${idPrefix}-practiceSize`}>
        <span>顯示題數</span>
        <strong>{profile.practiceSize}</strong>
      </label>
      <input
        className="form-range"
        id={`${idPrefix}-practiceSize`}
        type="range"
        min="10"
        max={interviewQuestions.length}
        step="1"
        value={profile.practiceSize}
        onChange={(event) => updateProfile('practiceSize', Number(event.target.value))}
      />

      <button className="btn btn-outline-dark w-100 mt-3" type="button" onClick={handleResetFilters}>
        <RefreshCcw size={17} />
        重設條件
      </button>
    </div>
  );

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
                點任一題即可進入 AI 模擬面試逐題練習。
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
              {renderCandidateControls('desktop')}
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
                <a className="btn btn-dark source-link" href="/20260515bank123.pdf" target="_blank" rel="noreferrer">
                  <Download size={17} />
                  題庫 PDF
                </a>
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
                            className="btn btn-dark practice-button"
                            type="button"
                            onClick={() => navigate(`/interview/${question.id}`)}
                          >
                            <MessageSquare size={16} />
                            開始模擬面試
                          </button>
                        </div>
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
          <div className="filter-drawer">{renderCandidateControls('mobile', true)}</div>
        </div>
      )}
    </>
  );
}
