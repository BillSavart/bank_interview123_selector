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

export interface SubmitCommentResult {
  comment?: Comment;
  error?: string;
}

// --- 通用留言 API（依 base 路徑分流）-------------------------------------
// 面試篩選器題目用 `/api/comments/<questionId>`；經驗分享文章用
// `/api/post-comments/<postId>`。兩邊的請求/回應格式一致，只差在 base 路徑，
// 所以共用這組函式，由呼叫端決定 base。
export async function fetchCommentsAt(base: string): Promise<Comment[]> {
  const response = await fetch(base, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('comments fetch failed');

  const payload = (await response.json()) as { comments?: Comment[] };
  return payload.comments || [];
}

export async function submitCommentAt(
  base: string,
  text: string,
  name: string,
): Promise<SubmitCommentResult> {
  const response = await fetch(base, {
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
export async function voteCommentAt(
  base: string,
  commentId: string,
  value: CommentVote | 0,
): Promise<Comment | null> {
  const response = await fetch(`${base}/${commentId}/vote`, {
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

// 面試篩選器題目留言：固定打 `/api/comments/<questionId>`。
export const fetchComments = (questionId: number) => fetchCommentsAt(`/api/comments/${questionId}`);
export const submitComment = (questionId: number, text: string, name: string) =>
  submitCommentAt(`/api/comments/${questionId}`, text, name);
export const voteComment = (questionId: number, commentId: string, value: CommentVote | 0) =>
  voteCommentAt(`/api/comments/${questionId}`, commentId, value);
