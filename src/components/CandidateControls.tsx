import { RefreshCcw, UserRound, X } from 'lucide-react';
import { interviewQuestions } from '../data/questions.generated';
import { focusLabel } from '../lib/scoring';
import type { CandidateProfile } from '../data/types';

interface CandidateControlsProps {
  profile: CandidateProfile;
  onUpdate: <K extends keyof CandidateProfile>(key: K, value: CandidateProfile[K]) => void;
  onReset: () => void;
  idPrefix: string;
  showClose?: boolean;
  onClose?: () => void;
  // hide the "顯示題數" slider where it isn't meaningful (e.g. the interview session)
  showPracticeSize?: boolean;
}

export function CandidateControls({
  profile,
  onUpdate,
  onReset,
  idPrefix,
  showClose = false,
  onClose,
  showPracticeSize = true,
}: CandidateControlsProps) {
  const renderAnswerCheckbox = (
    key: 'isFreshGraduate' | 'hasBankExperience' | 'hasSalesExperience',
    label: string,
  ) => (
    <label className="switch-row">
      <input
        type="checkbox"
        checked={profile[key] === 'yes'}
        onChange={(event) => onUpdate(key, event.target.checked ? 'yes' : 'unset')}
      />
      <span>{label}</span>
      <span className="visually-hidden" id={`${idPrefix}-${key}-hint`}>
        未勾選代表否
      </span>
    </label>
  );

  return (
    <div className="control-panel">
      <div className="panel-heading">
        <UserRound size={20} />
        <h2>考生條件</h2>
        {showClose && (
          <button className="icon-button ms-auto" type="button" aria-label="關閉考生條件" onClick={onClose}>
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
        onChange={(event) => onUpdate('ageRange', event.target.value as CandidateProfile['ageRange'])}
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
        onChange={(event) => onUpdate('workYears', event.target.value as CandidateProfile['workYears'])}
      >
        <option value="unset">未選擇</option>
        <option value="none">無正式工作經驗</option>
        <option value="under2">未滿 2 年</option>
        <option value="2to5">2-5 年</option>
        <option value="5plus">5 年以上</option>
      </select>

      <div className="toggle-stack mb-3">
        {renderAnswerCheckbox('isFreshGraduate', '應屆畢業生')}
        {renderAnswerCheckbox('hasBankExperience', '有銀行經驗')}
        {renderAnswerCheckbox('hasSalesExperience', '有銷售經驗')}
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
            onChange={(event) => onUpdate('bankYears', event.target.value as CandidateProfile['bankYears'])}
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
        onChange={(event) => onUpdate('targetFocus', event.target.value as CandidateProfile['targetFocus'])}
      >
        {Object.entries(focusLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {showPracticeSize && (
        <>
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
            onChange={(event) => onUpdate('practiceSize', Number(event.target.value))}
          />
        </>
      )}

      <button className="btn btn-outline-dark w-100 mt-3" type="button" onClick={onReset}>
        <RefreshCcw size={17} />
        重設條件
      </button>
    </div>
  );
}
