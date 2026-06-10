import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  fetchCommentsAt,
  loadMyCommentVotes,
  submitCommentAt,
  voteCommentAt,
  type Comment,
  type CommentVote,
} from '../lib/comments';

// 同一個留言板元件服務兩種來源：面試篩選器題目（整數題號）與經驗分享文章
// （文章 id 字串）。兩者只差在 API base 路徑與標題，其餘行為完全一致。
export type CommentSource =
  | { kind: 'question'; questionId: number }
  | { kind: 'post'; postId: string };

interface CommentBoardProps {
  source: CommentSource;
}

const sourceBase = (source: CommentSource) =>
  source.kind === 'question' ? `/api/comments/${source.questionId}` : `/api/post-comments/${source.postId}`;

const sourceAriaLabel = (source: CommentSource) =>
  source.kind === 'question' ? `第 ${source.questionId} 題留言板` : '文章留言板';

type SortMode = 'votes' | 'time';

const nameStorageKey = 'bank-interview-comment-name';
const commentRefreshIntervalMs = 60000;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Anonymous, per-question comment board with up/down voting. Mounts only when a
// question's answer panel is expanded, so comments are fetched lazily on demand.
export function CommentBoard({ source }: CommentBoardProps) {
  const base = sourceBase(source);
  const ariaLabel = sourceAriaLabel(source);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [name, setName] = useState(() => localStorage.getItem(nameStorageKey) || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('votes');
  const [showHidden, setShowHidden] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, CommentVote>>(() => loadMyCommentVotes());
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    const refreshComments = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);

      fetchCommentsAt(base)
        .then((next) => {
          if (isMounted) setComments(next);
        })
        .catch(() => {
          if (isMounted && showSpinner) setComments([]);
        })
        .finally(() => {
          if (isMounted && showSpinner) setLoading(false);
        });
    };

    refreshComments(true);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshComments(false);
    }, commentRefreshIntervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshComments(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [base]);

  const sortedComments = useMemo(() => {
    const list = [...comments];
    if (sort === 'votes') {
      list.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [comments, sort]);
  const hiddenCount = comments.filter((comment) => comment.hidden).length;
  const displayedComments = showHidden ? sortedComments : sortedComments.filter((comment) => !comment.hidden);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    // Honeypot — if a bot filled this hidden field, drop silently.
    if (honeypotRef.current?.value) return;

    setSubmitting(true);
    setError(null);

    const trimmedName = name.trim();
    const result = await submitCommentAt(base, trimmed, trimmedName);

    if (result.comment) {
      setComments((current) => [...current, result.comment as Comment]);
      setText('');
      if (trimmedName) localStorage.setItem(nameStorageKey, trimmedName);
    } else {
      setError(result.error ?? '留言失敗，請稍後再試。');
    }

    setSubmitting(false);
  };

  const handleVote = async (comment: Comment, choice: CommentVote) => {
    // Clicking your current vote again clears it; otherwise switch to it.
    const nextValue: CommentVote | 0 = myVotes[comment.id] === choice ? 0 : choice;

    const updated = await voteCommentAt(base, comment.id, nextValue);
    if (!updated) return;

    setComments((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    setMyVotes((current) => {
      const next = { ...current };
      if (nextValue === 0) delete next[comment.id];
      else next[comment.id] = nextValue;
      return next;
    });
  };

  return (
    <section className="comment-board" aria-label={ariaLabel}>
      <div className="comment-board-head">
        <MessageSquare size={16} />
        <span>留言板</span>
        <small>{comments.length} 則留言</small>
        {comments.length > 0 && (
          <select
            className="comment-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            aria-label="留言排序方式"
          >
            <option value="votes">依讚數排序</option>
            <option value="time">依時間排序</option>
          </select>
        )}
        {hiddenCount > 0 && (
          <label className="comment-hidden-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            <span>顯示隱藏留言</span>
          </label>
        )}
      </div>

      {loading ? (
        <p className="comment-empty">載入中…</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty">還沒有留言，留下第一則吧。</p>
      ) : displayedComments.length === 0 ? (
        <p className="comment-empty">有 {hiddenCount} 則留言因評分過低被隱藏。</p>
      ) : (
        <ul className="comment-list">
          {displayedComments.map((comment) => {
            const myVote = myVotes[comment.id];
            return (
              <li key={comment.id} className={`comment-item${comment.hidden ? ' is-hidden' : ''}`}>
                <div className="comment-votes">
                  <button
                    type="button"
                    className={`comment-vote-btn${myVote === 1 ? ' is-active up' : ''}`}
                    onClick={() => handleVote(comment, 1)}
                    aria-label="讚"
                    aria-pressed={myVote === 1}
                  >
                    <ThumbsUp size={15} />
                    <span>{comment.up}</span>
                  </button>
                  <span className="comment-score" aria-label={`分數 ${comment.score}`}>
                    {comment.score}
                  </span>
                  <button
                    type="button"
                    className={`comment-vote-btn${myVote === -1 ? ' is-active down' : ''}`}
                    onClick={() => handleVote(comment, -1)}
                    aria-label="倒讚"
                    aria-pressed={myVote === -1}
                  >
                    <ThumbsDown size={15} />
                    <span>{comment.down}</span>
                  </button>
                </div>
                <div className="comment-body">
                  <div className="comment-item-head">
                    <strong>{comment.name}</strong>
                    {comment.hidden && <span className="comment-hidden-badge">已隱藏</span>}
                    <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
                  </div>
                  <p>{comment.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          className="comment-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="暱稱（可留空，預設匿名）"
          maxLength={24}
          aria-label="暱稱"
        />
        {/* Honeypot field: hidden from users, bots tend to fill it. */}
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="comment-honeypot"
        />
        <div className="comment-form-row">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="匿名留言，理性討論…"
            maxLength={1000}
            rows={2}
            aria-label="留言內容"
          />
          <button className="btn btn-dark comment-submit" type="submit" disabled={submitting || !text.trim()}>
            <Send size={15} />
            {submitting ? '送出中' : '送出'}
          </button>
        </div>
        {error && <p className="comment-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}
