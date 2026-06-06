import rawData from './checkGame.json';

export type CheckAnswer = 'can' | 'cannot';

export interface CheckQuestion {
  id: number;
  description: string;
  /** 兩張圖片的路徑，放在 public/checkgame/ 之下，例如 "/checkgame/q1-a.png"。 */
  images: string[];
  answer: CheckAnswer;
  explanation: string;
}

export interface CheckGameData {
  /** 暱稱輸入頁顯示的說明文字。 */
  intro: string;
  questions: CheckQuestion[];
}

export const checkGameData = rawData as CheckGameData;

/** 每題限時秒數。 */
export const SECONDS_PER_QUESTION = 15;

/**
 * 計分：答對得分 = 基礎分 + 剩餘秒數 × 每秒加成；答錯得 0。
 * 15 秒內瞬間答對的單題上限 = 100 + 15 × 20 = 400 分。
 */
export const BASE_SCORE = 100;
export const SCORE_PER_SECOND = 20;

export function scoreForAnswer(correct: boolean, secondsLeft: number): number {
  if (!correct) return 0;
  const clamped = Math.max(0, Math.min(SECONDS_PER_QUESTION, secondsLeft));
  return BASE_SCORE + clamped * SCORE_PER_SECOND;
}

/** Fisher–Yates 洗牌，回傳新陣列，不更動原始資料。 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 取得這一輪的題目順序（每次呼叫都重新洗牌）。 */
export function buildRound(): CheckQuestion[] {
  return shuffle(checkGameData.questions);
}
