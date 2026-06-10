import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  X,
} from 'lucide-react';
import {
  fetchPosts,
  formatPostTime,
  loadMyPostVotes,
  votePost,
  POST_CATEGORIES,
  type ExperiencePost,
  type PostCategory,
  type PostVote,
} from '../lib/posts';

type Filter = 'all' | PostCategory;
type Sort = 'new' | 'top';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  ...POST_CATEGORIES,
];

const catLabel = (c: PostCategory) => POST_CATEGORIES.find((x) => x.value === c)?.label || c;

export function ExperiencePage() {
  const [posts, setPosts] = useState<ExperiencePost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  // 左側分類選單預設「收合」。
  const [expanded, setExpanded] = useState<Record<PostCategory, boolean>>({ exam: false, work: false });
  const [myVotes, setMyVotes] = useState<Record<string, PostVote>>({});

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
      <div className="interview-kicker">
        <BookOpen size={18} />
        經驗分享
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
            rightList.map((p) => (
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
        </section>
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
