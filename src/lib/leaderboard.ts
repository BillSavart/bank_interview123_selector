import { voterWrite } from './voterSession';

export interface LeaderboardEntry {
  name: string;
  score: number;
  createdAt: string;
}

export interface ScoreResult {
  leaderboard: LeaderboardEntry[];
  rank: number | null;
  score: number;
}

// Each mini-game has its own leaderboard, keyed by this slug. The API exposes
// `/api/<game>/leaderboard` and `/api/<game>/score` per game (see ratings-api.mjs).
export type GameKey = 'checkgame' | 'numbergame';

// Players share one nickname across games — only store it once.
const nameStorageKey = 'check-game-player-name';

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(nameStorageKey) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string) {
  try {
    localStorage.setItem(nameStorageKey, name);
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

export async function fetchLeaderboard(game: GameKey = 'checkgame'): Promise<LeaderboardEntry[]> {
  const response = await fetch(`/api/${game}/leaderboard`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('leaderboard fetch failed');

  const payload = (await response.json()) as { leaderboard?: LeaderboardEntry[] };
  return payload.leaderboard || [];
}

export interface RoundQuestion<Question> {
  roundId: string;
  index: number;
  total: number;
  question: Question;
  secondsLeft: number;
}

export interface RoundGrade<Answer> {
  correct: boolean;
  timedOut: boolean;
  gain: number;
  totalScore: number;
  answer: Answer;
  explanation?: string;
}

export async function gameRequest<Result>(
  game: GameKey,
  action: 'round' | 'answer' | 'next' | 'score',
  body: object,
): Promise<Result> {
  const path = `/api/${game}/${action}`;
  const response = await (action === 'score'
    ? voterWrite(path, body)
    : fetch(path, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '遊戲連線失敗，請稍後再試。');
  return data as Result;
}
