import rawAnswerBank from '../../answer_bank.json';
import { focusLabel } from '../lib/scoring';
import type { CandidateProfile, InterviewQuestion } from './types';

type VariantKey =
  | 'ageUnder24'
  | 'age25to29'
  | 'age30plus'
  | 'workNone'
  | 'workUnder2'
  | 'work2to5'
  | 'work5plus'
  | 'freshGraduateYes'
  | 'freshGraduateNo'
  | 'bankExperienceYes'
  | 'bankExperienceNo'
  | 'bankYearsUnder1'
  | 'bankYears1to3'
  | 'bankYears3plus'
  | 'salesExperienceYes'
  | 'salesExperienceNo'
  | 'focusMotivation'
  | 'focusSales'
  | 'focusService'
  | 'focusCompliance'
  | 'focusNews';

export interface AnswerBankEntry {
  keyPoints: string[];
  answer: string;
  variants?: Partial<Record<VariantKey, string>>;
}

const answerBank = rawAnswerBank as Record<string, AnswerBankEntry | undefined>;

const focusVariantKey: Record<CandidateProfile['targetFocus'], VariantKey | null> = {
  balanced: null,
  motivation: 'focusMotivation',
  sales: 'focusSales',
  service: 'focusService',
  compliance: 'focusCompliance',
  news: 'focusNews',
};

const variantKeysForProfile = (profile: CandidateProfile): VariantKey[] => {
  const keys: VariantKey[] = [];

  if (profile.ageRange === 'under24') keys.push('ageUnder24');
  if (profile.ageRange === '25to29') keys.push('age25to29');
  if (profile.ageRange === '30plus') keys.push('age30plus');

  if (profile.workYears === 'none') keys.push('workNone');
  if (profile.workYears === 'under2') keys.push('workUnder2');
  if (profile.workYears === '2to5') keys.push('work2to5');
  if (profile.workYears === '5plus') keys.push('work5plus');

  keys.push(profile.isFreshGraduate === 'yes' ? 'freshGraduateYes' : 'freshGraduateNo');

  if (profile.hasBankExperience === 'yes') {
    keys.push('bankExperienceYes');
    if (profile.bankYears === 'under1') keys.push('bankYearsUnder1');
    if (profile.bankYears === '1to3') keys.push('bankYears1to3');
    if (profile.bankYears === '3plus') keys.push('bankYears3plus');
  } else {
    keys.push('bankExperienceNo');
  }

  keys.push(profile.hasSalesExperience === 'yes' ? 'salesExperienceYes' : 'salesExperienceNo');

  const focusKey = focusVariantKey[profile.targetFocus];
  if (focusKey) keys.push(focusKey);

  return keys;
};

export function hasAnswer(questionId: number) {
  const entry = answerBank[String(questionId)];
  return Boolean(entry?.answer?.trim());
}

export function renderStoredAnswer(question: InterviewQuestion, profile: CandidateProfile): string {
  const entry = answerBank[String(question.id)];

  if (!entry?.answer?.trim()) {
    return [
      '這題尚未填入答案。',
      '',
      `請到 answer_bank.json 補上題號 "${question.id}" 的內容。`,
      '',
      '建議格式：',
      JSON.stringify(
        {
          keyPoints: ['這題第一個答題重點', '這題第二個答題重點'],
          answer: '這題專屬的完整示範回答。',
          variants: {
            ageUnder24: '24 歲以下版本要補充的句子。',
            workNone: '無正式工作經驗版本要補充的句子。',
            freshGraduateYes: '應屆畢業生版本要補充的句子。',
            bankExperienceNo: '無銀行經驗版本要補充的句子。',
            focusMotivation: '準備重點為報考動機時要補充的句子。',
          },
        },
        null,
        2,
      ),
    ].join('\n');
  }

  const matchedVariants = variantKeysForProfile(profile)
    .map((key) => entry.variants?.[key])
    .filter((line): line is string => Boolean(line?.trim()));

  return [
    '答題重點：',
    ...entry.keyPoints.map((point) => `- ${point}`),
    '',
    '示範回答：',
    entry.answer,
    ...(matchedVariants.length
      ? [
          '',
          `依目前考生條件微調（準備重點：${focusLabel[profile.targetFocus]}）：`,
          ...matchedVariants.map((line) => `- ${line}`),
        ]
      : []),
  ].join('\n');
}
