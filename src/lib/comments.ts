import { getVoterId } from './ratings';

export interface Comment {
  id: string;
  name: string;
  text: string;
  createdAt: string;
  up: number;
  down: number;
  score: number;
  hidden: boolean;
}

export type CommentVote = 1 | -1;

const myVotesStorageKey = 'bank-interview-comment-votes';

export function loadMyCommentVotes(): Record<string, CommentVote> {
  try {
    const parsed = JSON.parse(localStorage.getItem(myVotesStorageKey) || '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v === 1 || v === -1),
    ) as Record<string, CommentVote>;
  } catch {
    return {};
  }
}

function saveMyCommentVote(commentId: string, value: CommentVote | 0) {
  const votes = loadMyCommentVotes();
  if (value === 0) delete votes[commentId];
  else votes[commentId] = value;
  localStorage.setItem(myVotesStorageKey, JSON.stringify(votes));
}

export async function fetchComments(questionId: number): Promise<Comment[]> {
  const response = await fetch(`/api/comments/${questionId}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('comments fetch failed');

  const payload = (await response.json()) as { comments?: Comment[] };
  return payload.comments || [];
}

export interface SubmitCommentResult {
  comment?: Comment;
  error?: string;
}

export async function submitComment(
  questionId: number,
  text: string,
  name: string,
): Promise<SubmitCommentResult> {
  const response = await fetch(`/api/comments/${questionId}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    // `website` is the honeypot field — always sent empty by real users.
    body: JSON.stringify({ text, name, website: '' }),
  });

  const payload = (await response.json().catch(() => ({}))) as { comment?: Comment; error?: string };
  if (!response.ok) {
    return { error: payload.error || '留言失敗，請稍後再試。' };
  }
  return { comment: payload.comment };
}

// value: 1 (up), -1 (down), or 0 (clear). Persists the user's choice locally.
export async function voteComment(
  questionId: number,
  commentId: string,
  value: CommentVote | 0,
): Promise<Comment | null> {
  const response = await fetch(`/api/comments/${questionId}/${commentId}/vote`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voterId: getVoterId(), value }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { comment?: Comment };
  if (!payload.comment) return null;
  saveMyCommentVote(commentId, value);
  return payload.comment;
}
