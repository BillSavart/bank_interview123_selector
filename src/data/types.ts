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

export interface CandidateProfile {
  ageRange: 'under24' | '25to29' | '30plus';
  workYears: 'none' | 'under2' | '2to5' | '5plus';
  isFreshGraduate: boolean;
  hasBankExperience: boolean;
  bankYears: 'under1' | '1to3' | '3plus';
  hasSalesExperience: boolean;
  targetFocus: 'balanced' | 'motivation' | 'sales' | 'service' | 'compliance' | 'news';
  practiceSize: number;
}
