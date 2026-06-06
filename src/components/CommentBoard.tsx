import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { fetchComments, submitComment, type Comment } from '../lib/comments';

interface CommentBoardProps {
  questionId: number;
}

const nameStorageKey = 'bank-interview-comment-name';

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

// Anonymous, per-question comment board. Mounts only when a question's answer
// panel is expanded, so comments are fetched lazily on demand.
export function CommentBoard({ questionId }: CommentBoardProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [name, setName] = useState(() => localStorage.getItem(nameStorageKey) || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchComments(questionId)
      .then((next) => {
        if (isMounted) setComments(next);
      })
      .catch(() => {
        if (isMounted) setComments([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [questionId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    // Honeypot — if a bot filled this hidden field, drop silently.
    if (honeypotRef.current?.value) return;

    setSubmitting(true);
    setError(null);

    const trimmedName = name.trim();
    const result = await submitComment(questionId, trimmed, trimmedName);

    if (result.comment) {
      setComments((current) => [...current, result.comment as Comment]);
      setText('');
      if (trimmedName) localStorage.setItem(nameStorageKey, trimmedName);
    } else {
      setError(result.error ?? '留言失敗，請稍後再試。');
    }

    setSubmitting(false);
  };

  return (
    <section className="comment-board" aria-label={`第 ${questionId} 題留言板`}>
      <div className="comment-board-head">
        <MessageSquare size={16} />
        <span>留言板</span>
        <small>{comments.length} 則留言</small>
      </div>

      {loading ? (
        <p className="comment-empty">載入中…</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty">還沒有留言，留下第一則吧。</p>
      ) : (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="comment-item">
              <div className="comment-item-head">
                <strong>{comment.name}</strong>
                <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
              </div>
              <p>{comment.text}</p>
            </li>
          ))}
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
