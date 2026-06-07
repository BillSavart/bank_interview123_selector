// Admin API for the mini-game leaderboards. Listing uses the public endpoint
// (the board is public anyway); deletion requires the ADMIN_TOKEN bearer (same
// token as the calendar / comments admin).

export interface LeaderboardEntry {
  name: string;
  score: number;
  createdAt: string;
}

// URL slug → display name, matching the leaderboards in the server API.
export const LEADERBOARD_GAMES: Array<{ slug: string; label: string }> = [
  { slug: 'checkgame', label: '支票審查員' },
  { slug: 'numbergame', label: '大寫數字訓練器' },
];

const authHeaders = (token: string) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export async function fetchLeaderboard(game: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/api/${game}/leaderboard`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('leaderboard fetch failed');
  const payload = (await res.json()) as { leaderboard?: LeaderboardEntry[] };
  return payload.leaderboard || [];
}

export async function deleteLeaderboardEntry(token: string, game: string, name: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/api/admin/${game}/leaderboard`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '刪除失敗，請稍後再試。');
  }
  const payload = (await res.json()) as { leaderboard?: LeaderboardEntry[] };
  return payload.leaderboard || [];
}
