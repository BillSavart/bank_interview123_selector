import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Flag,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';
import { hasAnswer, renderStoredAnswer } from '../data/answerBank';
import { interviewQuestions } from '../data/questions.generated';
import { CandidateControls } from '../components/CandidateControls';
import { CommentBoard } from '../components/CommentBoard';
import { PracticeProgress } from '../components/PracticeProgress';
import { categorySummary, defaultProfile, isProfileEmpty, scoreQuestion, tagLabels } from '../lib/scoring';
import { fetchRatings, loadLocalScores, submitRating, type RatingMap } from '../lib/ratings';
import {
  PRACTICE_STATUSES,
  PRACTICE_STATUS_LABEL,
  autoPracticeSize,
  hasProfileParams,
  loadPracticeStatus,
  loadSelectorState,
  profileFromParams,
  profileToParams,
  savePracticeStatus,
  saveSelectorState,
  withoutProfileParams,
  type PracticeStatus,
  type PracticeStatusMap,
} from '../lib/selectorStorage';
import type { CandidateProfile, InterviewQuestion } from '../data/types';

interface PracticeStatusPickerProps {
  questionId: number;
  status?: PracticeStatus;
  onChange: (questionId: number, status: PracticeStatus | null) => void;
}

function PracticeStatusPicker({ questionId, status, onChange }: PracticeStatusPickerProps) {
  return (
    <div className="practice-status" role="group" aria-label={`第 ${questionId} 題練習狀態`}>
      {PRACTICE_STATUSES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`is-${value} ${status === value ? 'is-active' : ''}`}
          aria-pressed={status === value}
          title={status === value ? `取消「${label}」標記` : `標記為「${label}」`}
          onClick={() => onChange(questionId, status === value ? null : value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface AnswerRatingProps {
  questionId: number;
  rating?: RatingMap[number];
  myScore?: number;
  isSaving: boolean;
  onRate: (questionId: number, score: number) => void;
}

function AnswerRating({ questionId, rating, myScore, isSaving, onRate }: AnswerRatingProps) {
  const average = rating?.average ?? null;
  const count = rating?.count ?? 0;

  return (
    <div className="answer-rating" aria-label={`第 ${questionId} 題參考答案評分`}>
      <div className="answer-rating-stars" role="radiogroup" aria-label="評分">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            className={myScore && score <= myScore ? 'is-active' : ''}
            type="button"
            onClick={() => onRate(questionId, score)}
            disabled={isSaving}
            aria-label={`給 ${score} 顆星`}
            aria-checked={myScore === score}
            role="radio"
          >
            <Star size={18} fill="currentColor" />
          </button>
        ))}
      </div>
      <div className="answer-rating-summary" aria-live="polite">
        <strong>{average ? average.toFixed(1) : '尚無評分'}</strong>
        <span>{count} 人評分</span>
      </div>
    </div>
  );
}

export function SelectorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // A shared link (?age=…&focus=…) wins over the conditions saved on this device.
  const [initialState] = useState(() => {
    const shared = profileFromParams(searchParams);
    return { state: shared ?? loadSelectorState(), fromLink: shared !== null };
  });
  const [profile, setProfile] = useState<CandidateProfile>(initialState.state?.profile ?? defaultProfile);
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeDifficulty, setActiveDifficulty] = useState<InterviewQuestion['difficulty'] | '全部'>('全部');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(() => new Set());
  const [ratings, setRatings] = useState<RatingMap>({});
  const [myScores, setMyScores] = useState<Record<number, number>>(() => loadLocalScores());
  const [savingRatings, setSavingRatings] = useState<Set<number>>(() => new Set());
  // Once the user drags the 顯示題數 slider, stop auto-adjusting it.
  const [practiceSizeTouched, setPracticeSizeTouched] = useState(initialState.state?.practiceSizeTouched ?? false);
  const [practice, setPractice] = useState<PracticeStatusMap>(() => loadPracticeStatus());
  const [onlyUnfamiliar, setOnlyUnfamiliar] = useState(false);
  const [showSharedNotice, setShowSharedNotice] = useState(initialState.fromLink);
  const [shareCopied, setShareCopied] = useState(false);
  const shareTimer = useRef<number | undefined>(undefined);

  // The shared conditions are now applied (and saved below), so drop them from the
  // address bar; a later reload then reflects whatever the user changes next.
  useEffect(() => {
    if (hasProfileParams(searchParams)) setSearchParams(withoutProfileParams(searchParams), { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    saveSelectorState({ profile, practiceSizeTouched });
  }, [profile, practiceSizeTouched]);

  useEffect(() => {
    savePracticeStatus(practice);
  }, [practice]);

  useEffect(() => () => window.clearTimeout(shareTimer.current), []);

  useEffect(() => {
    let isMounted = true;

    fetchRatings()
      .then((nextRatings) => {
        if (isMounted) setRatings(nextRatings);
      })
      .catch(() => {
        if (isMounted) setRatings({});
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
      .filter((question) => !onlyUnfamiliar || practice[question.id] === 'unfamiliar')
      .filter((question) => {
        if (!normalizedKeyword) return true;
        return `${question.question} ${question.category} ${question.tags.join(' ')}`.toLowerCase().includes(normalizedKeyword);
      });

    return filteredQuestions
      .map((question) => (hasProfileCriteria ? scoreQuestion(question, scoringProfile) : { question, score: 0, reasons: [] }))
      .sort((a, b) => (hasProfileCriteria ? b.score - a.score || a.question.id - b.question.id : a.question.id - b.question.id))
      .slice(0, profile.practiceSize);
  }, [activeCategory, activeDifficulty, keyword, onlyUnfamiliar, practice, profile]);

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
  const showDefaultCategoryOverview =
    profileIsEmpty && !keyword.trim() && activeDifficulty === '全部' && activeCategory === '全部' && !onlyUnfamiliar;
  const summary = categorySummary(showDefaultCategoryOverview ? interviewQuestions : visibleQuestions);
  const topScore = rankedQuestions[0]?.score ?? 0;
  const unfamiliarCount = Object.values(practice).filter((status) => status === 'unfamiliar').length;

  const handleResetFilters = () => {
    setProfile(defaultProfile);
    setPracticeSizeTouched(false);
    setKeyword('');
    setActiveCategory('全部');
    setActiveDifficulty('全部');
    setOnlyUnfamiliar(false);
    setExpandedAnswers(new Set());
  };

  const updatePracticeStatus = (questionId: number, status: PracticeStatus | null) => {
    setPractice((current) => {
      const next = { ...current };
      if (status) next[questionId] = status;
      else delete next[questionId];
      return next;
    });
  };

  const clearPractice = () => {
    if (!window.confirm('確定要清除全部題目的練習進度嗎？此動作無法復原。')) return;
    setPractice({});
    setOnlyUnfamiliar(false);
  };

  const handleShare = async () => {
    const query = profileToParams(profile).toString();
    const url = `${window.location.origin}/selector${query ? `?${query}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.clearTimeout(shareTimer.current);
      shareTimer.current = window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt('複製這個網址分享你的考生條件：', url);
    }
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

  const handleRateAnswer = async (questionId: number, score: number) => {
    setMyScores((current) => ({ ...current, [questionId]: score }));
    setSavingRatings((current) => new Set(current).add(questionId));

    try {
      const rating = await submitRating(questionId, score);
      setRatings((current) => ({ ...current, [questionId]: rating }));
    } catch {
      setMyScores(loadLocalScores());
    } finally {
      setSavingRatings((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
    }
  };

  const updateProfile = <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => {
    if (key === 'practiceSize') setPracticeSizeTouched(true);

    setProfile((current) => {
      const next: CandidateProfile = { ...current, [key]: value };

      if (key === 'hasBankExperience' && value !== 'yes') {
        next.bankYears = defaultProfile.bankYears;
      }

      // Auto display-count until the user drags the slider:
      // nothing selected → all 123, any condition selected → 20.
      if (key !== 'practiceSize' && !practiceSizeTouched) {
        next.practiceSize = autoPracticeSize(next);
      }

      return next;
    });
  };

  return (
    <>
      <section className="selector-hero">
        <div className="container py-4">
          <div className="row g-3 align-items-center">
            <div className="col-lg-7">
              <div className="d-inline-flex align-items-center gap-2 selector-hero-kicker mb-2">
                <Banknote size={16} />
                面試題目篩選器
              </div>
              <h1 className="selector-hero-title mb-2">依你的背景，挑出最該練的口試題</h1>
              <p className="selector-hero-copy mb-0">
                排序 123 題常見口試題，快速抓出該優先準備的動機題、情境題、業務題與時事題，每題可展開答題方向與示範回答。
              </p>
            </div>
            <div className="col-lg-5">
              <div className="selector-stats">
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
              <CandidateControls
                profile={profile}
                onUpdate={updateProfile}
                onReset={handleResetFilters}
                idPrefix="desktop"
                onShare={handleShare}
                shareCopied={shareCopied}
              />
            </aside>

            <div className="col-lg-8 col-xl-9">
              {showSharedNotice && (
                <div className="selector-notice" role="status">
                  <span>已套用分享連結中的考生條件，並記在這台裝置上。</span>
                  <button type="button" aria-label="關閉提示" onClick={() => setShowSharedNotice(false)}>
                    <X size={16} />
                  </button>
                </div>
              )}

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
                  <button
                    className={`overview-item overview-button accent-rose ${onlyUnfamiliar ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setOnlyUnfamiliar((current) => !current)}
                    aria-pressed={onlyUnfamiliar}
                  >
                    <Flag size={20} />
                    <div>
                      <span>只看不熟</span>
                      <strong>{unfamiliarCount}</strong>
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

              <PracticeProgress
                questions={interviewQuestions}
                categories={categories.slice(1)}
                statusMap={practice}
                activeCategory={activeCategory}
                onSelectCategory={toggleCategory}
                onClear={clearPractice}
              />

              <div className="question-list">
                {rankedQuestions.length === 0 && (
                  <p className="question-empty">
                    {onlyUnfamiliar && unfamiliarCount === 0
                      ? '還沒有標記為「不熟」的題目。在題目卡片按「不熟」，之後就能在這裡集中複習。'
                      : '沒有符合目前篩選條件的題目，試著放寬分類、難度或搜尋關鍵字。'}
                  </p>
                )}
                {rankedQuestions.map(({ question, score, reasons }) => (
                  <Fragment key={question.id}>
                    <article className={`question-card ${practice[question.id] ? `is-${practice[question.id]}` : ''}`}>
                      <div className="question-rank">
                        <span>#{question.id}</span>
                        {practice[question.id] && <small>{PRACTICE_STATUS_LABEL[practice[question.id]]}</small>}
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
                          <PracticeStatusPicker
                            questionId={question.id}
                            status={practice[question.id]}
                            onChange={updatePracticeStatus}
                          />
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
                          <div className="answer-panel">
                            <AnswerRating
                              questionId={question.id}
                              rating={ratings[question.id]}
                              myScore={myScores[question.id]}
                              isSaving={savingRatings.has(question.id)}
                              onRate={handleRateAnswer}
                            />
                            <div className="prebuilt-answer">
                              {renderStoredAnswer(question, profile)}
                            </div>
                            <CommentBoard source={{ kind: 'question', questionId: question.id }} />
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
              onShare={handleShare}
              shareCopied={shareCopied}
            />
          </div>
        </div>
      )}
    </>
  );
}
