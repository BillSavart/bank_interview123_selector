export interface Comment {
  id: string;
  name: string;
  text: string;
  createdAt: string;
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
