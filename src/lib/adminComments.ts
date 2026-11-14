import { adminFetch } from './adminSession';

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

export async function fetchAdminComments(): Promise<AdminComment[]> {
  const res = await adminFetch('/api/admin/comments');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('admin comments fetch failed');
  const payload = (await res.json()) as { comments?: AdminComment[] };
  return payload.comments || [];
}

export async function moderateComment(id: string, action: ModerateAction): Promise<void> {
  const res = await adminFetch(`/api/admin/comments/${id}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '操作失敗，請稍後再試。');
  }
}

// --- 文章留言板（經驗分享）管理 -------------------------------------------
// 與題目留言完全分開的一套 API：/api/admin/post-comments/*。後台也分頁顯示，不混。

export interface AdminPostComment {
  id: string;
  postId: string;
  /** 這則留言所屬文章的標題（由後端 join 帶出，方便後台辨識）。 */
  postTitle: string;
  name: string;
  text: string;
  createdAt: string;
  up: number;
  down: number;
  score: number;
  hidden: boolean;
  adminHidden: boolean;
}

export async function fetchAdminPostComments(): Promise<AdminPostComment[]> {
  const res = await adminFetch('/api/admin/post-comments');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('admin post comments fetch failed');
  const payload = (await res.json()) as { comments?: AdminPostComment[] };
  return payload.comments || [];
}

export async function moderatePostComment(id: string, action: ModerateAction): Promise<void> {
  const res = await adminFetch(`/api/admin/post-comments/${id}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '操作失敗，請稍後再試。');
  }
}
