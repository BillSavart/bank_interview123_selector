import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

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
// Admin moderation log for comments (append-only): hide / show / delete actions,
// replayed on startup. Keeps moderation out of the main append-only comment log.
const commentModFile = process.env.COMMENT_MOD_FILE || '/data/comment-mods.jsonl';
const maxCommentLength = Number(process.env.MAX_COMMENT_LENGTH || 1000);
const maxNameLength = Number(process.env.MAX_COMMENT_NAME_LENGTH || 24);
const maxCommentsPerQuestion = Number(process.env.MAX_COMMENTS_PER_QUESTION || 500);
// Minimal, deliberately loose anti-spam: repeated comments are allowed.
const commentMinIntervalMs = Number(process.env.COMMENT_MIN_INTERVAL_MS || 5000);
const commentWindowMs = Number(process.env.COMMENT_WINDOW_MS || 600000); // 10 min
const commentMaxPerWindow = Number(process.env.COMMENT_MAX_PER_WINDOW || 30);
// Comments at or below this net score are auto-hidden (users can still reveal them).
const commentHideScore = Number(process.env.COMMENT_HIDE_SCORE || -100);

// --- Mini-game leaderboard config ------------------------------------------
// We deliberately keep ONLY the top-N entries on disk: the store is rewritten on
// every change (tmp + rename) and truncated to N, so a score that drops out of
// the top N is discarded rather than logged forever. Disk use is bounded at N
// rows regardless of how many games are played.
//
// Each mini-game gets its own independent leaderboard (its own file). Reached at
// `/api/<game>/leaderboard` (GET) and `/api/<game>/score` (POST).
const checkGameFile = process.env.CHECKGAME_FILE || '/data/checkgame-top.json';
const checkGameTopN = Number(process.env.CHECKGAME_TOP_N || 10);
const checkGameMaxScore = Number(process.env.CHECKGAME_MAX_SCORE || 100000);

const numberGameFile = process.env.NUMBERGAME_FILE || '/data/numbergame-top.json';
const numberGameTopN = Number(process.env.NUMBERGAME_TOP_N || 10);
const numberGameMaxScore = Number(process.env.NUMBERGAME_MAX_SCORE || 100000);

// --- 招考行事曆 (calendar) config ------------------------------------------
// Events are managed through the admin API and stored as a single JSON file in
// the persisted data volume, so editing the calendar never requires a redeploy.
const calendarFile = process.env.CALENDAR_FILE || '/data/calendar.json';
const maxCalendarEvents = Number(process.env.MAX_CALENDAR_EVENTS || 500);
// Shared secret for the admin API. If unset, all admin writes are rejected
// (the calendar stays read-only) — set ADMIN_TOKEN in the VM's .env to enable.
const adminToken = process.env.ADMIN_TOKEN || '';

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
        questionId,
        name: String(entry.name || '匿名'),
        text: String(entry.text || ''),
        createdAt: String(entry.createdAt),
        votes: {},
        adminHidden: false,
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

// --- Comment moderation (admin) --------------------------------------------
let modAppendQueue = Promise.resolve();

const removeComment = (comment) => {
  const list = commentsByQuestion.get(comment.questionId);
  if (list) {
    const i = list.indexOf(comment);
    if (i >= 0) list.splice(i, 1);
  }
  commentById.delete(comment.id);
};

// Apply one moderation action to in-memory state.
const applyCommentMod = (commentId, action) => {
  const comment = commentById.get(String(commentId));
  if (!comment) return false;
  if (action === 'delete') removeComment(comment);
  else if (action === 'hide') comment.adminHidden = true;
  else if (action === 'show') comment.adminHidden = false;
  else return false;
  return true;
};

// Replay the moderation log onto loaded comments (run after loadComments/loadVotes).
const loadCommentMods = async () => {
  let raw = '';
  try {
    raw = await readFile(commentModFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${commentModFile}; starting with no moderation.`, error);
    }
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      applyCommentMod(entry.commentId, entry.action);
    } catch {
      // Skip malformed lines.
    }
  }
};

const appendCommentMod = (entry) => {
  modAppendQueue = modAppendQueue.then(async () => {
    await mkdir(dirname(commentModFile), { recursive: true });
    await appendFile(commentModFile, `${JSON.stringify(entry)}\n`);
  });
  return modAppendQueue;
};

// Compact a JSONL file in place, dropping lines whose parsed `key` equals id.
// Used to PHYSICALLY remove a deleted comment (and its votes) so the content
// truly leaves disk and reclaims space — not just a tombstone.
const compactJsonl = (file, queueRef, key, id) =>
  queueRef.then(async () => {
    let raw = '';
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      return; // nothing on disk yet
    }
    const kept = raw.split('\n').filter((line) => {
      const t = line.trim();
      if (!t) return false;
      try {
        return String(JSON.parse(t)[key]) !== String(id);
      } catch {
        return true; // keep unparseable lines untouched
      }
    });
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, kept.length ? `${kept.join('\n')}\n` : '');
    await rename(tmp, file);
  });

const removeCommentFromLog = (commentId) => {
  commentAppendQueue = compactJsonl(commentsFile, commentAppendQueue, 'id', commentId);
  return commentAppendQueue;
};

const removeVotesFromLog = (commentId) => {
  voteAppendQueue = compactJsonl(commentVotesFile, voteAppendQueue, 'commentId', commentId);
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
    hidden: score <= commentHideScore || !!comment.adminHidden,
  };
};

// Admin view of a comment — same as public plus its questionId and moderation flags.
const adminComment = (comment) => ({
  ...publicComment(comment),
  questionId: comment.questionId,
  adminHidden: !!comment.adminHidden,
});

// --- Mini-game leaderboard store -------------------------------------------
// In-memory top-N list, highest score first, at most one row per name. Backed by
// a small JSON file that we rewrite (not append to) on every change, so disk use
// stays bounded at N rows. Entries that fall out of the top N are dropped.
//
// Each mini-game gets its own isolated instance via makeLeaderboard(); they share
// no state, so scores never bleed between games.

// Highest score first; earlier submission wins ties (keeps the original holder).
const sortLeaderboard = (rows) =>
  rows.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));

const makeLeaderboard = ({ file, topN, maxScore }) => {
  let top = []; // [{ name, score, createdAt }], sorted desc, length <= topN
  let writeQueue = Promise.resolve();

  const load = async () => {
    top = [];
    let raw = '';
    try {
      raw = await readFile(file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`Could not read ${file}; starting with an empty leaderboard.`, error);
      }
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed?.leaderboard;
      if (!Array.isArray(rows)) return;
      const clean = [];
      for (const entry of rows) {
        const name = String(entry?.name || '').trim();
        const score = Number(entry?.score);
        if (!name || !Number.isInteger(score)) continue;
        clean.push({ name, score, createdAt: String(entry?.createdAt || '') });
      }
      top = sortLeaderboard(clean).slice(0, topN);
    } catch (error) {
      console.warn(`Could not parse ${file}; starting with an empty leaderboard.`, error);
    }
  };

  const persist = () => {
    writeQueue = writeQueue.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmpFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(tmpFile, `${JSON.stringify(top, null, 2)}\n`);
      await rename(tmpFile, file);
    });
    return writeQueue;
  };

  // Insert a score, keep one (best) row per name, truncate to top N. Returns the
  // 1-based rank if the entry made the board, otherwise null.
  const record = (name, score, createdAt) => {
    const existing = top.find((e) => e.name === name);
    if (existing) {
      if (score <= existing.score) {
        // Not a personal best; nothing changes, report their current standing.
        return top.findIndex((e) => e.name === name) + 1;
      }
      existing.score = score;
      existing.createdAt = createdAt;
    } else {
      top.push({ name, score, createdAt });
    }

    sortLeaderboard(top);
    top = top.slice(0, topN);

    const idx = top.findIndex((e) => e.name === name && e.score === score);
    return idx >= 0 ? idx + 1 : null;
  };

  return { load, persist, record, leaderboard: () => top, maxScore };
};

// One leaderboard per mini-game, keyed by the URL slug used in /api/<game>/*.
const leaderboards = {
  checkgame: makeLeaderboard({ file: checkGameFile, topN: checkGameTopN, maxScore: checkGameMaxScore }),
  numbergame: makeLeaderboard({ file: numberGameFile, topN: numberGameTopN, maxScore: numberGameMaxScore }),
};

// --- 招考行事曆 (calendar) store -------------------------------------------
// In-memory array of events, rewritten to disk (tmp + rename) on every change.
// Fields follow the admin form: org（機關/名稱）, signupStart / signupEnd（報名起訖）,
// writtenExam（筆試）, writtenResult（筆試結果公佈）, interview（面試/一面）,
// interview2（二面）, finalResult（放榜）, link（簡章連結）, note（備註）.
let calendarEvents = [];
let calendarWriteQueue = Promise.resolve();

const calendarFields = [
  'org',
  'signupStart',
  'signupEnd',
  'writtenExam',
  'answerKey',
  'writtenResult',
  'interview',
  'interview2',
  'finalResult',
  'link',
  'note',
];
// The date fields, used for sorting and window pruning. May carry a trailing
// " HH:MM" time; lexical comparison still works because the date prefix is fixed.
const calendarDateFields = [
  'signupStart',
  'signupEnd',
  'writtenExam',
  'answerKey',
  'writtenResult',
  'interview',
  'interview2',
  'finalResult',
];
const maxCalendarFieldLength = 300;

// Date-only prefix (drops any " HH:MM"), for comparisons.
const dateOnly = (s) => (s || '').slice(0, 10);

// Earliest relevant date of an event ('9999' when undated → sinks to the bottom).
const earliestDate = (e) =>
  calendarDateFields.map((f) => dateOnly(e[f])).filter(Boolean).sort()[0] || '9999';

// Sort by the earliest relevant date.
const sortCalendar = (rows) => rows.sort((a, b) => earliestDate(a).localeCompare(earliestDate(b)));

const cleanCalendarInput = (raw) => {
  const event = {};
  for (const key of calendarFields) {
    event[key] = sanitizeText(raw?.[key] ?? '', maxCalendarFieldLength);
  }
  return event;
};

// Visible window: 上個月 ~ 下下下個月 (current month −1 ~ +3). Events whose dates
// fall entirely outside this window are discarded to keep the data file small.
// Dates are 'YYYY-MM-DD' strings, which compare correctly lexically.
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const calendarWindow = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 0); // last day of +3 month
  return { start: ymd(start), end: ymd(end) };
};

const eventInWindow = (e) => {
  const dates = calendarDateFields.map((f) => dateOnly(e[f])).filter(Boolean);
  if (!dates.length) return true; // keep dateless drafts (can't be placed yet)
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  const { start, end } = calendarWindow();
  return min <= end && max >= start;
};

// Drop out-of-window events from memory. Returns how many were removed.
const pruneCalendar = () => {
  const before = calendarEvents.length;
  calendarEvents = calendarEvents.filter(eventInWindow);
  return before - calendarEvents.length;
};

const loadCalendar = async () => {
  calendarEvents = [];
  let raw = '';
  try {
    raw = await readFile(calendarFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${calendarFile}; starting with an empty calendar.`, error);
    }
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.events;
    if (!Array.isArray(rows)) return;
    calendarEvents = sortCalendar(
      rows
        .filter((e) => e && typeof e === 'object' && e.id)
        .map((e) => ({ id: String(e.id), ...cleanCalendarInput(e), createdAt: String(e.createdAt || ''), updatedAt: String(e.updatedAt || '') })),
    );
    // Rewrite the file if startup pruning dropped anything (reclaims disk).
    if (pruneCalendar() > 0) await persistCalendar();
  } catch (error) {
    console.warn(`Could not parse ${calendarFile}; starting with an empty calendar.`, error);
  }
};

const persistCalendar = () => {
  calendarWriteQueue = calendarWriteQueue.then(async () => {
    await mkdir(dirname(calendarFile), { recursive: true });
    const tmpFile = `${calendarFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpFile, `${JSON.stringify(calendarEvents, null, 2)}\n`);
    await rename(tmpFile, calendarFile);
  });
  return calendarWriteQueue;
};

// Constant-time check of the admin bearer token. Returns false when ADMIN_TOKEN
// is unset, so the admin API is disabled-by-default rather than open.
const isAdmin = (req) => {
  if (!adminToken) return false;
  const header = req.headers['authorization'] || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
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

// Short edge-cache TTLs for PUBLIC reads only. `max-age=0` keeps browsers
// revalidating (so a user's own writes, which update from POST responses, never
// look stale), while `s-maxage` lets Cloudflare's shared cache absorb repeat
// reads for a few seconds — that's what keeps the e2-micro origin idle under
// load. Everything else (POST results, admin reads, health) keeps the default
// no-store so writes are always immediate.
// NOTE: Cloudflare treats /api/* as dynamic by default — add a Cache Rule for
// "/api/*" (method GET) set to "Eligible for cache / respect origin TTL" for
// these headers to take effect at the edge. Browser revalidation works regardless.
const cacheRead = 'public, max-age=0, s-maxage=10';

const sendJson = (res, status, payload, cacheControl = 'no-store') => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
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
await loadCommentMods();
await Promise.all(Object.values(leaderboards).map((lb) => lb.load()));
await loadCalendar();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/ratings') {
      sendJson(res, 200, { ratings: summarizeAll() }, cacheRead);
      return;
    }

    // --- 招考行事曆 -------------------------------------------------------
    // Public read.
    if (req.method === 'GET' && url.pathname === '/api/calendar') {
      // Filter by the current window in case it shifted since the last write.
      sendJson(res, 200, { events: calendarEvents.filter(eventInWindow) }, cacheRead);
      return;
    }

    // Admin: verify the token (lets the admin UI confirm login before editing).
    if (req.method === 'GET' && url.pathname === '/api/admin/calendar') {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      sendJson(res, 200, { events: calendarEvents });
      return;
    }

    // Admin: create an event.
    if (req.method === 'POST' && url.pathname === '/api/admin/calendar') {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (calendarEvents.length >= maxCalendarEvents) {
        sendJson(res, 400, { error: '行事曆事件數量已達上限' });
        return;
      }
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }
      const fields = cleanCalendarInput(body);
      if (!fields.org) {
        sendJson(res, 400, { error: '機關/名稱不可為空' });
        return;
      }
      const now = new Date().toISOString();
      const event = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
      calendarEvents.push(event);
      sortCalendar(calendarEvents);
      pruneCalendar(); // drop any events that have since aged out of the window
      await persistCalendar();
      sendJson(res, 200, { event, events: calendarEvents });
      return;
    }

    // Admin: update or delete a single event by id.
    const adminEventMatch = url.pathname.match(/^\/api\/admin\/calendar\/([a-f0-9-]{36})$/);
    if (adminEventMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const id = adminEventMatch[1];
      const idx = calendarEvents.findIndex((e) => e.id === id);
      if (idx === -1) {
        sendJson(res, 404, { error: 'event not found' });
        return;
      }

      if (req.method === 'DELETE') {
        calendarEvents.splice(idx, 1);
        await persistCalendar();
        sendJson(res, 200, { events: calendarEvents });
        return;
      }

      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }
      const fields = cleanCalendarInput(body);
      if (!fields.org) {
        sendJson(res, 400, { error: '機關/名稱不可為空' });
        return;
      }
      calendarEvents[idx] = { ...calendarEvents[idx], ...fields, updatedAt: new Date().toISOString() };
      sortCalendar(calendarEvents);
      pruneCalendar(); // drop any events that have since aged out of the window
      await persistCalendar();
      sendJson(res, 200, { event: calendarEvents.find((e) => e.id === id), events: calendarEvents });
      return;
    }

    // --- 留言板管理 (admin) ----------------------------------------------
    // List every comment across all questions for moderation.
    if (req.method === 'GET' && url.pathname === '/api/admin/comments') {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const all = [];
      for (const comment of commentById.values()) all.push(adminComment(comment));
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
      sendJson(res, 200, { comments: all });
      return;
    }

    // Hide / show / delete a single comment.
    const adminCommentMatch = url.pathname.match(/^\/api\/admin\/comments\/([a-f0-9-]{36})\/moderate$/);
    if (req.method === 'POST' && adminCommentMatch) {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }
      const action = body.action;
      if (!['hide', 'show', 'delete'].includes(action)) {
        sendJson(res, 400, { error: 'action must be hide, show or delete' });
        return;
      }
      const id = adminCommentMatch[1];
      const target = commentById.get(id);
      if (!target) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }
      if (action === 'delete') {
        // True permanent delete: remove from memory AND compact it out of the
        // on-disk logs so the content no longer occupies space.
        removeComment(target);
        await removeCommentFromLog(id);
        await removeVotesFromLog(id);
      } else {
        // hide / show are flags → record in the append-only moderation log.
        applyCommentMod(id, action);
        await appendCommentMod({ commentId: id, action, at: new Date().toISOString() });
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const leaderboardMatch = url.pathname.match(/^\/api\/([a-z]+)\/leaderboard$/);
    if (req.method === 'GET' && leaderboardMatch && leaderboards[leaderboardMatch[1]]) {
      sendJson(res, 200, { leaderboard: leaderboards[leaderboardMatch[1]].leaderboard() }, cacheRead);
      return;
    }

    const scoreMatch = url.pathname.match(/^\/api\/([a-z]+)\/score$/);
    if (req.method === 'POST' && scoreMatch && leaderboards[scoreMatch[1]]) {
      const board = leaderboards[scoreMatch[1]];
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }

      // Honeypot: real players always send `website` empty.
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        sendJson(res, 200, { leaderboard: board.leaderboard(), rank: null });
        return;
      }

      const name = sanitizeText(body.name ?? '', maxNameLength);
      const score = Number(body.score);

      if (!name) {
        sendJson(res, 400, { error: '暱稱不可為空' });
        return;
      }
      if (!Number.isInteger(score) || score < 0 || score > board.maxScore) {
        sendJson(res, 400, { error: 'score is invalid' });
        return;
      }

      const rate = checkRateLimit(getClientIp(req));
      if (!rate.ok) {
        sendJson(res, 429, { error: rate.reason });
        return;
      }

      const createdAt = new Date().toISOString();
      const rank = board.record(name, score, createdAt);
      await board.persist();

      sendJson(res, 200, { leaderboard: board.leaderboard(), rank });
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
      sendJson(res, 200, { comments: list.map(publicComment) }, cacheRead);
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

      const comment = {
        id: randomUUID(),
        questionId: commentQuestionId,
        name,
        text,
        createdAt: new Date().toISOString(),
        votes: {},
        adminHidden: false,
      };
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
