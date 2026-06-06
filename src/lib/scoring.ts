import { interviewQuestions } from '../data/questions.generated';
import type { CandidateProfile, InterviewQuestion, QuestionTag } from '../data/types';

export const defaultProfile: CandidateProfile = {
  ageRange: 'unset',
  workYears: 'unset',
  isFreshGraduate: 'unset',
  hasBankExperience: 'unset',
  bankYears: 'under1',
  hasSalesExperience: 'unset',
  targetFocus: 'balanced',
  practiceSize: 123,
};

export const focusLabel: Record<CandidateProfile['targetFocus'], string> = {
  balanced: '均衡準備',
  motivation: '報考動機',
  sales: '業務推廣',
  service: '客戶應對',
  compliance: '法遵洗防',
  news: '時事財經',
};

export const tagLabels: Record<QuestionTag, string> = {
  top10: '十大必問',
  motivation: '動機',
  freshGraduate: '新鮮人',
  experienced: '有年資',
  noBankExperience: '無銀行經驗',
  bankExperience: '銀行實務',
  sales: '銷售',
  customerService: '客戶',
  compliance: '法遵',
  fintech: '數位金融',
  marketNews: '時事',
  scenario: '情境',
  manager: '主管',
  teamwork: '團隊',
  pressure: '抗壓',
};

const focusTags: Record<CandidateProfile['targetFocus'], QuestionTag[]> = {
  balanced: ['top10', 'motivation', 'scenario', 'customerService'],
  motivation: ['motivation', 'top10', 'noBankExperience'],
  sales: ['sales', 'customerService', 'scenario'],
  service: ['customerService', 'scenario', 'pressure'],
  compliance: ['compliance', 'scenario'],
  news: ['marketNews', 'fintech'],
};

const hasTag = (question: InterviewQuestion, tag: QuestionTag) => question.tags.includes(tag);

const addReason = (reasons: string[], reason: string) => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

export const scoreQuestion = (question: InterviewQuestion, profile: CandidateProfile) => {
  let score = 10;
  const reasons: string[] = [];

  if (hasTag(question, 'top10')) {
    score += 28;
    addReason(reasons, '口試高頻核心題');
  }

  if (profile.isFreshGraduate === 'yes' && hasTag(question, 'freshGraduate')) {
    score += 22;
    addReason(reasons, '適合應屆畢業生');
  }

  if (profile.isFreshGraduate === 'no' && hasTag(question, 'experienced')) {
    score += 18;
    addReason(reasons, '可連結工作經歷');
  }

  if (profile.hasBankExperience === 'no' && hasTag(question, 'noBankExperience')) {
    score += 24;
    addReason(reasons, '補強無銀行經驗說法');
  }

  if (profile.hasBankExperience === 'yes' && hasTag(question, 'bankExperience')) {
    score += 18;
    addReason(reasons, '延伸銀行實務經驗');
  }

  if (profile.hasBankExperience === 'yes' && profile.bankYears === 'under1') {
    if (hasTag(question, 'bankExperience')) score += 8;
    if (hasTag(question, 'customerService') || hasTag(question, 'scenario')) {
      score += 8;
      addReason(reasons, '強化銀行適應期情境');
    }
  }

  if (profile.hasBankExperience === 'yes' && profile.bankYears === '1to3') {
    if (hasTag(question, 'bankExperience')) score += 12;
    if (hasTag(question, 'sales') || hasTag(question, 'compliance')) {
      score += 8;
      addReason(reasons, '連結銀行實務表現');
    }
  }

  if (profile.hasBankExperience === 'yes' && profile.bankYears === '3plus') {
    if (hasTag(question, 'bankExperience')) score += 14;
    if (hasTag(question, 'manager') || hasTag(question, 'teamwork')) {
      score += 10;
      addReason(reasons, '延伸資深行員協作題');
    }
    if (hasTag(question, 'compliance') || hasTag(question, 'marketNews')) {
      score += 8;
      addReason(reasons, '展現進階銀行視野');
    }
  }

  if (profile.hasSalesExperience === 'yes' && hasTag(question, 'sales')) {
    score += 18;
    addReason(reasons, '凸顯銷售經驗');
  }

  if (profile.hasSalesExperience === 'no' && hasTag(question, 'sales')) {
    score += 8;
    addReason(reasons, '預先準備業績壓力');
  }

  if (profile.workYears === 'none' && hasTag(question, 'freshGraduate')) score += 10;
  if (profile.workYears === '5plus' && hasTag(question, 'experienced')) score += 10;
  if (profile.ageRange === '30plus' && hasTag(question, 'experienced')) score += 8;
  if (profile.ageRange === 'under24' && hasTag(question, 'freshGraduate')) score += 8;

  let focusBonus = 0;
  for (const tag of focusTags[profile.targetFocus]) {
    if (hasTag(question, tag)) {
      focusBonus += profile.targetFocus === 'balanced' ? 8 : 18;
      addReason(reasons, focusLabel[profile.targetFocus]);
    }
  }
  score += Math.min(focusBonus, profile.targetFocus === 'balanced' ? 20 : 28);

  if (profile.hasBankExperience === 'no' && (hasTag(question, 'manager') || hasTag(question, 'teamwork'))) {
    score -= 14;
  }

  if (profile.hasBankExperience === 'no' && hasTag(question, 'bankExperience') && !hasTag(question, 'motivation')) {
    score -= 10;
  }

  if (profile.hasBankExperience === 'yes' && profile.bankYears === 'under1' && (hasTag(question, 'manager') || hasTag(question, 'teamwork'))) {
    score -= 8;
  }

  if (profile.isFreshGraduate === 'yes' && hasTag(question, 'experienced') && !hasTag(question, 'top10')) {
    score -= 8;
  }

  if (question.difficulty === '進階' && profile.targetFocus !== 'news' && profile.targetFocus !== 'compliance') {
    score -= 4;
  }

  return {
    question,
    score: Math.max(0, Math.min(100, score)),
    reasons: reasons.slice(0, 3),
  };
};

export const categorySummary = (questions: InterviewQuestion[]) =>
  questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.category] = (acc[question.category] ?? 0) + 1;
    return acc;
  }, {});

// Top questions for a profile, used to drive a full mock-interview session.
export const rankedForProfile = (profile: CandidateProfile, limit: number): InterviewQuestion[] => {
  const scoringProfile: CandidateProfile = {
    ...profile,
    isFreshGraduate: profile.isFreshGraduate === 'yes' ? 'yes' : 'no',
    hasBankExperience: profile.hasBankExperience === 'yes' ? 'yes' : 'no',
    hasSalesExperience: profile.hasSalesExperience === 'yes' ? 'yes' : 'no',
  };
  return interviewQuestions
    .map((question) => scoreQuestion(question, scoringProfile))
    .sort((a, b) => b.score - a.score || a.question.id - b.question.id)
    .slice(0, limit)
    .map((item) => item.question);
};

export const isProfileEmpty = (profile: CandidateProfile) =>
  profile.ageRange === 'unset' &&
  profile.workYears === 'unset' &&
  profile.isFreshGraduate === 'unset' &&
  profile.hasBankExperience === 'unset' &&
  profile.hasSalesExperience === 'unset' &&
  profile.targetFocus === defaultProfile.targetFocus;
