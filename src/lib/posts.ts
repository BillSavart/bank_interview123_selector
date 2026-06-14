// 經驗分享文章的型別與 API 呼叫。公開讀取走 /api/posts；後台發文／隱藏／刪除走
// /api/admin/posts/*，需帶上管理員 token（Authorization: Bearer，與行事曆共用）。
import { getVoterId } from './ratings';

/** 文章分類：考試篇 / 工作篇。 */
export type PostCategory = 'exam' | 'work';

export const POST_CATEGORIES: Array<{ value: PostCategory; label: string }> = [
  { value: 'exam', label: '考試篇' },
  { value: 'work', label: '工作篇' },
];

export interface ExperiencePost {
  id: string;
  /** 短網址用的 slug（6 碼）；短網址為 /e/<slug>。 */
  slug: string;
  category: PostCategory;
  title: string;
  /** 作者名字，可留空。 */
  author: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  /** 讚數。 */
  up: number;
  /** 倒讚數。 */
  down: number;
  /** 淨分（up − down）。 */
  score: number;
}

/** 後台視角：多帶 hidden 旗標，以及「使用者投稿待審核」的 pending 旗標。 */
export interface AdminPost extends ExperiencePost {
  hidden: boolean;
  /** true 代表這是使用者投稿、尚未經管理員審核公開的文章。 */
  pending: boolean;
}

/** 發文表單可編輯的欄位。 */
export interface PostInput {
  category: PostCategory;
  title: string;
  author: string;
  content: string;
}

export const emptyPostInput = (): PostInput => ({ category: 'exam', title: '', author: '', content: '' });

// 發文時間一律以「台北時間、24 小時制」顯示（YYYY/MM/DD HH:MM），
// 不受瀏覽器所在時區影響。
const taipeiFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatPostTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : taipeiFormatter.format(d);
}

/** 文章的短網址（/e/<slug>），找不到 slug 時退回完整文章網址。 */
export function postShortUrl(post: Pick<ExperiencePost, 'id' | 'slug'>): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return post.slug ? `${origin}/e/${post.slug}` : `${origin}/experience/${post.id}`;
}

// --- 文章按讚 / 倒讚 -------------------------------------------------------
export type PostVote = 1 | -1;

const myPostVotesKey = 'bank-interview-post-votes';

/** 讀出本機記錄的「我對哪些文章投了讚/倒讚」。 */
export function loadMyPostVotes(): Record<string, PostVote> {
  try {
    const parsed = JSON.parse(localStorage.getItem(myPostVotesKey) || '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v === 1 || v === -1),
    ) as Record<string, PostVote>;
  } catch {
    return {};
  }
}

function saveMyPostVote(postId: string, value: PostVote | 0) {
  const votes = loadMyPostVotes();
  if (value === 0) delete votes[postId];
  else votes[postId] = value;
  try {
    localStorage.setItem(myPostVotesKey, JSON.stringify(votes));
  } catch {
    // ignore storage failures
  }
}

/** 對文章投票。value: 1（讚）、-1（倒讚）、0（取消）。成功回傳更新後的文章。 */
export async function votePost(id: string, value: PostVote | 0): Promise<ExperiencePost | null> {
  const res = await fetch(`/api/posts/${id}/vote`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId: getVoterId(), value }),
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { post?: ExperiencePost };
  if (!payload.post) return null;
  saveMyPostVote(id, value);
  return payload.post;
}

export type PostModerateAction = 'hide' | 'show' | 'delete';

const authHeaders = (token: string) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/** 公開讀取文章（僅未隱藏，已由後端依時間排序，最新在前）。 */
export async function fetchPosts(): Promise<ExperiencePost[]> {
  const res = await fetch('/api/posts', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('posts fetch failed');
  const payload = (await res.json()) as { posts?: ExperiencePost[] };
  return payload.posts || [];
}

/**
 * 公開投稿一篇文章。送出後一律先存成「待審核」（hidden），要等管理員在後台
 * 開放後才會公開。成功不回傳文章本身（投稿者看不到尚未公開的內容）。
 * `website` 是給機器人用的蜜罐欄位，真實使用者一律留空。
 */
export async function submitPost(input: PostInput & { website?: string }): Promise<void> {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || '投稿失敗，請稍後再試。');
  }
}

/** 公開讀取單篇文章（隱藏或不存在會丟 404 錯誤）。 */
export async function fetchPost(id: string): Promise<ExperiencePost> {
  const res = await fetch(`/api/posts/${id}`, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error('not found');
  if (!res.ok) throw new Error('post fetch failed');
  const payload = (await res.json()) as { post?: ExperiencePost };
  if (!payload.post) throw new Error('not found');
  return payload.post;
}

/** 後台：取回全部文章（含隱藏），順帶驗證 token。 */
export async function fetchAdminPosts(token: string): Promise<AdminPost[]> {
  const res = await fetch('/api/admin/posts', { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('admin posts fetch failed');
  const payload = (await res.json()) as { posts?: AdminPost[] };
  return payload.posts || [];
}

export async function createPost(token: string, input: PostInput): Promise<AdminPost[]> {
  const res = await fetch('/api/admin/posts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return handleWriteResponse(res);
}

export async function updatePost(token: string, id: string, input: PostInput): Promise<AdminPost[]> {
  const res = await fetch(`/api/admin/posts/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return handleWriteResponse(res);
}

export async function moderatePost(
  token: string,
  id: string,
  action: PostModerateAction,
): Promise<AdminPost[]> {
  const res = await fetch(`/api/admin/posts/${id}/moderate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action }),
  });
  return handleWriteResponse(res);
}

async function handleWriteResponse(res: Response): Promise<AdminPost[]> {
  const payload = (await res.json().catch(() => ({}))) as { posts?: AdminPost[]; error?: string };
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(payload.error || '操作失敗，請稍後再試。');
  return payload.posts || [];
}
