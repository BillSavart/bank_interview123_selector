export type CheckAnswer = 'can' | 'cannot';

export interface CheckQuestion {
  id: number;
  description: string;
  /** 兩張圖片的路徑，放在 public/checkgame/ 之下，例如 "/checkgame/q1-a.png"。 */
  images: string[];
  answer: CheckAnswer;
  explanation: string;
}

export const checkGameIntro = `歡迎來到「支票審查員」！

今天是115年6月5日，你是銀行櫃員，接下來會有 12 張支票送到你面前。請依票面狀況判斷這張支票「可以收」還是「不可以收」。

• 每題限時 15 秒，時間到會自動公布答案。
• 答對才有分數，而且回答得越快、剩餘時間越多，分數越高。
• 答完會公布正解與詳解，看完點「下一題」繼續。

準備好了嗎？輸入你的暱稱，開始挑戰吧！`;

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
