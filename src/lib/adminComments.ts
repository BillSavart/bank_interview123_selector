// Admin API for moderating the question-board comments. All calls require the
// ADMIN_TOKEN bearer (same token as the calendar admin).

export interface AdminComment {
  id: string;
  questionId: number;
  name: string;
  text: string;
  createdAt: string;
  up: number;
  down: number;
  score: number;
  hidden: boolean;
  adminHidden: boolean;
}

export type ModerateAction = 'hide' | 'show' | 'delete';

const authHeaders = (token: string) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export async function fetchAdminComments(token: string): Promise<AdminComment[]> {
  const res = await fetch('/api/admin/comments', { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('admin comments fetch failed');
  const payload = (await res.json()) as { comments?: AdminComment[] };
  return payload.comments || [];
}

export async function moderateComment(token: string, id: string, action: ModerateAction): Promise<void> {
  const res = await fetch(`/api/admin/comments/${id}/moderate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '操作失敗，請稍後再試。');
  }
}
