import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, QrCode, Share2, UserRound } from 'lucide-react';
import { AdSlot, AD_ENABLED } from '../AdSlot';
import { CommentBoard } from '../components/CommentBoard';
import { VoteButtons } from './ExperiencePage';
import {
  fetchPost,
  formatPostTime,
  loadMyPostVotes,
  postShortUrl,
  votePost,
  POST_CATEGORIES,
  type ExperiencePost,
  type PostVote,
} from '../lib/posts';

// 內文依空行切成段落，方便在段落之間安插廣告版位。
const splitParagraphs = (content: string) =>
  content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export function ExperiencePostPage() {
  const { id = '' } = useParams();
  const [post, setPost] = useState<ExperiencePost | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [myVote, setMyVote] = useState<PostVote | undefined>(undefined);

  useEffect(() => {
    setState('loading');
    setMyVote(loadMyPostVotes()[id]);
    fetchPost(id)
      .then((p) => {
        setPost(p);
        setState('ready');
        document.title = `${p.title} | 經驗分享 | 公股銀行新手村`;
      })
      .catch(() => setState('notfound'));
  }, [id]);

  const handleVote = (target: ExperiencePost, dir: PostVote) => {
    const next: PostVote | 0 = myVote === dir ? 0 : dir;
    votePost(target.id, next).then((updated) => {
      if (!updated) return;
      setPost((prev) => (prev ? { ...prev, up: updated.up, down: updated.down, score: updated.score } : prev));
      setMyVote(loadMyPostVotes()[target.id]);
    });
  };

  const catLabel = post ? POST_CATEGORIES.find((c) => c.value === post.category)?.label || '' : '';
  const paragraphs = useMemo(() => (post ? splitParagraphs(post.content) : []), [post]);
  // 把廣告插在內文中段（段落數一半處），單段文章則放在內文後。
  const adAfter = paragraphs.length > 1 ? Math.ceil(paragraphs.length / 2) : paragraphs.length;

  return (
    <div className="container py-4 experience-post-page">
      <Link to="/experience" className="exp-back">
        <ArrowLeft size={16} />
        返回經驗分享
      </Link>

      {state === 'loading' && <p className="exp-empty">載入中…</p>}
      {state === 'notfound' && <p className="exp-empty">找不到這篇文章，可能已被移除。</p>}

      {state === 'ready' && post && (
        <article className="exp-article">
          <div className="exp-article-kicker">{catLabel}</div>
          <h1 className="exp-article-title">{post.title}</h1>
          <div className="exp-article-meta">
            {post.author && (
              <span className="exp-author">
                <UserRound size={15} />
                {post.author}
              </span>
            )}
            <span>{formatPostTime(post.createdAt)}</span>
          </div>

          <SharePanel post={post} />

          <div className="exp-article-body">
            {paragraphs.map((para, i) => (
              <div key={i}>
                <p>{para}</p>
                {i + 1 === adAfter && AD_ENABLED && (
                  <div className="exp-article-ad">
                    <AdSlot slot="article-mid" label="贊助" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="exp-article-vote">
            <span className="exp-article-vote-label">這篇文章對你有幫助嗎？</span>
            <VoteButtons post={post} my={myVote} onVote={handleVote} />
          </div>

          <CommentBoard source={{ kind: 'post', postId: post.id }} />
        </article>
      )}
    </div>
  );
}

function SharePanel({ post }: { post: ExperiencePost }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = postShortUrl(post);
  // QR Code 由 goQR.me 免費服務即時產生（資料只是公開的文章網址）。
  // 若想改成自架 / 換服務，只要改這個網址即可。
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(url)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard 不可用時，至少把面板打開讓使用者手動複製
      setOpen(true);
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, url });
        return;
      } catch {
        // 使用者取消分享 → 退回顯示面板
      }
    }
    setOpen((v) => !v);
  };

  return (
    <div className="exp-share">
      <div className="exp-share-actions">
        <button type="button" className="exp-share-btn" onClick={nativeShare}>
          <Share2 size={16} />
          分享
        </button>
        <button type="button" className="exp-share-btn" onClick={() => setOpen((v) => !v)}>
          <QrCode size={16} />
          短網址 / QR
        </button>
      </div>

      {open && (
        <div className="exp-share-panel">
          <div className="exp-share-url">
            <input className="exp-share-input" type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button type="button" className="exp-share-copy" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? '已複製' : '複製'}
            </button>
          </div>
          <img className="exp-share-qr" src={qrSrc} width={180} height={180} alt={`${post.title} 的 QR Code`} loading="lazy" />
          <span className="exp-share-hint">掃描 QR Code 或複製短網址分享這篇文章</span>
        </div>
      )}
    </div>
  );
}
