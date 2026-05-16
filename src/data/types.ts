export type QuestionTag =
  | 'top10'
  | 'motivation'
  | 'freshGraduate'
  | 'experienced'
  | 'noBankExperience'
  | 'bankExperience'
  | 'sales'
  | 'customerService'
  | 'compliance'
  | 'fintech'
  | 'marketNews'
  | 'scenario'
  | 'manager'
  | 'teamwork'
  | 'pressure';

export interface InterviewQuestion {
  id: number;
  category: string;
  question: string;
  difficulty: '核心必練' | '基礎' | '情境題' | '進階';
  tags: QuestionTag[];
}

export type AnswerOption = 'unset' | 'yes' | 'no';

export interface CandidateProfile {
  ageRange: 'unset' | 'under24' | '25to29' | '30plus';
  workYears: 'unset' | 'none' | 'under2' | '2to5' | '5plus';
  isFreshGraduate: AnswerOption;
  hasBankExperience: AnswerOption;
  bankYears: 'under1' | '1to3' | '3plus';
  hasSalesExperience: AnswerOption;
  targetFocus: 'balanced' | 'motivation' | 'sales' | 'service' | 'compliance' | 'news';
  practiceSize: number;
}
