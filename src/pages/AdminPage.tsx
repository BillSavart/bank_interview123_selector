import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Save, X, LogOut, Pencil, EyeOff, Eye } from 'lucide-react';
import {
  createEvent,
  deleteEvent,
  emptyEventInput,
  fetchAdminCalendar,
  loadAdminToken,
  saveAdminToken,
  updateEvent,
  type CalendarEvent,
  type CalendarEventInput,
} from '../lib/calendar';
import {
  fetchAdminComments,
  moderateComment,
  type AdminComment,
  type ModerateAction,
} from '../lib/adminComments';
import {
  LEADERBOARD_GAMES,
  fetchLeaderboard,
  deleteLeaderboardEntry,
  type LeaderboardEntry,
} from '../lib/adminLeaderboard';
import {
  POST_CATEGORIES,
  createPost,
  emptyPostInput,
  fetchAdminPosts,
  formatPostTime,
  moderatePost,
  updatePost,
  type AdminPost,
  type PostCategory,
  type PostInput,
  type PostModerateAction,
} from '../lib/posts';

const FIELD_LABELS: Array<{ key: keyof CalendarEventInput; label: string; type: 'text' | 'datetime'; placeholder?: string }> = [
  { key: 'org', label: '機關 / 名稱', type: 'text', placeholder: '台灣銀行 一般金融人員' },
  { key: 'signupStart', label: '報名起始', type: 'datetime' },
  { key: 'signupEnd', label: '報名截止', type: 'datetime' },
  { key: 'writtenExam', label: '筆試日期', type: 'datetime' },
  { key: 'answerKey', label: '試題與解答公告', type: 'datetime' },
  { key: 'writtenResult', label: '筆試結果公佈', type: 'datetime' },
  { key: 'interview', label: '面試', type: 'datetime' },
  { key: 'interview2', label: '二面', type: 'datetime' },
  { key: 'finalResult', label: '放榜', type: 'datetime' },
  { key: 'link', label: '簡章連結', type: 'text', placeholder: 'https://…' },
  { key: 'note', label: '備註', type: 'text' },
];

// A stored date field may carry a trailing " HH:MM" time. Split / join helpers.
const splitDT = (v: string): { date: string; time: string } => {
  const [date = '', time = ''] = (v || '').split(' ');
  return { date, time };
};
const joinDT = (date: string, time: string): string => (date ? (time ? `${date} ${time}` : date) : '');

// 24-hour options for the custom time picker (native <input type=time> can render
// as AM/PM depending on the browser locale, so we use our own selects instead).
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function AdminPage() {
  const [token, setToken] = useState(loadAdminToken());
  const [authed, setAuthed] = useState(false);

  // Try to auto-login with a saved token on mount.
  useEffect(() => {
    if (!token) return;
    fetchAdminCalendar(token)
      .then((list) => {
        setEvents(list);
        setAuthed(true);
      })
      .catch(() => saveAdminToken(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loginError, setLoginError] = useState('');

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    fetchAdminCalendar(token.trim())
      .then((list) => {
        saveAdminToken(token.trim());
        setEvents(list);
        setAuthed(true);
      })
      .catch(() => setLoginError('管理金鑰不正確，或後台未啟用。'));
  };

  const logout = () => {
    saveAdminToken('');
    setToken('');
    setAuthed(false);
    setEvents([]);
  };

  if (!authed) {
    return (
      <div className="container py-4 admin-page">
        <div className="interview-kicker">
          <ShieldCheck size={18} />
          管理後台
        </div>
        <form className="admin-login" onSubmit={login}>
          <h1 className="admin-login-title">管理員登入</h1>
          <label htmlFor="admin-token" className="admin-label">
            管理金鑰
          </label>
          <input
            id="admin-token"
            className="admin-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="輸入 ADMIN_TOKEN"
            autoComplete="off"
          />
          {loginError && <p className="admin-error">{loginError}</p>}
          <button type="submit" className="admin-btn admin-btn-primary" disabled={!token.trim()}>
            登入
          </button>
        </form>
      </div>
    );
  }

  return (
    <AdminDashboard token={token.trim()} events={events} setEvents={setEvents} onLogout={logout} />
  );
}

function AdminDashboard({
  token,
  events,
  setEvents,
  onLogout,
}: {
  token: string;
  events: CalendarEvent[];
  setEvents: (e: CalendarEvent[]) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<'calendar' | 'experience' | 'comments' | 'leaderboard'>('calendar');
  // `null` = no form open; '' draft for new; an id for editing.
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<CalendarEventInput>(emptyEventInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openNew = () => {
    setDraft(emptyEventInput());
    setEditingId('new');
    setError('');
  };

  const openEdit = (ev: CalendarEvent) => {
    setDraft({
      org: ev.org,
      signupStart: ev.signupStart,
      signupEnd: ev.signupEnd,
      writtenExam: ev.writtenExam,
      answerKey: ev.answerKey,
      writtenResult: ev.writtenResult,
      interview: ev.interview,
      interview2: ev.interview2,
      finalResult: ev.finalResult,
      link: ev.link,
      note: ev.note,
    });
    setEditingId(ev.id);
    setError('');
  };

  const closeForm = () => {
    setEditingId(null);
    setError('');
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.org.trim()) {
      setError('機關/名稱不可為空。');
      return;
    }
    setBusy(true);
    setError('');
    const action =
      editingId === 'new' ? createEvent(token, draft) : updateEvent(token, editingId as string, draft);
    action
      .then((list) => {
        setEvents(list);
        setEditingId(null);
      })
      .catch((err) => setError(err.message || '儲存失敗。'))
      .finally(() => setBusy(false));
  };

  const remove = (ev: CalendarEvent) => {
    if (!window.confirm(`確定刪除「${ev.org}」？`)) return;
    setBusy(true);
    deleteEvent(token, ev.id)
      .then(setEvents)
      .catch((err) => setError(err.message || '刪除失敗。'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="container py-4 admin-page">
      <div className="admin-topbar">
        <div className="interview-kicker">
          <ShieldCheck size={18} />
          管理後台
        </div>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onLogout}>
          <LogOut size={16} /> 登出
        </button>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${tab === 'calendar' ? 'is-active' : ''}`}
          onClick={() => setTab('calendar')}
        >
          招考行事曆
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'experience' ? 'is-active' : ''}`}
          onClick={() => setTab('experience')}
        >
          經驗分享
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'comments' ? 'is-active' : ''}`}
          onClick={() => setTab('comments')}
        >
          留言板管理
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'leaderboard' ? 'is-active' : ''}`}
          onClick={() => setTab('leaderboard')}
        >
          排行榜管理
        </button>
      </div>

      {tab === 'experience' ? (
        <PostsAdmin token={token} />
      ) : tab === 'comments' ? (
        <CommentsAdmin token={token} />
      ) : tab === 'leaderboard' ? (
        <LeaderboardAdmin token={token} />
      ) : (
        <>
          {error && <p className="admin-error">{error}</p>}

          {editingId === null ? (
        <button type="button" className="admin-btn admin-btn-primary admin-add" onClick={openNew}>
          <Plus size={18} /> 新增招考
        </button>
      ) : (
        <form className="admin-form" onSubmit={save}>
          <h2 className="admin-form-title">{editingId === 'new' ? '新增招考' : '編輯招考'}</h2>
          <div className="admin-form-grid">
            {FIELD_LABELS.map((f) => {
              if (f.type === 'datetime') {
                const { date, time } = splitDT(draft[f.key]);
                const [hh = '', mm = ''] = time ? time.split(':') : ['', ''];
                return (
                  <label key={f.key} className="admin-field">
                    <span className="admin-label">{f.label}</span>
                    <div className="admin-datetime">
                      <input
                        className="admin-input"
                        type="date"
                        value={date}
                        // When a date is first picked, default the time to 14:00 (24h).
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [f.key]: joinDT(e.target.value, e.target.value ? time || '14:00' : ''),
                          })
                        }
                      />
                      {/* 24-hour time pickers (時 / 分) */}
                      <select
                        className="admin-input admin-time-select"
                        value={hh}
                        disabled={!date}
                        aria-label={`${f.label} 時`}
                        onChange={(e) => setDraft({ ...draft, [f.key]: joinDT(date, `${e.target.value}:${mm || '00'}`) })}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <span className="admin-time-colon">:</span>
                      <select
                        className="admin-input admin-time-select"
                        value={mm}
                        disabled={!date}
                        aria-label={`${f.label} 分`}
                        onChange={(e) => setDraft({ ...draft, [f.key]: joinDT(date, `${hh || '00'}:${e.target.value}`) })}
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                );
              }
              return (
                <label key={f.key} className={`admin-field ${f.key === 'note' ? 'admin-field-wide' : ''}`}>
                  <span className="admin-label">{f.label}</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={draft[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                </label>
              );
            })}
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
              <Save size={16} /> 儲存
            </button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={closeForm} disabled={busy}>
              <X size={16} /> 取消
            </button>
          </div>
        </form>
      )}

      <div className="admin-list">
        {events.length === 0 && <p className="admin-empty">尚無招考資料，點「新增招考」開始建立。</p>}
        {events.map((ev) => (
          <div key={ev.id} className="admin-row">
            <div className="admin-row-main">
              <span className="admin-row-org">{ev.org}</span>
              <span className="admin-row-meta">
                {(ev.signupStart || ev.signupEnd) && (
                  <span>
                    報名 {ev.signupStart || '?'}～{ev.signupEnd || '?'}
                  </span>
                )}
                {ev.writtenExam && <span>筆試 {ev.writtenExam}</span>}
                {ev.interview && <span>面試 {ev.interview}</span>}
                {ev.finalResult && <span>放榜 {ev.finalResult}</span>}
              </span>
            </div>
            <div className="admin-row-actions">
              <button type="button" className="admin-icon-btn" onClick={() => openEdit(ev)} aria-label="編輯">
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="admin-icon-btn is-danger"
                onClick={() => remove(ev)}
                aria-label="刪除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
          </div>
        </>
      )}
    </div>
  );
}

function PostsAdmin({ token }: { token: string }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  // `null` = no form open; 'new' = composing a new post; an id = editing it.
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<PostInput>(emptyPostInput());
  // List filters (only relevant when many posts have accumulated).
  const [filterCat, setFilterCat] = useState<PostCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const load = () => {
    setState('loading');
    fetchAdminPosts(token)
      .then((list) => {
        setPosts(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  };

  useEffect(load, [token]);

  const openNew = () => {
    setDraft(emptyPostInput());
    setEditingId('new');
    setError('');
  };

  const openEdit = (p: AdminPost) => {
    setDraft({ category: p.category, title: p.title, author: p.author, content: p.content });
    setEditingId(p.id);
    setError('');
  };

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
    setBusyId('form');
    setError('');
    const action = editingId === 'new' ? createPost(token, draft) : updatePost(token, editingId as string, draft);
    action
      .then((list) => {
        setPosts(list);
        setEditingId(null);
      })
      .catch((err) => setError(err.message || '儲存失敗。'))
      .finally(() => setBusyId(''));
  };

  const act = (p: AdminPost, action: PostModerateAction) => {
    if (action === 'delete' && !window.confirm(`確定永久刪除「${p.title}」？`)) return;
    setBusyId(p.id);
    setError('');
    moderatePost(token, p.id, action)
      .then(setPosts)
      .catch((err) => setError(err.message || '操作失敗。'))
      .finally(() => setBusyId(''));
  };

  if (state === 'loading') return <p className="admin-empty">載入中…</p>;
  if (state === 'error') return <p className="admin-error">文章載入失敗，請重新登入或稍後再試。</p>;

  const catLabel = (c: AdminPost['category']) => POST_CATEGORIES.find((x) => x.value === c)?.label || c;

  const q = query.trim().toLowerCase();
  const filtered = posts.filter(
    (p) =>
      (filterCat === 'all' || p.category === filterCat) &&
      (!q || p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)),
  );
  const filterCats: Array<{ value: PostCategory | 'all'; label: string }> = [
    { value: 'all', label: '全部' },
    ...POST_CATEGORIES,
  ];

  return (
    <div>
      {error && <p className="admin-error">{error}</p>}

      {editingId !== null ? (
        <form className="admin-form" onSubmit={submit}>
          <h2 className="admin-form-title">{editingId === 'new' ? '發表文章' : '編輯文章'}</h2>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span className="admin-label">分類</span>
              <select
                className="admin-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as PostInput['category'] })}
              >
                {POST_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">作者</span>
              <input
                className="admin-input"
                type="text"
                value={draft.author}
                placeholder="例如：阿明（可留空）"
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </label>
            <label className="admin-field admin-field-wide">
              <span className="admin-label">標題</span>
              <input
                className="admin-input"
                type="text"
                value={draft.title}
                placeholder="例如：台銀一般金融上榜心得"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="admin-field admin-field-wide">
              <span className="admin-label">內容</span>
              <textarea
                className="admin-input admin-textarea"
                rows={10}
                value={draft.content}
                placeholder="文章內容…"
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={busyId === 'form'}>
              <Save size={16} /> {editingId === 'new' ? '發表' : '儲存'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={() => setEditingId(null)}
              disabled={busyId === 'form'}
            >
              <X size={16} /> 取消
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="admin-btn admin-btn-primary admin-add" onClick={openNew}>
          <Plus size={18} /> 發表文章
        </button>
      )}

      {posts.length > 0 && (
        <div className="admin-filterbar">
          <div className="admin-chips">
            {filterCats.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`admin-chip ${filterCat === c.value ? 'is-active' : ''}`}
                onClick={() => setFilterCat(c.value)}
              >
                {c.label}
                <span className="admin-chip-count">
                  {c.value === 'all' ? posts.length : posts.filter((p) => p.category === c.value).length}
                </span>
              </button>
            ))}
          </div>
          <input
            className="admin-input admin-search"
            type="search"
            value={query}
            placeholder="搜尋標題或作者…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      <div className="admin-list">
        {posts.length === 0 && <p className="admin-empty">目前沒有任何文章，點「發表文章」開始撰寫。</p>}
        {posts.length > 0 && filtered.length === 0 && (
          <p className="admin-empty">沒有符合條件的文章。</p>
        )}
        {filtered.map((p) => (
          <div key={p.id} className={`admin-row ${p.hidden ? 'is-hidden' : ''}`}>
            <div className="admin-row-main">
              <span className="admin-row-org">
                <span className="admin-lb-rank">{catLabel(p.category)}</span> {p.title}
                {p.hidden && <em className="admin-tag-hidden">已隱藏</em>}
              </span>
              <span className="admin-comment-text admin-post-excerpt">{p.content}</span>
              <span className="admin-row-meta">
                {p.author && <span>作者 {p.author}</span>}
                <span>{formatPostTime(p.createdAt)}</span>
              </span>
            </div>
            <div className="admin-row-actions">
              <button
                type="button"
                className="admin-icon-btn"
                disabled={busyId === p.id}
                onClick={() => openEdit(p)}
                aria-label="編輯"
                title="編輯文章"
              >
                <Pencil size={16} />
              </button>
              {p.hidden ? (
                <button
                  type="button"
                  className="admin-icon-btn"
                  disabled={busyId === p.id}
                  onClick={() => act(p, 'show')}
                  aria-label="取消隱藏"
                  title="取消隱藏"
                >
                  <Eye size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-icon-btn"
                  disabled={busyId === p.id}
                  onClick={() => act(p, 'hide')}
                  aria-label="隱藏"
                  title="隱藏文章"
                >
                  <EyeOff size={16} />
                </button>
              )}
              <button
                type="button"
                className="admin-icon-btn is-danger"
                disabled={busyId === p.id}
                onClick={() => act(p, 'delete')}
                aria-label="刪除"
                title="永久刪除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsAdmin({ token }: { token: string }) {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = () => {
    setState('loading');
    fetchAdminComments(token)
      .then((list) => {
        setComments(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  };

  useEffect(load, [token]);

  const act = (c: AdminComment, action: ModerateAction) => {
    if (action === 'delete' && !window.confirm(`確定永久刪除這則留言？\n「${c.text.slice(0, 40)}」`)) return;
    setBusyId(c.id);
    setError('');
    moderateComment(token, c.id, action)
      .then(() => {
        setComments((prev) => {
          if (action === 'delete') return prev.filter((x) => x.id !== c.id);
          return prev.map((x) => (x.id === c.id ? { ...x, adminHidden: action === 'hide', hidden: action === 'hide' || x.hidden } : x));
        });
      })
      .catch((err) => setError(err.message || '操作失敗。'))
      .finally(() => setBusyId(''));
  };

  if (state === 'loading') return <p className="admin-empty">載入中…</p>;
  if (state === 'error') return <p className="admin-error">留言載入失敗，請重新登入或稍後再試。</p>;

  return (
    <div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-list">
        {comments.length === 0 && <p className="admin-empty">目前沒有任何留言。</p>}
        {comments.map((c) => (
          <div key={c.id} className={`admin-row ${c.adminHidden ? 'is-hidden' : ''}`}>
            <div className="admin-row-main">
              <span className="admin-row-org">
                第 {c.questionId} 題 · {c.name}
                {c.adminHidden && <em className="admin-tag-hidden">已隱藏</em>}
              </span>
              <span className="admin-comment-text">{c.text}</span>
              <span className="admin-row-meta">
                <span>讚 {c.up}</span>
                <span>倒讚 {c.down}</span>
                <span>{new Date(c.createdAt).toLocaleString('zh-TW', { hour12: false })}</span>
              </span>
            </div>
            <div className="admin-row-actions">
              {c.adminHidden ? (
                <button
                  type="button"
                  className="admin-icon-btn"
                  disabled={busyId === c.id}
                  onClick={() => act(c, 'show')}
                  aria-label="取消隱藏"
                  title="取消隱藏"
                >
                  <Eye size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-icon-btn"
                  disabled={busyId === c.id}
                  onClick={() => act(c, 'hide')}
                  aria-label="隱藏"
                  title="隱藏留言"
                >
                  <EyeOff size={16} />
                </button>
              )}
              <button
                type="button"
                className="admin-icon-btn is-danger"
                disabled={busyId === c.id}
                onClick={() => act(c, 'delete')}
                aria-label="刪除"
                title="永久刪除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardAdmin({ token }: { token: string }) {
  // One board per game, loaded together; null until its fetch resolves.
  const [boards, setBoards] = useState<Record<string, LeaderboardEntry[] | null>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    let alive = true;
    setState('loading');
    Promise.all(LEADERBOARD_GAMES.map((g) => fetchLeaderboard(g.slug).then((rows) => [g.slug, rows] as const)))
      .then((pairs) => {
        if (!alive) return;
        setBoards(Object.fromEntries(pairs));
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [token]);

  const remove = (slug: string, entry: LeaderboardEntry) => {
    if (!window.confirm(`確定刪除「${entry.name}」（${entry.score} 分）的排行榜紀錄？`)) return;
    setBusyKey(`${slug}:${entry.name}`);
    setError('');
    deleteLeaderboardEntry(token, slug, entry.name)
      .then((rows) => setBoards((prev) => ({ ...prev, [slug]: rows })))
      .catch((err) => setError(err.message || '刪除失敗。'))
      .finally(() => setBusyKey(''));
  };

  if (state === 'loading') return <p className="admin-empty">載入中…</p>;
  if (state === 'error') return <p className="admin-error">排行榜載入失敗，請重新登入或稍後再試。</p>;

  return (
    <div>
      {error && <p className="admin-error">{error}</p>}
      {LEADERBOARD_GAMES.map((g) => {
        const rows = boards[g.slug] ?? [];
        return (
          <section key={g.slug} className="admin-lb-section">
            <h2 className="admin-form-title">{g.label}</h2>
            <div className="admin-list">
              {rows.length === 0 && <p className="admin-empty">目前沒有任何紀錄。</p>}
              {rows.map((entry, i) => (
                <div key={`${entry.name}-${entry.createdAt}`} className="admin-row">
                  <div className="admin-row-main">
                    <span className="admin-row-org">
                      <span className="admin-lb-rank">#{i + 1}</span> {entry.name}
                    </span>
                    <span className="admin-row-meta">
                      <span>{entry.score} 分</span>
                      {entry.createdAt && (
                        <span>{new Date(entry.createdAt).toLocaleString('zh-TW', { hour12: false })}</span>
                      )}
                    </span>
                  </div>
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="admin-icon-btn is-danger"
                      disabled={busyKey === `${g.slug}:${entry.name}`}
                      onClick={() => remove(g.slug, entry)}
                      aria-label="刪除"
                      title="刪除這筆紀錄"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
