export interface LeaderboardEntry {
  name: string;
  score: number;
  createdAt: string;
}

export interface SubmitScoreResult {
  leaderboard?: LeaderboardEntry[];
  rank?: number | null;
  error?: string;
}

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

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/checkgame/leaderboard', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('leaderboard fetch failed');

  const payload = (await response.json()) as { leaderboard?: LeaderboardEntry[] };
  return payload.leaderboard || [];
}

export async function submitScore(name: string, score: number): Promise<SubmitScoreResult> {
  const response = await fetch('/api/checkgame/score', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    // `website` is a honeypot — real players always send it empty.
    body: JSON.stringify({ name, score, website: '' }),
  });

  const payload = (await response.json().catch(() => ({}))) as SubmitScoreResult;
  if (!response.ok) {
    return { error: payload.error || '成績送出失敗，請稍後再試。' };
  }
  return payload;
}
