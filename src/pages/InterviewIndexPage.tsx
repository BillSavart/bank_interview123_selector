import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Search, Sparkles } from 'lucide-react';
import { interviewQuestions } from '../data/questions.generated';
import { tagLabels } from '../lib/scoring';

// Landing page for the "模擬面試" nav item: pick a question to practise.
export function InterviewIndexPage() {
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(interviewQuestions.map((q) => q.category)))],
    [],
  );

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return interviewQuestions
      .filter((q) => activeCategory === '全部' || q.category === activeCategory)
      .filter((q) => !k || `${q.question} ${q.category} ${q.tags.join(' ')}`.toLowerCase().includes(k));
  }, [keyword, activeCategory]);

  return (
    <div className="container py-4 interview-index">
      <div className="interview-kicker">
        <Sparkles size={18} />
        模擬面試
      </div>
      <h1 className="display-title mb-2">挑一題開始練習</h1>
      <p className="page-intro mb-4">
        選一道題目，AI 面試官會把題目問出來，你回答後即時給回饋與追問。想依背景排序，請到
        <Link to="/"> 首頁題目篩選</Link>。
      </p>

      <div className="toolbar mb-3">
        <div className="search-box">
          <Search size={19} />
          <input
            type="search"
            placeholder="搜尋題目、分類或標籤"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="搜尋題目"
          />
        </div>
        <select
          className="form-select category-select"
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          aria-label="題型分類"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="result-count">共 {filtered.length} 題</p>

      <div className="question-list">
        {filtered.map((question) => (
          <Link key={question.id} to={`/interview/${question.id}`} className="question-card question-card-link">
            <div className="question-rank">
              <span>#{question.id}</span>
            </div>
            <div className="question-body">
              <div className="question-meta">
                <span>{question.category}</span>
                <span>{question.difficulty}</span>
              </div>
              <h3>{question.question}</h3>
              <div className="tag-row">
                {question.tags.slice(0, 6).map((tag) => (
                  <span key={tag}>{tagLabels[tag]}</span>
                ))}
              </div>
              <div className="question-actions">
                <span className="btn btn-dark practice-button">
                  <MessageSquare size={16} />
                  開始模擬面試
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
