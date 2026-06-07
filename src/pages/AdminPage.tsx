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
  const [tab, setTab] = useState<'calendar' | 'comments'>('calendar');
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
          className={`admin-tab ${tab === 'comments' ? 'is-active' : ''}`}
          onClick={() => setTab('comments')}
        >
          留言板管理
        </button>
      </div>

      {tab === 'comments' ? (
        <CommentsAdmin token={token} />
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
