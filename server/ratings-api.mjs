import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.RATINGS_FILE || '/data/ratings.json';
const maxQuestionId = Number(process.env.MAX_QUESTION_ID || 123);

// --- Comments config -------------------------------------------------------
// Comments use an append-only JSONL log (one line per comment) instead of the
// rewrite-the-whole-file model the ratings store uses. Appending is O(1) per
// write regardless of how large the log grows, which keeps writes cheap on a
// tiny VM even as comments accumulate.
const commentsFile = process.env.COMMENTS_FILE || '/data/comments.jsonl';
// Upvote/downvote log for comments (append-only; last write per voter wins).
const commentVotesFile = process.env.COMMENT_VOTES_FILE || '/data/comment-votes.jsonl';
const maxCommentLength = Number(process.env.MAX_COMMENT_LENGTH || 1000);
const maxNameLength = Number(process.env.MAX_COMMENT_NAME_LENGTH || 24);
const maxCommentsPerQuestion = Number(process.env.MAX_COMMENTS_PER_QUESTION || 500);
// Minimal, deliberately loose anti-spam: repeated comments are allowed.
const commentMinIntervalMs = Number(process.env.COMMENT_MIN_INTERVAL_MS || 5000);
const commentWindowMs = Number(process.env.COMMENT_WINDOW_MS || 600000); // 10 min
const commentMaxPerWindow = Number(process.env.COMMENT_MAX_PER_WINDOW || 30);
// Comments at or below this net score are auto-hidden (users can still reveal them).
const commentHideScore = Number(process.env.COMMENT_HIDE_SCORE || -100);

const emptyStore = () => ({
  version: 1,
  updatedAt: null,
  questions: {},
});

let store = emptyStore();
let writeQueue = Promise.resolve();

const normalizeStore = (raw) => {
  const next = emptyStore();
  if (!raw || typeof raw !== 'object' || !raw.questions || typeof raw.questions !== 'object') return next;

  for (const [questionId, question] of Object.entries(raw.questions)) {
    const votes = question?.votes && typeof question.votes === 'object' ? question.votes : {};
    next.questions[questionId] = { votes: {} };
    for (const [voterId, score] of Object.entries(votes)) {
      if (typeof voterId === 'string' && Number.isInteger(score) && score >= 1 && score <= 5) {
        next.questions[questionId].votes[voterId] = score;
      }
    }
  }

  next.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  return next;
};

const loadStore = async () => {
  try {
    const raw = await readFile(dataFile, 'utf8');
    store = normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${dataFile}; starting with an empty ratings store.`, error);
    }
    store = emptyStore();
  }
};

const persistStore = () => {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    const tmpFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpFile, `${JSON.stringify(store, null, 2)}\n`);
    await rename(tmpFile, dataFile);
  });

  return writeQueue;
};

// --- Comments store --------------------------------------------------------
// In-memory index: questionId -> array of comments (oldest first). Backed by an
// append-only JSONL file that we replay on startup. Each comment also carries a
// `votes` map (voterId -> 1 | -1); commentById gives O(1) lookup for voting.
const commentsByQuestion = new Map();
const commentById = new Map();
let commentAppendQueue = Promise.resolve();
let voteAppendQueue = Promise.resolve();

const loadComments = async () => {
  commentsByQuestion.clear();
  commentById.clear();
  let raw = '';
  try {
    raw = await readFile(commentsFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${commentsFile}; starting with no comments.`, error);
    }
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const questionId = Number(entry.questionId);
      if (!Number.isInteger(questionId)) continue;
      const list = commentsByQuestion.get(questionId) || [];
      const comment = {
        id: String(entry.id),
        name: String(entry.name || '匿名'),
        text: String(entry.text || ''),
        createdAt: String(entry.createdAt),
        votes: {},
      };
      list.push(comment);
      commentById.set(comment.id, comment);
      commentsByQuestion.set(questionId, list);
    } catch {
      // Skip malformed lines rather than failing the whole load.
    }
  }
};

// Replay the vote log onto the loaded comments (last write per voter wins).
const loadVotes = async () => {
  let raw = '';
  try {
    raw = await readFile(commentVotesFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${commentVotesFile}; starting with no votes.`, error);
    }
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const comment = commentById.get(String(entry.commentId));
      if (!comment) continue;
      const value = Number(entry.value);
      if (value === 0) delete comment.votes[entry.voterId];
      else if (value === 1 || value === -1) comment.votes[entry.voterId] = value;
    } catch {
      // Skip malformed lines.
    }
  }
};

const appendComment = (entry) => {
  commentAppendQueue = commentAppendQueue.then(async () => {
    await mkdir(dirname(commentsFile), { recursive: true });
    await appendFile(commentsFile, `${JSON.stringify(entry)}\n`);
  });
  return commentAppendQueue;
};

const appendVote = (entry) => {
  voteAppendQueue = voteAppendQueue.then(async () => {
    await mkdir(dirname(commentVotesFile), { recursive: true });
    await appendFile(commentVotesFile, `${JSON.stringify(entry)}\n`);
  });
  return voteAppendQueue;
};

// up/down counts and net score from a votes map.
const tallyVotes = (votes) => {
  let up = 0;
  let down = 0;
  for (const v of Object.values(votes || {})) {
    if (v === 1) up += 1;
    else if (v === -1) down += 1;
  }
  return { up, down, score: up - down };
};

// Shape returned to clients (no raw voter map).
const publicComment = (comment) => {
  const { up, down, score } = tallyVotes(comment.votes);
  return {
    id: comment.id,
    name: comment.name,
    text: comment.text,
    createdAt: comment.createdAt,
    up,
    down,
    score,
    hidden: score <= commentHideScore,
  };
};

// Per-IP rate limiting, in memory only (resets on restart — fine for this use).
const rateLog = new Map();

const checkRateLimit = (ip) => {
  const now = Date.now();
  const history = (rateLog.get(ip) || []).filter((ts) => now - ts < commentWindowMs);

  if (history.length && now - history[history.length - 1] < commentMinIntervalMs) {
    return { ok: false, reason: '留言太頻繁，請稍候幾秒再試。' };
  }
  if (history.length >= commentMaxPerWindow) {
    return { ok: false, reason: '短時間內留言次數過多，請稍後再試。' };
  }

  history.push(now);
  rateLog.set(ip, history);
  return { ok: true };
};

// Occasionally drop stale rate-limit entries so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, history] of rateLog) {
    const fresh = history.filter((ts) => now - ts < commentWindowMs);
    if (fresh.length) rateLog.set(ip, fresh);
    else rateLog.delete(ip);
  }
}, commentWindowMs).unref();

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

// Strip control chars (keep newline + tab) and clamp length.
const sanitizeText = (value, maxLength) =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);

const summarizeQuestion = (questionId) => {
  const votes = Object.values(store.questions[String(questionId)]?.votes || {});
  const count = votes.length;
  const sum = votes.reduce((total, score) => total + score, 0);
  return {
    questionId: Number(questionId),
    count,
    average: count ? Number((sum / count).toFixed(2)) : null,
  };
};

const summarizeAll = () =>
  Object.keys(store.questions)
    .map(summarizeQuestion)
    .filter((summary) => summary.count > 0)
    .sort((a, b) => a.questionId - b.questionId);

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const parseQuestionId = (pathname) => {
  const match = pathname.match(/^\/api\/ratings\/(\d+)$/);
  if (!match) return null;

  const questionId = Number(match[1]);
  if (!Number.isInteger(questionId) || questionId < 1 || questionId > maxQuestionId) return null;
  return questionId;
};

const parseCommentQuestionId = (pathname) => {
  const match = pathname.match(/^\/api\/comments\/(\d+)$/);
  if (!match) return null;

  const questionId = Number(match[1]);
  if (!Number.isInteger(questionId) || questionId < 1 || questionId > maxQuestionId) return null;
  return questionId;
};

const parseCommentVote = (pathname) => {
  const match = pathname.match(/^\/api\/comments\/(\d+)\/([a-f0-9-]{36})\/vote$/);
  if (!match) return null;

  const questionId = Number(match[1]);
  if (!Number.isInteger(questionId) || questionId < 1 || questionId > maxQuestionId) return null;
  return { questionId, commentId: match[2] };
};

await loadStore();
await loadComments();
await loadVotes();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/ratings') {
      sendJson(res, 200, { ratings: summarizeAll() });
      return;
    }

    const questionId = parseQuestionId(url.pathname);
    if (req.method === 'POST' && questionId) {
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }

      const score = Number(body.score);
      const voterId = typeof body.voterId === 'string' ? body.voterId.trim() : '';

      if (!Number.isInteger(score) || score < 1 || score > 5) {
        sendJson(res, 400, { error: 'score must be an integer from 1 to 5' });
        return;
      }

      if (!/^[a-zA-Z0-9_-]{12,80}$/.test(voterId)) {
        sendJson(res, 400, { error: 'voterId is invalid' });
        return;
      }

      const key = String(questionId);
      store.questions[key] ||= { votes: {} };
      store.questions[key].votes[voterId] = score;
      store.updatedAt = new Date().toISOString();
      await persistStore();

      sendJson(res, 200, { rating: summarizeQuestion(questionId), myScore: score });
      return;
    }

    const commentQuestionId = parseCommentQuestionId(url.pathname);
    if (req.method === 'GET' && commentQuestionId) {
      const list = commentsByQuestion.get(commentQuestionId) || [];
      sendJson(res, 200, { comments: list.map(publicComment) });
      return;
    }

    if (req.method === 'POST' && commentQuestionId) {
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }

      // Honeypot: bots tend to fill every field. Real users never see it, so a
      // non-empty value means a bot. Pretend success without storing anything.
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        sendJson(res, 200, { ok: true });
        return;
      }

      const text = sanitizeText(body.text ?? '', maxCommentLength);
      if (!text) {
        sendJson(res, 400, { error: '留言內容不可為空' });
        return;
      }

      const rawName = sanitizeText(body.name ?? '', maxNameLength);
      const name = rawName || '匿名';

      const rate = checkRateLimit(getClientIp(req));
      if (!rate.ok) {
        sendJson(res, 429, { error: rate.reason });
        return;
      }

      const comment = { id: randomUUID(), name, text, createdAt: new Date().toISOString(), votes: {} };
      const list = commentsByQuestion.get(commentQuestionId) || [];
      list.push(comment);
      // Cap in-memory list so memory stays bounded; the full log stays on disk.
      if (list.length > maxCommentsPerQuestion) {
        const removed = list.splice(0, list.length - maxCommentsPerQuestion);
        for (const old of removed) commentById.delete(old.id);
      }
      commentsByQuestion.set(commentQuestionId, list);
      commentById.set(comment.id, comment);
      await appendComment({ questionId: commentQuestionId, id: comment.id, name, text, createdAt: comment.createdAt });

      sendJson(res, 200, { comment: publicComment(comment) });
      return;
    }

    const voteTarget = parseCommentVote(url.pathname);
    if (req.method === 'POST' && voteTarget) {
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }

      const voterId = typeof body.voterId === 'string' ? body.voterId.trim() : '';
      const value = Number(body.value);

      if (!/^[a-zA-Z0-9_-]{12,80}$/.test(voterId)) {
        sendJson(res, 400, { error: 'voterId is invalid' });
        return;
      }
      if (![1, 0, -1].includes(value)) {
        sendJson(res, 400, { error: 'value must be 1, 0, or -1' });
        return;
      }

      const comment = commentById.get(voteTarget.commentId);
      if (!comment) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }

      if (value === 0) delete comment.votes[voterId];
      else comment.votes[voterId] = value;
      await appendVote({ commentId: comment.id, voterId, value });

      sendJson(res, 200, { comment: publicComment(comment) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const status = error?.status || 500;
    sendJson(res, status, { error: status === 500 ? 'internal server error' : error.message });
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`ratings-api listening on :${port}, data file ${dataFile}`);
});
