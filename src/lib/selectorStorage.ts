// 面試題目篩選器的本機記憶：考生條件、每題練習進度，以及「分享我的條件」用的網址參數。
// 資料只存在使用者瀏覽器的 localStorage，不會送到後端。
import { interviewQuestions } from '../data/questions.generated';
import { defaultProfile, isProfileEmpty } from './scoring';
import type { CandidateProfile, InterviewQuestion } from '../data/types';

const PROFILE_KEY = 'bank-interview-selector-profile';
const PRACTICE_KEY = 'bank-interview-practice-status';

const MIN_PRACTICE_SIZE = 10;
const MAX_PRACTICE_SIZE = interviewQuestions.length;
const QUESTION_IDS = new Set(interviewQuestions.map((question) => question.id));

const PROFILE_VALUES = {
  ageRange: ['unset', 'under24', '25to29', '30plus'],
  workYears: ['unset', 'none', 'under2', '2to5', '5plus'],
  isFreshGraduate: ['unset', 'yes', 'no'],
  hasBankExperience: ['unset', 'yes', 'no'],
  bankYears: ['under1', '1to3', '3plus'],
  hasSalesExperience: ['unset', 'yes', 'no'],
  targetFocus: ['balanced', 'motivation', 'sales', 'service', 'compliance', 'news'],
} as const satisfies { [K in Exclude<keyof CandidateProfile, 'practiceSize'>]: ReadonlyArray<CandidateProfile[K]> };

type EnumField = keyof typeof PROFILE_VALUES;

/** 分享網址用的短參數名稱。 */
const PARAM_NAMES: Record<keyof CandidateProfile, string> = {
  ageRange: 'age',
  workYears: 'work',
  isFreshGraduate: 'fresh',
  hasBankExperience: 'bank',
  bankYears: 'bankYears',
  hasSalesExperience: 'sales',
  targetFocus: 'focus',
  practiceSize: 'n',
};

export interface SelectorState {
  profile: CandidateProfile;
  /** 使用者是否手動拖過「顯示題數」；沒拖過時題數會依條件自動切換。 */
  practiceSizeTouched: boolean;
}

/** 沒手動調整題數時的預設：沒選條件顯示全部，有選條件顯示 20 題。 */
export const autoPracticeSize = (profile: CandidateProfile) =>
  isProfileEmpty(profile) ? MAX_PRACTICE_SIZE : 20;

const isAllowed = <K extends EnumField>(key: K, value: unknown): value is CandidateProfile[K] =>
  (PROFILE_VALUES[key] as readonly unknown[]).includes(value);

const clampPracticeSize = (value: unknown): number | null => {
  const size = Number(value);
  if (!Number.isInteger(size)) return null;
  return Math.min(MAX_PRACTICE_SIZE, Math.max(MIN_PRACTICE_SIZE, size));
};

// Merge only valid fields onto the defaults, so stale or hand-edited values
// never leave the UI in a state the controls cannot represent.
function buildProfile(read: (key: keyof CandidateProfile) => unknown): CandidateProfile {
  const profile: CandidateProfile = { ...defaultProfile };
  for (const key of Object.keys(PROFILE_VALUES) as EnumField[]) {
    const value = read(key);
    if (isAllowed(key, value)) (profile as Record<EnumField, unknown>)[key] = value;
  }
  if (profile.hasBankExperience !== 'yes') profile.bankYears = defaultProfile.bankYears;
  return profile;
}

export function parseSelectorState(raw: unknown): SelectorState | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = raw as { profile?: unknown; practiceSizeTouched?: unknown };
  if (!stored.profile || typeof stored.profile !== 'object') return null;
  const source = stored.profile as Record<string, unknown>;

  const profile = buildProfile((key) => source[key]);
  const touched = stored.practiceSizeTouched === true;
  const size = clampPracticeSize(source.practiceSize);
  profile.practiceSize = touched && size !== null ? size : autoPracticeSize(profile);
  return { profile, practiceSizeTouched: touched && size !== null };
}

export function loadSelectorState(): SelectorState | null {
  try {
    return parseSelectorState(JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function saveSelectorState(state: SelectorState) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

/** 網址是否帶有考生條件參數。 */
export const hasProfileParams = (params: URLSearchParams) =>
  Object.values(PARAM_NAMES).some((name) => params.has(name));

/** 移除考生條件參數，保留其他參數（例如 utm）。 */
export function withoutProfileParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of Object.values(PARAM_NAMES)) next.delete(name);
  return next;
}

export function profileFromParams(params: URLSearchParams): SelectorState | null {
  if (!hasProfileParams(params)) return null;
  const profile = buildProfile((key) => params.get(PARAM_NAMES[key]));
  const size = params.has(PARAM_NAMES.practiceSize) ? clampPracticeSize(params.get(PARAM_NAMES.practiceSize)) : null;
  profile.practiceSize = size ?? autoPracticeSize(profile);
  return { profile, practiceSizeTouched: size !== null };
}

/** 只輸出與預設不同的欄位，讓分享網址保持精簡。 */
export function profileToParams(profile: CandidateProfile): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(PROFILE_VALUES) as EnumField[]) {
    if (key === 'bankYears' && profile.hasBankExperience !== 'yes') continue;
    if (profile[key] !== defaultProfile[key]) params.set(PARAM_NAMES[key], profile[key]);
  }
  if (profile.practiceSize !== autoPracticeSize(profile)) {
    params.set(PARAM_NAMES.practiceSize, String(profile.practiceSize));
  }
  return params;
}

// --- 每題練習進度 -------------------------------------------------------------

export type PracticeStatus = 'unfamiliar' | 'practiced' | 'mastered';
export type PracticeStatusMap = Record<number, PracticeStatus>;

export const PRACTICE_STATUSES: Array<{ value: PracticeStatus; label: string }> = [
  { value: 'unfamiliar', label: '不熟' },
  { value: 'practiced', label: '練過' },
  { value: 'mastered', label: '熟練' },
];

export const PRACTICE_STATUS_LABEL = Object.fromEntries(
  PRACTICE_STATUSES.map(({ value, label }) => [value, label]),
) as Record<PracticeStatus, string>;

const isPracticeStatus = (value: unknown): value is PracticeStatus =>
  PRACTICE_STATUSES.some((status) => status.value === value);

export function parsePracticeStatus(raw: unknown): PracticeStatusMap {
  if (!raw || typeof raw !== 'object') return {};
  const result: PracticeStatusMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (QUESTION_IDS.has(id) && isPracticeStatus(value)) result[id] = value;
  }
  return result;
}

export function loadPracticeStatus(): PracticeStatusMap {
  try {
    return parsePracticeStatus(JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}'));
  } catch {
    return {};
  }
}

export function savePracticeStatus(map: PracticeStatusMap) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(map));
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

export interface PracticeSummary {
  total: number;
  unfamiliar: number;
  practiced: number;
  mastered: number;
}

export function summarizePractice(questions: InterviewQuestion[], map: PracticeStatusMap): PracticeSummary {
  const summary: PracticeSummary = { total: questions.length, unfamiliar: 0, practiced: 0, mastered: 0 };
  for (const question of questions) {
    const status = map[question.id];
    if (status) summary[status] += 1;
  }
  return summary;
}
