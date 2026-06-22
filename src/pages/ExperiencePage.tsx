import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PenLine,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  X,
} from 'lucide-react';
import {
  emptyPostInput,
  fetchPosts,
  formatPostTime,
  loadMyPostVotes,
  submitPost,
  votePost,
  POST_CATEGORIES,
  type ExperiencePost,
  type PostCategory,
  type PostInput,
  type PostVote,
} from '../lib/posts';

type Filter = 'all' | PostCategory;
type Sort = 'new' | 'top';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  ...POST_CATEGORIES,
];

const catLabel = (c: PostCategory) => POST_CATEGORIES.find((x) => x.value === c)?.label || c;

// 經驗分享列表一頁最多顯示幾篇，超過就分頁。
const PAGE_SIZE = 3;

// 算出分頁要顯示哪些頁碼：頁數少時全列，多時以省略號收合中段，
// 永遠保留第一頁、最後一頁與目前頁的前後一頁。
function pageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function ExperiencePage() {
  const [posts, setPosts] = useState<ExperiencePost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // 預設依時間（最新）排序，最熱留作次要選項。
  const [sort, setSort] = useState<Sort>('new');
  // 左側分類選單預設「收合」。
  const [expanded, setExpanded] = useState<Record<PostCategory, boolean>>({ exam: false, work: false });
  const [myVotes, setMyVotes] = useState<Record<string, PostVote>>({});
  // 投稿視窗的開關。
  const [submitOpen, setSubmitOpen] = useState(false);
  // 目前在第幾頁（1-based）。
  const [page, setPage] = useState(1);

  useEffect(() => {
    setMyVotes(loadMyPostVotes());
    fetchPosts()
      .then((list) => {
        setPosts(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  // 純前端記憶體過濾（標題 / 作者），不額外打 API。
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
  }, [posts, query]);

  const byCategory = useMemo(() => {
    const map: Record<PostCategory, ExperiencePost[]> = { exam: [], work: [] };
    for (const p of matched) map[p.category]?.push(p);
    return map;
  }, [matched]);

  // 右側清單：依分類標籤過濾 + 排序（最新 / 最熱）。
  const rightList = useMemo(() => {
    const list = filter === 'all' ? matched : byCategory[filter] || [];
    const sorted = [...list];
    if (sort === 'top') sorted.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
    else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }, [matched, byCategory, filter, sort]);

  // 換分類 / 排序 / 搜尋時都回到第 1 頁。
  useEffect(() => {
    setPage(1);
  }, [filter, sort, query]);

  // 依目前清單長度切出本頁要顯示的文章。safePage 夾在合法範圍內，
  // 避免清單變短後 page 超出總頁數而顯示空白。
  const totalPages = Math.max(1, Math.ceil(rightList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = rightList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVote = (post: ExperiencePost, dir: PostVote) => {
    const next: PostVote | 0 = myVotes[post.id] === dir ? 0 : dir;
    votePost(post.id, next).then((updated) => {
      if (!updated) return;
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, up: updated.up, down: updated.down, score: updated.score } : p)));
      setMyVotes(loadMyPostVotes());
    });
  };

  const countFor = (f: Filter) => (f === 'all' ? matched.length : byCategory[f]?.length || 0);

  return (
    <div className="container py-4 experience-page">
      <div className="exp-head">
        <div className="interview-kicker">
          <BookOpen size={18} />
          經驗分享
        </div>
        <button type="button" className="exp-submit-btn" onClick={() => setSubmitOpen(true)}>
          <PenLine size={16} />
          我要投稿
        </button>
      </div>

      <div className="exp-layout">
        <aside className="exp-sidebar">
          <div className="exp-searchbar">
            <Search size={16} className="exp-search-icon" />
            <input
              className="exp-search-input"
              type="search"
              value={query}
              placeholder="搜尋標題或作者"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="exp-search-clear" aria-label="清除搜尋" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {POST_CATEGORIES.map((c) => {
            const list = byCategory[c.value] || [];
            // 有搜尋字串時自動展開，方便看到符合的標題。
            const isOpen = expanded[c.value] || !!query.trim();
            return (
              <div key={c.value} className="exp-cat">
                <button
                  type="button"
                  className="exp-cat-head"
                  onClick={() => setExpanded((prev) => ({ ...prev, [c.value]: !prev[c.value] }))}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="exp-cat-label">{c.label}</span>
                  <span className="exp-cat-count">{list.length}</span>
                </button>
                {isOpen && (
                  <ul className="exp-cat-list">
                    {list.length === 0 && (
                      <li className="exp-cat-empty">{query ? '無符合的文章' : '尚無文章'}</li>
                    )}
                    {list.map((p) => (
                      <li key={p.id}>
                        <Link to={`/experience/${p.id}`} className="exp-cat-link">
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </aside>

        <section className="exp-main">
          <div className="exp-toolbar">
            <div className="exp-chips">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`exp-chip ${filter === f.value ? 'is-active' : ''}`}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                  <span className="exp-chip-count">{countFor(f.value)}</span>
                </button>
              ))}
            </div>
            <div className="exp-sort">
              <button type="button" className={sort === 'new' ? 'is-active' : ''} onClick={() => setSort('new')}>
                最新
              </button>
              <button type="button" className={sort === 'top' ? 'is-active' : ''} onClick={() => setSort('top')}>
                最熱
              </button>
            </div>
          </div>

          {state === 'loading' && <p className="exp-empty">載入中…</p>}
          {state === 'error' && <p className="exp-empty">文章載入失敗，請稍後再試。</p>}

          {state === 'ready' && rightList.length === 0 && (
            <p className="exp-empty">
              {query ? `找不到符合「${query}」的文章。` : '這個分類還沒有文章，敬請期待。'}
            </p>
          )}

          {state === 'ready' &&
            pageItems.map((p) => (
              <article key={p.id} className="exp-preview">
                <div className="exp-preview-tags">
                  <span className="exp-preview-tag">{catLabel(p.category)}</span>
                </div>
                <h2 className="exp-preview-title">
                  <Link to={`/experience/${p.id}`}>{p.title}</Link>
                </h2>
                <div className="exp-preview-meta">
                  {p.author && (
                    <span className="exp-author">
                      <UserRound size={14} />
                      {p.author}
                    </span>
                  )}
                  <span>{formatPostTime(p.createdAt)}</span>
                </div>
                <p className="exp-preview-excerpt">{p.content}</p>
                <div className="exp-preview-foot">
                  <Link to={`/experience/${p.id}`} className="exp-readmore">
                    閱讀更多 →
                  </Link>
                  <VoteButtons post={p} my={myVotes[p.id]} onVote={handleVote} />
                </div>
              </article>
            ))}

          {state === 'ready' && totalPages > 1 && (
            <nav className="exp-pager" aria-label="文章分頁">
              <button
                type="button"
                className="exp-pager-btn"
                disabled={safePage === 1}
                onClick={() => goPage(safePage - 1)}
              >
                <ChevronLeft size={16} />
                上一頁
              </button>
              <div className="exp-pager-pages">
                {pageWindow(safePage, totalPages).map((n, i) =>
                  n === '…' ? (
                    <span key={`gap-${i}`} className="exp-pager-gap">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      className={`exp-pager-num ${n === safePage ? 'is-active' : ''}`}
                      aria-current={n === safePage ? 'page' : undefined}
                      onClick={() => goPage(n)}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                className="exp-pager-btn"
                disabled={safePage === totalPages}
                onClick={() => goPage(safePage + 1)}
              >
                下一頁
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </section>
      </div>

      {submitOpen && <SubmitModal onClose={() => setSubmitOpen(false)} />}
    </div>
  );
}

function SubmitModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<PostInput>(emptyPostInput());
  // 蜜罐欄位：真實使用者不會填，機器人才會。
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError('標題不可為空。');
      return;
    }
    if (!draft.content.trim()) {
      setError('內容不可為空。');
      return;
    }
    setBusy(true);
    setError('');
    submitPost({ ...draft, website })
      .then(() => setDone(true))
      .catch((err) => setError(err.message || '投稿失敗，請稍後再試。'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="cal-modal-backdrop" onClick={onClose}>
      <div className="cal-modal exp-submit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cal-modal-close" onClick={onClose} aria-label="關閉">
          <X size={18} />
        </button>

        {done ? (
          <div className="exp-submit-done">
            <CheckCircle2 size={40} className="exp-submit-done-icon" />
            <h2 className="exp-submit-title">投稿成功，感謝分享！</h2>
            <p className="exp-submit-note">
              你的文章已送出，將由管理員審核後公開，暫時還不會顯示在網站上。
            </p>
            <button type="button" className="admin-btn admin-btn-primary" onClick={onClose}>
              完成
            </button>
          </div>
        ) : (
          <form className="exp-submit-form" onSubmit={submit}>
            <h2 className="exp-submit-title">我要投稿</h2>
            <p className="exp-submit-note">
              分享你的考試 / 工作經驗。送出後會先由管理員審核，通過後才會公開顯示。
            </p>

            <label className="admin-field">
              <span className="admin-label">分類</span>
              <select
                className="admin-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as PostCategory })}
              >
                {POST_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span className="admin-label">作者（可留空）</span>
              <input
                className="admin-input"
                type="text"
                value={draft.author}
                placeholder="例如：阿明（可留空，預設匿名）"
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">標題</span>
              <input
                className="admin-input"
                type="text"
                value={draft.title}
                placeholder="例如：台銀一般金融上榜心得"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">內容</span>
              <textarea
                className="admin-input admin-textarea"
                rows={10}
                value={draft.content}
                placeholder="分享你的準備過程、面試經驗、工作心得…"
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
              <span className="exp-field-hint">
                這邊畢竟不是靠北板，希望大家投稿還是以經驗分享、傳承為主 🙏
              </span>
            </label>

            {/* 蜜罐：以 CSS 隱藏，真實使用者看不到也不會填。 */}
            <input
              className="exp-hp"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              aria-hidden="true"
            />

            {error && <p className="admin-error">{error}</p>}

            <div className="exp-submit-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
                <Send size={16} /> {busy ? '送出中…' : '送出投稿'}
              </button>
              <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose} disabled={busy}>
                取消
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function VoteButtons({
  post,
  my,
  onVote,
}: {
  post: ExperiencePost;
  my?: PostVote;
  onVote: (post: ExperiencePost, dir: PostVote) => void;
}) {
  return (
    <div className="exp-vote">
      <button
        type="button"
        className={`exp-vote-btn ${my === 1 ? 'is-up' : ''}`}
        onClick={() => onVote(post, 1)}
        aria-label="讚"
        title="讚"
      >
        <ThumbsUp size={15} />
        {post.up}
      </button>
      <button
        type="button"
        className={`exp-vote-btn ${my === -1 ? 'is-down' : ''}`}
        onClick={() => onVote(post, -1)}
        aria-label="倒讚"
        title="倒讚"
      >
        <ThumbsDown size={15} />
        {post.down}
      </button>
    </div>
  );
}
