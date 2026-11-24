import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import {
  PRACTICE_STATUSES,
  summarizePractice,
  type PracticeStatusMap,
  type PracticeSummary,
} from '../lib/selectorStorage';
import type { InterviewQuestion } from '../data/types';

interface PracticeProgressProps {
  questions: InterviewQuestion[];
  categories: string[];
  statusMap: PracticeStatusMap;
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onClear: () => void;
}

const practicedCount = (summary: PracticeSummary) => summary.practiced + summary.mastered;

function ProgressBar({ summary }: { summary: PracticeSummary }) {
  const width = (count: number) => `${summary.total ? (count / summary.total) * 100 : 0}%`;
  return (
    <span
      className="practice-bar"
      role="img"
      aria-label={`熟練 ${summary.mastered} 題、練過 ${summary.practiced} 題、不熟 ${summary.unfamiliar} 題，共 ${summary.total} 題`}
    >
      <span className="is-mastered" style={{ width: width(summary.mastered) }} />
      <span className="is-practiced" style={{ width: width(summary.practiced) }} />
      <span className="is-unfamiliar" style={{ width: width(summary.unfamiliar) }} />
    </span>
  );
}

/** 題目篩選器上方的練習進度：整體進度條，展開後可看各分類進度並點選篩選。 */
export function PracticeProgress({
  questions,
  categories,
  statusMap,
  activeCategory,
  onSelectCategory,
  onClear,
}: PracticeProgressProps) {
  const [open, setOpen] = useState(false);

  const overall = useMemo(() => summarizePractice(questions, statusMap), [questions, statusMap]);
  const byCategory = useMemo(
    () =>
      categories.map((category) => ({
        category,
        summary: summarizePractice(
          questions.filter((question) => question.category === category),
          statusMap,
        ),
      })),
    [categories, questions, statusMap],
  );
  const marked = overall.unfamiliar + overall.practiced + overall.mastered;

  return (
    <section className="practice-progress">
      <button
        type="button"
        className="practice-progress-head"
        aria-expanded={open}
        aria-controls="practice-progress-body"
        onClick={() => setOpen((value) => !value)}
      >
        <ListChecks size={18} />
        <span className="practice-progress-title">我的練習進度</span>
        <span className="practice-progress-count">
          <strong>{practicedCount(overall)}</strong> / {overall.total} 題已練習
        </span>
        <ProgressBar summary={overall} />
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open && (
        <div id="practice-progress-body" className="practice-progress-body">
          <div className="practice-legend">
            {PRACTICE_STATUSES.slice()
              .reverse()
              .map(({ value, label }) => (
                <span key={value}>
                  <i className={`is-${value}`} />
                  {label} {overall[value]}
                </span>
              ))}
            <span>
              <i />
              未標記 {overall.total - marked}
            </span>
          </div>

          <div className="practice-category-list">
            {byCategory.map(({ category, summary }) => (
              <button
                key={category}
                type="button"
                className={`practice-category-row ${activeCategory === category ? 'is-active' : ''}`}
                aria-pressed={activeCategory === category}
                onClick={() => onSelectCategory(category)}
              >
                <span className="practice-category-name">{category}</span>
                <ProgressBar summary={summary} />
                <span className="practice-category-count">
                  {practicedCount(summary)}/{summary.total}
                </span>
              </button>
            ))}
          </div>

          <div className="practice-progress-foot">
            <span>在每題卡片標記「不熟／練過／熟練」。進度只存在這台裝置的瀏覽器。</span>
            {marked > 0 && (
              <button type="button" onClick={onClear}>
                清除進度
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
