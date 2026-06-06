export interface RatingSummary {
  questionId: number;
  count: number;
  average: number | null;
}

export type RatingMap = Record<number, RatingSummary>;

const voterStorageKey = 'bank-interview-rating-voter-id';
const scoreStorageKey = 'bank-interview-rating-scores';

const createClientId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
};

export function getVoterId() {
  const existing = localStorage.getItem(voterStorageKey);
  if (existing) return existing;

  const voterId = createClientId();
  localStorage.setItem(voterStorageKey, voterId);
  return voterId;
}

export function loadLocalScores(): Record<number, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(scoreStorageKey) || '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([questionId, score]) => [Number(questionId), Number(score)])
        .filter(([questionId, score]) => Number.isInteger(questionId) && Number.isInteger(score) && score >= 1 && score <= 5),
    );
  } catch {
    return {};
  }
}

export function saveLocalScore(questionId: number, score: number) {
  const scores = loadLocalScores();
  scores[questionId] = score;
  localStorage.setItem(scoreStorageKey, JSON.stringify(scores));
}

export async function fetchRatings(): Promise<RatingMap> {
  const response = await fetch('/api/ratings', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('ratings fetch failed');

  const payload = (await response.json()) as { ratings?: RatingSummary[] };
  return Object.fromEntries((payload.ratings || []).map((rating) => [rating.questionId, rating]));
}

export async function submitRating(questionId: number, score: number): Promise<RatingSummary> {
  const response = await fetch(`/api/ratings/${questionId}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ score, voterId: getVoterId() }),
  });

  if (!response.ok) throw new Error('rating submit failed');
  const payload = (await response.json()) as { rating: RatingSummary };
  saveLocalScore(questionId, score);
  return payload.rating;
}
