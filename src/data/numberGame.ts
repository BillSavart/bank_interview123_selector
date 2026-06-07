// 大寫數字訓練器的出題與計分。共 12 題：前 6 題是對齊「億 仟佰拾萬 仟佰拾元」
// 表頭的方格題；後 6 題是刻意寫成支票金額樣式（如「貳拾捌萬參佰元整」，略去零）。
// 兩種都在限時內把金額填回阿拉伯數字。計分與排行榜機制比照「支票審查員」。
import { randomAmount, toGridCells, toCheckCapital, type GridCell } from '../lib/chineseNumerals';

interface BaseQuestion {
  id: number;
  /** 正確金額（阿拉伯數字）。 */
  value: number;
}

/** 方格題：格內顯示大寫（或零／打叉）。 */
export interface GridQuestion extends BaseQuestion {
  kind: 'grid';
  cells: GridCell[];
}

/** 支票題：整串大寫金額（略零、結尾元整）。 */
export interface CheckQuestion extends BaseQuestion {
  kind: 'check';
  capital: string;
}

export type NumberQuestion = GridQuestion | CheckQuestion;

/** 每題限時秒數。 */
export const SECONDS_PER_QUESTION = 10;

/** 兩種題型各出幾題。 */
export const GRID_QUESTIONS = 6;
export const CHECK_QUESTIONS = 6;
export const QUESTIONS_PER_ROUND = GRID_QUESTIONS + CHECK_QUESTIONS;

/** 計分公式與支票審查員相同：答對 = 基礎分 + 剩餘秒數 × 每秒加成；答錯得 0。 */
export const BASE_SCORE = 100;
export const SCORE_PER_SECOND = 20;

export function scoreForAnswer(correct: boolean, secondsLeft: number): number {
  if (!correct) return 0;
  const clamped = Math.max(0, Math.min(SECONDS_PER_QUESTION, secondsLeft));
  return BASE_SCORE + clamped * SCORE_PER_SECOND;
}

export const numberGameIntro = '共 12 題，每題限時 10 秒，請把大寫金額轉成阿拉伯數字。';

let nextId = 1;

function makeGridQuestion(): GridQuestion {
  const value = randomAmount();
  return { id: nextId++, value, kind: 'grid', cells: toGridCells(value, { variants: Math.random() < 0.35 }) };
}

function makeCheckQuestion(): CheckQuestion {
  const value = randomAmount();
  return { id: nextId++, value, kind: 'check', capital: toCheckCapital(value, { variants: Math.random() < 0.35 }) };
}

/** 產生一輪題目：前 6 題方格、後 6 題支票寫法。 */
export function buildRound(): NumberQuestion[] {
  return [
    ...Array.from({ length: GRID_QUESTIONS }, makeGridQuestion),
    ...Array.from({ length: CHECK_QUESTIONS }, makeCheckQuestion),
  ];
}
