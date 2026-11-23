import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { openDb, calendarColumns } from './db.mjs';
import {
  getOfficialDocQuestion,
  initOfficialDocStore,
  listOfficialDocQuestions,
} from './official-doc.mjs';
import { createSubmissionEmailNotifier } from './submission-email.mjs';
import { createTurnstileVerifier } from './turnstile.mjs';
import { createAdminSessions } from './admin-session.mjs';
import { createRateLimit } from './rate-limit.mjs';
import { createVoterSessions } from './voter-session.mjs';
import { createGameRounds } from './game-rounds.mjs';

const port = Number(process.env.PORT || 3000);
const bindHost = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const dataFile = process.env.RATINGS_FILE || '/data/ratings.json';

// --- SQLite backend toggle (Phase 2 of the JSON → SQLite migration) ---------
// When USE_SQLITE is set, the ratings / comments / posts stores persist to (and
// load from) the SQLite database opened here instead of their JSON / JSONL
// files. When unset (the default), every code path below is byte-for-byte the
// previous behaviour — the JSON files stay the source of truth and are the
// instant rollback. The in-memory model and all request handling are identical
// in both modes; only the load/persist layer branches on `useSqlite`.
//
// Calendar + leaderboards stay on JSON until Batch B; their tables exist in the
// DB (populated by the one-off migration) but are not wired up here yet.
const useSqlite = process.env.USE_SQLITE === '1' || process.env.USE_SQLITE === 'true';
const db = useSqlite ? openDb(process.env.DB_FILE || '/data/app.db') : null;
const officialDocDbFile =
  process.env.OFFICIAL_DOC_DB_FILE ||
  process.env.DB_FILE ||
  (process.env.NODE_ENV === 'production' ? '/data/app.db' : '.local-official-doc.db');
let officialDocDb = db;
let officialDocDbError = null;
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

// --- 文章留言板 config ------------------------------------------------------
// 經驗分享文章底下的留言板。刻意跟「面試篩選器題目」的留言完全分開存：自己的
// 三份 append-only log（留言 / 投票 / 後台隱藏刪除），後台也分開管理，兩邊不混。
const postCommentsFile = process.env.POST_COMMENTS_FILE || '/data/post-comments.jsonl';
const postCommentVotesFile = process.env.POST_COMMENT_VOTES_FILE || '/data/post-comment-votes.jsonl';
const postCommentModFile = process.env.POST_COMMENT_MOD_FILE || '/data/post-comment-mods.jsonl';

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

const numberGameFile = process.env.NUMBERGAME_FILE || '/data/numbergame-top.json';
const numberGameTopN = Number(process.env.NUMBERGAME_TOP_N || 10);

// --- 招考行事曆 (calendar) config ------------------------------------------
// Events are managed through the admin API and stored as a single JSON file in
// the persisted data volume, so editing the calendar never requires a redeploy.
const calendarFile = process.env.CALENDAR_FILE || '/data/calendar.json';
const maxCalendarEvents = Number(process.env.MAX_CALENDAR_EVENTS || 500);

// --- 經驗分享 (experience posts) config ------------------------------------
// Articles authored in the admin panel, split into 考試篇 (exam) / 工作篇 (work).
// Stored as a single JSON file in the persisted volume (same model as the
// calendar), so posting / hiding / deleting never needs a redeploy.
const postsFile = process.env.POSTS_FILE || '/data/posts.json';
// 文章的讚 / 倒讚走 append-only JSONL（與留言投票同一套做法），寫入 O(1)，
// 不會每次投票就重寫整份 posts.json。
const postVotesFile = process.env.POST_VOTES_FILE || '/data/post-votes.jsonl';
const maxPosts = Number(process.env.MAX_POSTS || 1000);
const maxPostTitleLength = Number(process.env.MAX_POST_TITLE_LENGTH || 120);
const maxPostAuthorLength = Number(process.env.MAX_POST_AUTHOR_LENGTH || 40);
const maxPostContentLength = Number(process.env.MAX_POST_CONTENT_LENGTH || 8000);
const postCategories = ['exam', 'work'];
// Canonical site origin, used for og:url / canonical / sitemap in the
// server-rendered article pages. Matches scripts/prerender.mjs's BASE.
const siteBase = (process.env.SITE_BASE || 'https://bank-interview-advisor.com').replace(/\/$/, '');
const production = process.env.NODE_ENV === 'production';
const adminOrigin = process.env.ADMIN_BASE_URL || '';
if (production && (!adminOrigin || new URL(adminOrigin).protocol !== 'https:')) {
  throw new Error('Production requires an HTTPS ADMIN_BASE_URL');
}
const adminSessions = createAdminSessions({ token: process.env.ADMIN_TOKEN || '', origin: adminOrigin });
const allowAdminLogin = createRateLimit({ windowMs: 60_000, limit: 8 });
const allowGlobalAdminLogin = createRateLimit({ windowMs: 60_000, limit: 60 });
const trustProxy = process.env.TRUST_PROXY === '1';
const voterSessions = createVoterSessions({
  secret: process.env.VOTER_SIGNING_KEY || process.env.ADMIN_TOKEN || randomBytes(32),
  secure: production,
});
const allowPublicWrite = createRateLimit({ windowMs: 60_000, limit: 60 });
const allowGlobalWrite = createRateLimit({ windowMs: 1000, limit: 20 });
const allowVoterEnrollment = createRateLimit({ windowMs: 60_000, limit: 12 });
const allowGameStart = createRateLimit({ windowMs: 60_000, limit: 10 });
const gameRounds = createGameRounds();
const maxVotesPerTarget = 10_000;
const submissionEmailNotifier = createSubmissionEmailNotifier();
if (submissionEmailNotifier.partiallyConfigured) {
  console.warn(`[submission-email] disabled; missing ${submissionEmailNotifier.missing.join(', ')}`);
}
const turnstileVerifier = createTurnstileVerifier({ required: production });
if (turnstileVerifier.partiallyConfigured) {
  console.warn(`[turnstile] misconfigured; missing ${turnstileVerifier.missing.join(', ')}`);
}

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
  if (useSqlite) {
    store = emptyStore();
    for (const row of db.prepare('SELECT question_id, voter_id, score FROM ratings').all()) {
      const key = String(row.question_id);
      (store.questions[key] ||= { votes: {} }).votes[row.voter_id] = row.score;
    }
    return;
  }
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

// Record one rating into the in-memory store and persist it. In SQLite mode this
// is a single-row upsert (cheap regardless of how many ratings exist); in JSON
// mode it rewrites the whole ratings file, exactly as before.
const setRating = (questionId, voterId, score) => {
  const key = String(questionId);
  store.questions[key] ||= { votes: {} };
  store.questions[key].votes[voterId] = score;
  store.updatedAt = new Date().toISOString();
  if (useSqlite) {
    db.prepare('INSERT OR REPLACE INTO ratings (question_id, voter_id, score) VALUES (?, ?, ?)').run(questionId, voterId, score);
    return Promise.resolve();
  }
  return persistStore();
};

// --- Comments store --------------------------------------------------------
// Two independent comment boards share this one implementation but never share
// data: 面試篩選器題目 (keyed by integer questionId) and 經驗分享文章 (keyed by
// string postId). makeCommentStore() builds one isolated store — its own files,
// in-memory index and append queues — so the two boards stay cleanly separated
// on disk and in the admin panel.

// up/down counts and net score from a votes map. Shared with the posts store.
const tallyVotes = (votes) => {
  let up = 0;
  let down = 0;
  for (const v of Object.values(votes || {})) {
    if (v === 1) up += 1;
    else if (v === -1) down += 1;
  }
  return { up, down, score: up - down };
};

// Compact a JSONL file in place, dropping lines whose parsed `key` equals id.
// Used to PHYSICALLY remove a deleted comment (and its votes) so the content
// truly leaves disk and reclaims space — not just a tombstone. Shared with the
// posts vote log.
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

// Build one isolated comment board. `keyField` is the JSON property that holds
// the thread key on disk ('questionId' or 'postId'); `normalizeKey` turns a raw
// key (a URL segment or a value read back from disk) into its canonical form, or
// returns null to reject it.
const makeCommentStore = ({ board, commentsFile, votesFile, modFile, keyField, normalizeKey }) => {
  // In-memory index: threadKey -> array of comments (oldest first). Each comment
  // also carries a `votes` map (voterId -> 1 | -1); byId gives O(1) vote lookup.
  const byThread = new Map();
  const byId = new Map();
  let commentQueue = Promise.resolve();
  let voteQueue = Promise.resolve();
  let modQueue = Promise.resolve();

  const load = async () => {
    byThread.clear();
    byId.clear();
    if (useSqlite) {
      // rowid order = insertion order, matching the JSONL append order.
      const rows = db
        .prepare('SELECT id, thread, name, text, created_at, admin_hidden FROM comments WHERE board = ? ORDER BY rowid')
        .all(board);
      for (const row of rows) {
        const thread = normalizeKey(row.thread);
        if (thread === null) continue;
        const comment = {
          id: String(row.id),
          thread,
          name: String(row.name || '匿名'),
          text: String(row.text || ''),
          createdAt: String(row.created_at),
          votes: {},
          adminHidden: !!row.admin_hidden,
        };
        const list = byThread.get(thread) || [];
        list.push(comment);
        byId.set(comment.id, comment);
        byThread.set(thread, list);
      }
      return;
    }
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
        const thread = normalizeKey(entry[keyField]);
        if (thread === null) continue;
        const list = byThread.get(thread) || [];
        const comment = {
          id: String(entry.id),
          thread,
          name: String(entry.name || '匿名'),
          text: String(entry.text || ''),
          createdAt: String(entry.createdAt),
          votes: {},
          adminHidden: false,
        };
        list.push(comment);
        byId.set(comment.id, comment);
        byThread.set(thread, list);
      } catch {
        // Skip malformed lines rather than failing the whole load.
      }
    }
  };

  // Replay the vote log onto the loaded comments (last write per voter wins).
  const loadVotes = async () => {
    if (useSqlite) {
      const rows = db
        .prepare(
          'SELECT cv.comment_id, cv.voter_id, cv.value FROM comment_votes cv JOIN comments c ON c.id = cv.comment_id WHERE c.board = ?',
        )
        .all(board);
      for (const row of rows) {
        const comment = byId.get(String(row.comment_id));
        if (comment) comment.votes[row.voter_id] = row.value;
      }
      return;
    }
    let raw = '';
    try {
      raw = await readFile(votesFile, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`Could not read ${votesFile}; starting with no votes.`, error);
      }
      return;
    }

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        const comment = byId.get(String(entry.commentId));
        if (!comment) continue;
        const value = Number(entry.value);
        if (value === 0) delete comment.votes[entry.voterId];
        else if (value === 1 || value === -1) comment.votes[entry.voterId] = value;
      } catch {
        // Skip malformed lines.
      }
    }
  };

  const append = (entry) => {
    if (useSqlite) {
      db.prepare(
        'INSERT INTO comments (id, board, thread, name, text, created_at, admin_hidden) VALUES (?, ?, ?, ?, ?, ?, 0)',
      ).run(String(entry.id), board, String(entry[keyField]), String(entry.name), String(entry.text), String(entry.createdAt));
      return Promise.resolve();
    }
    commentQueue = commentQueue.then(async () => {
      await mkdir(dirname(commentsFile), { recursive: true });
      await appendFile(commentsFile, `${JSON.stringify(entry)}\n`);
    });
    return commentQueue;
  };

  const appendVoteLog = (entry) => {
    if (useSqlite) {
      if (Number(entry.value) === 0) {
        db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND voter_id = ?').run(String(entry.commentId), String(entry.voterId));
      } else {
        db.prepare('INSERT OR REPLACE INTO comment_votes (comment_id, voter_id, value) VALUES (?, ?, ?)').run(String(entry.commentId), String(entry.voterId), Number(entry.value));
      }
      return Promise.resolve();
    }
    voteQueue = voteQueue.then(async () => {
      await mkdir(dirname(votesFile), { recursive: true });
      await appendFile(votesFile, `${JSON.stringify(entry)}\n`);
    });
    return voteQueue;
  };

  const removeComment = (comment) => {
    const list = byThread.get(comment.thread);
    if (list) {
      const i = list.indexOf(comment);
      if (i >= 0) list.splice(i, 1);
    }
    byId.delete(comment.id);
  };

  // Apply one moderation action to in-memory state.
  const applyMod = (commentId, action) => {
    const comment = byId.get(String(commentId));
    if (!comment) return false;
    if (action === 'delete') removeComment(comment);
    else if (action === 'hide') comment.adminHidden = true;
    else if (action === 'show') comment.adminHidden = false;
    else return false;
    return true;
  };

  // Replay the moderation log onto loaded comments (run after load/loadVotes).
  const loadMods = async () => {
    // In SQLite mode the moderation state lives in the comments.admin_hidden
    // column, already applied by load(); there is no separate log to replay.
    if (useSqlite) return;
    let raw = '';
    try {
      raw = await readFile(modFile, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`Could not read ${modFile}; starting with no moderation.`, error);
      }
      return;
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        applyMod(entry.commentId, entry.action);
      } catch {
        // Skip malformed lines.
      }
    }
  };

  const appendModLog = (entry) => {
    if (useSqlite) {
      if (entry.action === 'hide') db.prepare('UPDATE comments SET admin_hidden = 1 WHERE id = ?').run(String(entry.commentId));
      else if (entry.action === 'show') db.prepare('UPDATE comments SET admin_hidden = 0 WHERE id = ?').run(String(entry.commentId));
      return Promise.resolve();
    }
    modQueue = modQueue.then(async () => {
      await mkdir(dirname(modFile), { recursive: true });
      await appendFile(modFile, `${JSON.stringify(entry)}\n`);
    });
    return modQueue;
  };

  const removeCommentFromLog = (commentId) => {
    if (useSqlite) {
      db.prepare('DELETE FROM comments WHERE id = ?').run(String(commentId));
      return Promise.resolve();
    }
    commentQueue = compactJsonl(commentsFile, commentQueue, 'id', commentId);
    return commentQueue;
  };

  const removeVotesFromLog = (commentId) => {
    if (useSqlite) {
      db.prepare('DELETE FROM comment_votes WHERE comment_id = ?').run(String(commentId));
      return Promise.resolve();
    }
    voteQueue = compactJsonl(votesFile, voteQueue, 'commentId', commentId);
    return voteQueue;
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

  // Admin view — public shape plus the thread key (under its real field name)
  // and the moderation flag.
  const adminComment = (comment) => ({
    ...publicComment(comment),
    [keyField]: comment.thread,
    adminHidden: !!comment.adminHidden,
  });

  // --- High-level ops used by the route handlers ---------------------------
  const list = (thread) => byThread.get(thread) || [];
  const get = (commentId) => byId.get(commentId);
  const all = () => [...byId.values()];

  // Append a new comment to a thread. Caps the in-memory list so memory stays
  // bounded; the full log stays on disk. Returns the stored comment.
  const add = async (thread, name, text) => {
    const comment = {
      id: randomUUID(),
      thread,
      name,
      text,
      createdAt: new Date().toISOString(),
      votes: {},
      adminHidden: false,
    };
    const arr = byThread.get(thread) || [];
    arr.push(comment);
    if (arr.length > maxCommentsPerQuestion) {
      const removed = arr.splice(0, arr.length - maxCommentsPerQuestion);
      for (const old of removed) byId.delete(old.id);
    }
    byThread.set(thread, arr);
    byId.set(comment.id, comment);
    await append({ [keyField]: thread, id: comment.id, name, text, createdAt: comment.createdAt });
    return comment;
  };

  // value: 1 (up), -1 (down), 0 (clear). Returns the updated comment, or null.
  const setVote = async (commentId, voterId, value) => {
    const comment = byId.get(commentId);
    if (!comment) return null;
    if (value === 0) delete comment.votes[voterId];
    else comment.votes[voterId] = value;
    await appendVoteLog({ commentId: comment.id, voterId, value });
    return comment;
  };

  // hide / show flip a flag (append-only mod log); delete physically compacts the
  // comment + its votes out of disk. Returns false when the comment is unknown.
  const moderate = async (commentId, action) => {
    const comment = byId.get(commentId);
    if (!comment) return false;
    if (action === 'delete') {
      removeComment(comment);
      await removeCommentFromLog(commentId);
      await removeVotesFromLog(commentId);
    } else {
      if (!applyMod(commentId, action)) return false;
      await appendModLog({ commentId, action, at: new Date().toISOString() });
    }
    return true;
  };

  return { load, loadVotes, loadMods, list, get, all, add, setVote, moderate, publicComment, adminComment };
};

// 面試篩選器題目留言（key = 整數題號）。
const questionComments = makeCommentStore({
  board: 'question',
  commentsFile,
  votesFile: commentVotesFile,
  modFile: commentModFile,
  keyField: 'questionId',
  normalizeKey: (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  },
});

// 經驗分享文章留言（key = 文章 id 字串）。獨立的三份 log，與題目留言完全不混。
const postComments = makeCommentStore({
  board: 'post',
  commentsFile: postCommentsFile,
  votesFile: postCommentVotesFile,
  modFile: postCommentModFile,
  keyField: 'postId',
  normalizeKey: (raw) => {
    const s = String(raw ?? '').trim();
    return s || null;
  },
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

const makeLeaderboard = ({ game, file, topN }) => {
  let top = []; // [{ name, score, createdAt }], sorted desc, length <= topN
  let writeQueue = Promise.resolve();

  const load = async () => {
    top = [];
    if (useSqlite) {
      const clean = [];
      for (const row of db.prepare('SELECT name, score, created_at FROM leaderboard WHERE game = ?').all(game)) {
        const name = String(row.name || '').trim();
        const score = Number(row.score);
        if (!name || !Number.isInteger(score)) continue;
        clean.push({ name, score, createdAt: String(row.created_at || '') });
      }
      top = sortLeaderboard(clean).slice(0, topN);
      return;
    }
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
    if (useSqlite) {
      // Mirror this game's in-memory top-N into its rows only (the two games
      // share one table, discriminated by `game`).
      const ins = db.prepare('INSERT OR REPLACE INTO leaderboard (game, name, score, created_at) VALUES (?, ?, ?, ?)');
      db.transaction(() => {
        db.prepare('DELETE FROM leaderboard WHERE game = ?').run(game);
        for (const e of top) ins.run(game, e.name, e.score, e.createdAt || '');
      })();
      return Promise.resolve();
    }
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

  // Admin: drop the entry for a name. Returns true if a row was removed.
  const remove = (name) => {
    const before = top.length;
    top = top.filter((e) => e.name !== name);
    return top.length < before;
  };

  return { load, persist, record, remove, leaderboard: () => top };
};

// One leaderboard per mini-game, keyed by the URL slug used in /api/<game>/*.
const leaderboards = {
  checkgame: makeLeaderboard({ game: 'checkgame', file: checkGameFile, topN: checkGameTopN }),
  numbergame: makeLeaderboard({ game: 'numbergame', file: numberGameFile, topN: numberGameTopN }),
};

// --- 招考行事曆 (calendar) store -------------------------------------------
// In-memory array of events, rewritten to disk (tmp + rename) on every change.
// Fields follow the admin form: org（機關/名稱）, signupStart / signupEnd（報名起訖）,
// writtenExam（筆試）, writtenResult（筆試結果公佈）, interview（面試/一面）,
// interview2（二面）, finalResult（放榜）, link（簡章連結）, note（備註）.
let calendarEvents = [];
// Deleted synced externalKeys -> ISO timestamp; prevents daily sync from
// resurrecting an event the admin intentionally removed. Pruned after 180 days.
const calendarSuppressed = new Map();
// Synced or already-alerted externalKeys -> ISO timestamp; prevents duplicate
// "new exam" emails and prevents aged-out exams still on Exam.aspx from re-alerting.
const calendarAlerted = new Map();
const suppressedTtlMs = 180 * 24 * 60 * 60 * 1000;
const maxSyncEvents = 100;
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
const validDateValue = (s) => !s || /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(s);

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

const extractTabfSlugFromLink = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.toLowerCase() !== 'svc.tabf.org.tw') return null;
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    if (!seg || seg.startsWith('_') || !/^[a-z0-9][a-z0-9_-]{1,48}$/i.test(seg)) return null;
    return seg.toLowerCase();
  } catch {
    return null;
  }
};

// Public / admin API shape: omit internal sync metadata (externalKey, manualEdited)
// so existing public & admin contracts remain clean and byte-compatible.
const shapeCalendarEvent = (e) => ({
  id: e.id,
  org: e.org,
  signupStart: e.signupStart,
  signupEnd: e.signupEnd,
  writtenExam: e.writtenExam,
  answerKey: e.answerKey,
  writtenResult: e.writtenResult,
  interview: e.interview,
  interview2: e.interview2,
  finalResult: e.finalResult,
  link: e.link,
  note: e.note,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

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

const pruneTimestampMap = (map) => {
  const cutoff = Date.now() - suppressedTtlMs;
  let removed = 0;
  for (const [key, stamp] of map) {
    const ts = Date.parse(stamp);
    if (!Number.isFinite(ts) || ts < cutoff) {
      map.delete(key);
      removed += 1;
    }
  }
  return removed;
};

const pruneSuppressedCalendar = () => pruneTimestampMap(calendarSuppressed);
const pruneAlertedCalendar = () => pruneTimestampMap(calendarAlerted);

const loadCalendar = async () => {
  calendarEvents = [];
  calendarSuppressed.clear();
  calendarAlerted.clear();
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM calendar_events').all();
    calendarEvents = sortCalendar(
      rows.map((r) => ({
        id: String(r.id),
        // DB columns are snake_case; cleanCalendarInput keys on the camelCase
        // form names, so map them back via the shared calendarColumns table.
        ...cleanCalendarInput(Object.fromEntries(calendarColumns.map(([col, jsonKey]) => [jsonKey, r[col]]))),
        externalKey: String(r.external_key || ''),
        manualEdited: !!r.manual_edited,
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
      })),
    );
    for (const s of db.prepare('SELECT external_key, deleted_at FROM calendar_suppressed').all()) {
      const k = String(s.external_key || '').trim();
      if (k) calendarSuppressed.set(k, String(s.deleted_at || ''));
    }
    for (const a of db.prepare('SELECT external_key, alerted_at FROM calendar_alerted').all()) {
      const k = String(a.external_key || '').trim();
      if (k) calendarAlerted.set(k, String(a.alerted_at || ''));
    }
    if (pruneCalendar() + pruneSuppressedCalendar() + pruneAlertedCalendar() > 0) await persistCalendar();
    return;
  }
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
    if (Array.isArray(rows)) {
      calendarEvents = sortCalendar(
        rows
          .filter((e) => e && typeof e === 'object' && e.id)
          .map((e) => ({
            id: String(e.id),
            ...cleanCalendarInput(e),
            externalKey: typeof e.externalKey === 'string' ? e.externalKey : '',
            manualEdited: !!e.manualEdited,
            createdAt: String(e.createdAt || ''),
            updatedAt: String(e.updatedAt || ''),
          })),
      );
    }
    if (parsed && !Array.isArray(parsed) && parsed.suppressed && typeof parsed.suppressed === 'object') {
      for (const [k, v] of Object.entries(parsed.suppressed)) {
        if (k && typeof v === 'string') calendarSuppressed.set(k, v);
      }
    }
    if (parsed && !Array.isArray(parsed) && parsed.alerted && typeof parsed.alerted === 'object') {
      for (const [k, v] of Object.entries(parsed.alerted)) {
        if (k && typeof v === 'string') calendarAlerted.set(k, v);
      }
    }
    // Rewrite the file if startup pruning dropped anything (reclaims disk).
    if (pruneCalendar() + pruneSuppressedCalendar() + pruneAlertedCalendar() > 0) await persistCalendar();
  } catch (error) {
    console.warn(`Could not parse ${calendarFile}; starting with an empty calendar.`, error);
  }
};

const persistCalendar = () => {
  if (useSqlite) {
    const cols = ['id', ...calendarColumns.map(([col]) => col), 'external_key', 'manual_edited', 'created_at', 'updated_at'];
    const ins = db.prepare(`INSERT OR REPLACE INTO calendar_events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    const insSup = db.prepare('INSERT OR REPLACE INTO calendar_suppressed (external_key, deleted_at) VALUES (?, ?)');
    const insAlert = db.prepare('INSERT OR REPLACE INTO calendar_alerted (external_key, alerted_at) VALUES (?, ?)');
    db.transaction(() => {
      db.prepare('DELETE FROM calendar_events').run();
      for (const e of calendarEvents) {
        ins.run(
          String(e.id),
          ...calendarColumns.map(([, jsonKey]) => String(e[jsonKey] ?? '')),
          String(e.externalKey || ''),
          e.manualEdited ? 1 : 0,
          String(e.createdAt || ''),
          String(e.updatedAt || ''),
        );
      }
      db.prepare('DELETE FROM calendar_suppressed').run();
      for (const [k, deletedAt] of calendarSuppressed) {
        insSup.run(String(k), String(deletedAt));
      }
      db.prepare('DELETE FROM calendar_alerted').run();
      for (const [k, alertedAt] of calendarAlerted) {
        insAlert.run(String(k), String(alertedAt));
      }
    })();
    return Promise.resolve();
  }
  calendarWriteQueue = calendarWriteQueue.then(async () => {
    await mkdir(dirname(calendarFile), { recursive: true });
    const tmpFile = `${calendarFile}.${process.pid}.${randomUUID()}.tmp`;
    const payload = calendarSuppressed.size || calendarAlerted.size
      ? {
          events: calendarEvents,
          suppressed: Object.fromEntries(calendarSuppressed),
          alerted: Object.fromEntries(calendarAlerted),
        }
      : calendarEvents;
    await writeFile(tmpFile, `${JSON.stringify(payload, null, 2)}\n`);
    await rename(tmpFile, calendarFile);
  });
  return calendarWriteQueue;
};

// --- 經驗分享 (experience posts) store -------------------------------------
// In-memory array of posts, rewritten to disk (tmp + rename) on every change.
// Each post: { id, category('exam'|'work'), title, content, hidden, createdAt, updatedAt }.
let posts = [];
// id -> post，給投票 / 短網址等需要按 id 取用的地方做 O(1) 查找。
const postById = new Map();
const isPublicPost = (post) => Boolean(post && !post.hidden && !post.pending);
let postsWriteQueue = Promise.resolve();
let postVoteAppendQueue = Promise.resolve();

// Newest first.
const sortPosts = (rows) => rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

// 短網址用的 slug：6 碼 base62，由伺服器產生（非使用者輸入）。短網址
// /e/<slug> 會 302 轉到 /experience/<id>，方便分享與產生 QR Code。
const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const makeSlug = (len = 6) => {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG_ALPHABET[bytes[i] % 62];
  return s;
};
const uniqueSlug = () => {
  let s = makeSlug();
  while (posts.some((p) => p.slug === s)) s = makeSlug();
  return s;
};

const cleanPostInput = (raw) => ({
  category: postCategories.includes(raw?.category) ? raw.category : 'exam',
  title: sanitizeText(raw?.title ?? '', maxPostTitleLength),
  author: sanitizeText(raw?.author ?? '', maxPostAuthorLength),
  content: sanitizeText(raw?.content ?? '', maxPostContentLength),
});

const loadPosts = async () => {
  posts = [];
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM posts').all();
    posts = sortPosts(
      rows.map((r) => ({
        id: String(r.id),
        slug: typeof r.slug === 'string' ? r.slug : '',
        ...cleanPostInput({ category: r.category, title: r.title, author: r.author, content: r.content }),
        hidden: !!r.hidden,
        pending: !!r.pending,
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
      })),
    );
    postById.clear();
    for (const p of posts) {
      p.votes = {};
      postById.set(p.id, p);
    }
    // Backfill short-url slugs for any older posts saved before this feature.
    let changed = false;
    for (const p of posts) {
      if (!p.slug) {
        p.slug = uniqueSlug();
        changed = true;
      }
    }
    if (changed) await persistPosts();
    return;
  }
  let raw = '';
  try {
    raw = await readFile(postsFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${postsFile}; starting with no posts.`, error);
    }
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.posts;
    if (!Array.isArray(rows)) return;
    posts = sortPosts(
      rows
        .filter((p) => p && typeof p === 'object' && p.id)
        .map((p) => ({
          id: String(p.id),
          slug: typeof p.slug === 'string' ? p.slug : '',
          ...cleanPostInput(p),
          hidden: !!p.hidden,
          // 使用者投稿、尚未經管理員審核公開的文章。投稿一律 hidden + pending；
          // 管理員按「顯示」公開後 pending 會被清掉。
          pending: !!p.pending,
          createdAt: String(p.createdAt || ''),
          updatedAt: String(p.updatedAt || ''),
        })),
    );
    // 投票表（voterId -> 1|-1）只活在記憶體 + JSONL log，不寫進 posts.json。
    postById.clear();
    for (const p of posts) {
      p.votes = {};
      postById.set(p.id, p);
    }
    // Backfill short-url slugs for any older posts saved before this feature.
    let changed = false;
    for (const p of posts) {
      if (!p.slug) {
        p.slug = uniqueSlug();
        changed = true;
      }
    }
    if (changed) await persistPosts();
  } catch (error) {
    console.warn(`Could not parse ${postsFile}; starting with no posts.`, error);
  }
};

const persistPosts = () => {
  if (useSqlite) {
    // The in-memory `posts` array is the source of truth; mirror it into the
    // posts table in one transaction. Post volume is tiny (admin-authored +
    // occasional submissions), so a full rewrite per change is cheap. Votes live
    // in their own table (post_votes) and are untouched here.
    const ins = db.prepare(
      `INSERT OR REPLACE INTO posts
       (id, slug, category, title, author, content, hidden, pending, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      db.prepare('DELETE FROM posts').run();
      for (const p of posts) {
        ins.run(p.id, p.slug, p.category, p.title, p.author, p.content, p.hidden ? 1 : 0, p.pending ? 1 : 0, p.createdAt, p.updatedAt);
      }
    })();
    return Promise.resolve();
  }
  postsWriteQueue = postsWriteQueue.then(async () => {
    await mkdir(dirname(postsFile), { recursive: true });
    const tmpFile = `${postsFile}.${process.pid}.${randomUUID()}.tmp`;
    // 投票表不落在 posts.json（票數由 post-votes.jsonl 還原），序列化時剝掉。
    const serializable = posts.map(({ votes, ...rest }) => rest);
    await writeFile(tmpFile, `${JSON.stringify(serializable, null, 2)}\n`);
    await rename(tmpFile, postsFile);
  });
  return postsWriteQueue;
};

// 還原文章投票（在 loadPosts 之後跑）：依 JSONL 重播，最後一筆 per voter 為準。
const loadPostVotes = async () => {
  if (useSqlite) {
    for (const row of db.prepare('SELECT post_id, voter_id, value FROM post_votes').all()) {
      const post = postById.get(String(row.post_id));
      if (post) post.votes[row.voter_id] = row.value;
    }
    return;
  }
  let raw = '';
  try {
    raw = await readFile(postVotesFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read ${postVotesFile}; starting with no post votes.`, error);
    }
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const post = postById.get(String(entry.postId));
      if (!post) continue;
      const value = Number(entry.value);
      if (value === 0) delete post.votes[entry.voterId];
      else if (value === 1 || value === -1) post.votes[entry.voterId] = value;
    } catch {
      // Skip malformed lines.
    }
  }
};

const appendPostVote = (entry) => {
  if (useSqlite) {
    if (Number(entry.value) === 0) {
      db.prepare('DELETE FROM post_votes WHERE post_id = ? AND voter_id = ?').run(String(entry.postId), String(entry.voterId));
    } else {
      db.prepare('INSERT OR REPLACE INTO post_votes (post_id, voter_id, value) VALUES (?, ?, ?)').run(String(entry.postId), String(entry.voterId), Number(entry.value));
    }
    return Promise.resolve();
  }
  postVoteAppendQueue = postVoteAppendQueue.then(async () => {
    await mkdir(dirname(postVotesFile), { recursive: true });
    await appendFile(postVotesFile, `${JSON.stringify(entry)}\n`);
  });
  return postVoteAppendQueue;
};

const removePostVotesFromLog = (postId) => {
  if (useSqlite) {
    db.prepare('DELETE FROM post_votes WHERE post_id = ?').run(String(postId));
    return Promise.resolve();
  }
  postVoteAppendQueue = compactJsonl(postVotesFile, postVoteAppendQueue, 'postId', postId);
  return postVoteAppendQueue;
};

// Public shape: drop the hidden flag (hidden posts are filtered out before this)
// and the raw voter map — expose only aggregate 讚/倒讚 counts.
const publicPost = (p) => {
  const { up, down, score } = tallyVotes(p.votes);
  return {
    id: p.id,
    slug: p.slug,
    category: p.category,
    title: p.title,
    author: p.author,
    content: p.content,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    up,
    down,
    score,
  };
};

// Admin view: public shape + the moderation flag and the「待審核」flag (no raw
// voter map either).
const adminPost = (p) => ({ ...publicPost(p), hidden: !!p.hidden, pending: !!p.pending });
const adminPosts = () => posts.map(adminPost);

// --- 經驗分享：伺服器端 SEO 渲染 (dynamic SEO) ------------------------------
// 一般使用者由 Caddy 導向靜態 SPA（前端自行渲染）；只有已知的爬蟲 / 社群預覽
// (Googlebot / facebookexternalhit / LINE / Twitterbot …) 會被導到這裡，拿到
// 一份帶正確 <head> meta、且不需 JavaScript 就能閱讀的文章 HTML。
const POST_CATEGORY_LABELS = { exam: '考試篇', work: '工作篇' };

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 台北時間、24 小時制（與前端 formatPostTime 對齊）。Node 20 內建 full-ICU。
const taipeiDateTime = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const formatTaipei = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : taipeiDateTime.format(d);
};

// 取內文前 N 字當 meta description（壓平換行/空白）。
const excerpt = (text, n = 140) => {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
};

// 內文依空行切段落、單一換行轉 <br>。
const articleParagraphs = (content) =>
  String(content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

const renderArticleHtml = (post) => {
  const label = POST_CATEGORY_LABELS[post.category] || '';
  const fullTitle = `${post.title}｜經驗分享｜公股銀行新手村`;
  const desc = excerpt(post.content, 140);
  const canonical = `${siteBase}/experience/${post.id}`;
  const meta = [post.author && `作者：${post.author}`, formatTaipei(post.createdAt)].filter(Boolean).join('　');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="公股銀行新手村" />
<meta property="og:locale" content="zh_TW" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:title" content="${escapeHtml(fullTitle)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<style>
body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;max-width:720px;margin:0 auto;padding:2rem 1.2rem;color:#1f2937;line-height:1.8}
a{color:#0f4f49}
.kicker{font-weight:800;color:#0f4f49;font-size:.85rem}
h1{font-size:1.6rem;line-height:1.3;margin:.4rem 0}
.meta{color:#6b7280;font-size:.85rem;margin-bottom:1.5rem}
.body p{margin:0 0 1rem}
</style>
</head>
<body>
<p><a href="/experience">← 經驗分享</a></p>
<article>
<div class="kicker">${escapeHtml(label)}</div>
<h1>${escapeHtml(post.title)}</h1>
<div class="meta">${escapeHtml(meta)}</div>
<div class="body">${articleParagraphs(post.content)}</div>
</article>
</body>
</html>`;
};

const render404Html = () =>
  `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8" />` +
  `<meta name="robots" content="noindex" /><title>找不到文章｜公股銀行新手村</title></head>` +
  `<body><p>找不到這篇文章，可能已被移除。</p><p><a href="/experience">回到經驗分享</a></p></body></html>`;

// 經驗分享文章的動態 sitemap（robots.txt 會指向這裡）。
const renderPostsSitemap = () => {
  const items = posts
    .filter(isPublicPost)
    .map((p) => {
      const lastmod = String(p.updatedAt || p.createdAt || '').slice(0, 10);
      return `  <url><loc>${siteBase}/experience/${p.id}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
};

const sendHtml = (res, status, html, cacheControl = 'no-store') => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl });
  res.end(html);
};

// Per-IP spacing for successfully verified posts and comments.
const rateLog = new Map();

const checkRateLimit = (ip) => {
  const now = Date.now();
  const history = (rateLog.get(ip) || []).filter((ts) => now - ts < commentWindowMs);

  if (!rateLog.has(ip) && rateLog.size >= 2048) {
    return { ok: false, reason: '目前留言量較大，請稍後再試。' };
  }
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
  const forwarded = req.headers['x-bank-client-ip'];
  if (trustProxy && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return req.socket?.remoteAddress || 'unknown';
};

const enforceVoter = (req) => {
  const id = voterSessions.read(req);
  if (!id) throw Object.assign(new Error('請先完成評分與投票驗證。'), { status: 403 });
  return id;
};

const checkVoteCapacity = (votes, voterId) => {
  if (votes && Object.hasOwn(votes, voterId)) return;
  if (votes && Object.keys(votes).length >= maxVotesPerTarget) {
    throw Object.assign(new Error('投票數量已達上限，暫時無法接受新投票。'), { status: 429 });
  }
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

const readBody = (req, maxLength = 16384) =>
  new Promise((resolve, reject) => {
    let body = '';
    let oversized = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (oversized) return;
      body += chunk;
      if (body.length > maxLength) {
        oversized = true;
        body = '';
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const readJsonBody = async (req, { maxLength = 16384 } = {}) => {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  }
  const bodyText = await readBody(req, maxLength);
  try {
    const body = JSON.parse(bodyText);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // Report malformed input without reflecting it.
  }
  throw Object.assign(new Error('Request body must be a JSON object'), { status: 400 });
};

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
  return { store: questionComments, thread: questionId, commentId: match[2] };
};

// 文章留言：以文章 id（UUID）為 thread key，與題目留言的整數題號分流。
const parsePostCommentId = (pathname) => {
  const match = pathname.match(/^\/api\/post-comments\/([a-f0-9-]{36})$/);
  return match ? match[1] : null;
};

const parsePostCommentVote = (pathname) => {
  const match = pathname.match(/^\/api\/post-comments\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/vote$/);
  if (!match) return null;
  return { store: postComments, thread: match[1], commentId: match[2] };
};

let officialDocSeeded = false;
const getOfficialDocDbHandle = () => {
  if (officialDocDbError) return null;
  if (!officialDocDb) {
    try {
      officialDocDb = openDb(officialDocDbFile);
    } catch (error) {
      officialDocDbError = error;
      console.warn(`Official document practice DB unavailable at ${officialDocDbFile}.`, error);
      return null;
    }
  }
  if (!officialDocSeeded) {
    initOfficialDocStore(officialDocDb);
    officialDocSeeded = true;
  }
  return officialDocDb;
};

await loadStore();
await questionComments.load();
await questionComments.loadVotes();
await questionComments.loadMods();
await postComments.load();
await postComments.loadVotes();
await postComments.loadMods();
await Promise.all(Object.values(leaderboards).map((lb) => lb.load()));
await loadCalendar();
await loadPosts();
await loadPostVotes();
if (officialDocDb) getOfficialDocDbHandle();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) {
      if (!adminSessions.acceptsHost(req)) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method) && !adminSessions.acceptsOrigin(req)) {
        sendJson(res, 403, { error: 'invalid origin' });
        return;
      }
      if (url.pathname === '/api/admin/session' && req.method === 'POST') {
        const ip = getClientIp(req);
        if (!allowAdminLogin(ip) || !allowGlobalAdminLogin('login')) {
          sendJson(res, 429, { error: '登入嘗試次數過多，請稍後再試。' });
          return;
        }
        const body = await readJsonBody(req);
        if (!adminSessions.matchesToken(body.token)) {
          sendJson(res, 401, { error: '管理金鑰不正確，或後台未啟用。' });
          return;
        }
        res.setHeader('Set-Cookie', adminSessions.start(req));
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/api/admin/session' && req.method === 'DELETE') {
        res.setHeader('Set-Cookie', adminSessions.end(req));
        sendJson(res, 200, { ok: true });
        return;
      }
      if (!adminSessions.authenticated(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
    } else if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!allowPublicWrite(getClientIp(req)) || !allowGlobalWrite('write')) {
        sendJson(res, 429, { error: '要求太頻繁，請稍後再試。' });
        return;
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/voter-session') {
      if (!allowVoterEnrollment(getClientIp(req))) {
        sendJson(res, 429, { error: '驗證要求太頻繁，請稍後再試。' });
        return;
      }
      const body = await readJsonBody(req);
      if (!voterSessions.read(req)) {
        const result = await turnstileVerifier.verify({
          token: body.turnstileToken,
          remoteIp: getClientIp(req),
          action: 'voter-enroll',
        });
        if (!result.ok) {
          sendJson(res, result.status, { error: result.error });
          return;
        }
        res.setHeader('Set-Cookie', voterSessions.issue());
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (['GET', 'HEAD'].includes(req.method) && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    // Runtime public configuration keeps the site key out of the frontend
    // build pipeline. The secret key is never exposed by this endpoint.
    if (req.method === 'GET' && url.pathname === '/api/security-config') {
      sendJson(res, 200, { turnstile: turnstileVerifier.publicConfig });
      return;
    }

    // --- 公文練習器 -------------------------------------------------------
    if (req.method === 'GET' && url.pathname === '/api/official-doc/questions') {
      const officialDb = getOfficialDocDbHandle();
      if (!officialDb) {
        sendJson(res, 503, { error: 'official document database unavailable' });
        return;
      }
      sendJson(res, 200, { questions: listOfficialDocQuestions(officialDb) }, cacheRead);
      return;
    }

    const officialDocQuestionMatch = url.pathname.match(/^\/api\/official-doc\/questions\/([^/]+)$/);
    if (req.method === 'GET' && officialDocQuestionMatch) {
      const officialDb = getOfficialDocDbHandle();
      if (!officialDb) {
        sendJson(res, 503, { error: 'official document database unavailable' });
        return;
      }
      const question = getOfficialDocQuestion(officialDb, decodeURIComponent(officialDocQuestionMatch[1]));
      if (!question) {
        sendJson(res, 404, { error: 'question not found' });
        return;
      }
      sendJson(res, 200, { question }, cacheRead);
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
      sendJson(res, 200, { events: calendarEvents.filter(eventInWindow).map(shapeCalendarEvent) }, cacheRead);
      return;
    }

    // Admin: fetch the calendar for a verified session.
    if (req.method === 'GET' && url.pathname === '/api/admin/calendar') {
      sendJson(res, 200, { events: calendarEvents.map(shapeCalendarEvent) });
      return;
    }

    // Admin: create an event.
    if (req.method === 'POST' && url.pathname === '/api/admin/calendar') {
      if (calendarEvents.length >= maxCalendarEvents) {
        sendJson(res, 400, { error: '行事曆事件數量已達上限' });
        return;
      }
      const body = await readJsonBody(req);
      const fields = cleanCalendarInput(body);
      if (!fields.org) {
        sendJson(res, 400, { error: '機關/名稱不可為空' });
        return;
      }
      const now = new Date().toISOString();
      const event = {
        id: randomUUID(),
        ...fields,
        externalKey: '',
        manualEdited: true,
        createdAt: now,
        updatedAt: now,
      };
      calendarEvents.push(event);
      sortCalendar(calendarEvents);
      pruneCalendar(); // drop any events that have since aged out of the window
      await persistCalendar();
      sendJson(res, 200, { event: shapeCalendarEvent(event), events: calendarEvents.map(shapeCalendarEvent) });
      return;
    }

    // Admin: idempotent upsert sync for automated scrapers (e.g., TABF).
    // Never deletes missing events, skips events edited or deleted by an admin,
    // and deduplicates against pre-existing manual entries via TABF link slug.
    if (req.method === 'POST' && url.pathname === '/api/admin/calendar/sync') {
      const body = await readJsonBody(req, { maxLength: 131072 });
      const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : '';
      if (!/^[a-z0-9_-]{1,32}$/.test(source)) {
        sendJson(res, 400, { error: 'source 格式不正確' });
        return;
      }
      if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > maxSyncEvents) {
        sendJson(res, 400, { error: `events 必須為 1～${maxSyncEvents} 筆陣列` });
        return;
      }

      const now = new Date().toISOString();
      const summary = {
        source,
        received: body.events.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        skippedOutOfWindow: 0,
        skippedManual: 0,
        skippedSuppressed: 0,
        skippedInvalid: 0,
        total: 0,
      };

      const seenKeys = new Set();
      let dirty = pruneSuppressedCalendar() + pruneAlertedCalendar() > 0;

      for (const rawItem of body.events) {
        if (!rawItem || typeof rawItem !== 'object') {
          summary.skippedInvalid += 1;
          continue;
        }
        const externalKey = typeof rawItem.externalKey === 'string' ? rawItem.externalKey.trim().toLowerCase() : '';
        if (
          !externalKey.startsWith(`${source}:`) ||
          !/^[a-z0-9_:-]{3,80}$/.test(externalKey) ||
          seenKeys.has(externalKey)
        ) {
          summary.skippedInvalid += 1;
          continue;
        }
        seenKeys.add(externalKey);

        const fields = cleanCalendarInput(rawItem);
        const hasValidDates = calendarDateFields.every((f) => validDateValue(fields[f]));
        const hasAtLeastOneDate = calendarDateFields.some((f) => Boolean(dateOnly(fields[f])));
        if (!fields.org || !hasValidDates || !hasAtLeastOneDate) {
          summary.skippedInvalid += 1;
          continue;
        }
        // Record every valid seen exam key so aged-out or already-synced exams
        // do not trigger false "new exam" email alerts later.
        if (!calendarAlerted.has(externalKey)) {
          calendarAlerted.set(externalKey, now);
          dirty = true;
        }
        if (!eventInWindow(fields)) {
          summary.skippedOutOfWindow += 1;
          continue;
        }
        if (calendarSuppressed.has(externalKey)) {
          summary.skippedSuppressed += 1;
          continue;
        }

        const incomingTabfSlug = source === 'tabf' ? extractTabfSlugFromLink(fields.link) || externalKey.slice('tabf:'.length) : null;
        const existing = calendarEvents.find(
          (e) =>
            (e.externalKey && e.externalKey === externalKey) ||
            (incomingTabfSlug && extractTabfSlugFromLink(e.link) === incomingTabfSlug),
        );

        if (existing) {
          // Never overwrite admin-authored or admin-edited events.
          if (existing.manualEdited || !existing.externalKey) {
            summary.skippedManual += 1;
            continue;
          }
          const changed = calendarFields.some((f) => existing[f] !== fields[f]);
          if (!changed) {
            summary.unchanged += 1;
            continue;
          }
          Object.assign(existing, fields, { updatedAt: now });
          summary.updated += 1;
          dirty = true;
          continue;
        }

        if (calendarEvents.length >= maxCalendarEvents) {
          summary.skippedInvalid += 1;
          continue;
        }
        calendarEvents.push({
          id: randomUUID(),
          ...fields,
          externalKey,
          manualEdited: false,
          createdAt: now,
          updatedAt: now,
        });
        summary.created += 1;
        dirty = true;
      }

      if (pruneCalendar() > 0) dirty = true;
      if (dirty) {
        sortCalendar(calendarEvents);
        await persistCalendar();
      }
      summary.total = calendarEvents.length;
      sendJson(res, 200, { ok: true, summary });
      return;
    }

    // Admin: check a scraped recruitment listing (e.g. TABF Exam.aspx) for unseen
    // exams and send a single Resend email digest via the VM's existing mail config.
    if (req.method === 'POST' && url.pathname === '/api/admin/calendar/alerts') {
      const body = await readJsonBody(req, { maxLength: 131072 });
      const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : '';
      if (!/^[a-z0-9_-]{1,32}$/.test(source)) {
        sendJson(res, 400, { error: 'source 格式不正確' });
        return;
      }
      if (!Array.isArray(body.exams) || body.exams.length === 0 || body.exams.length > maxSyncEvents) {
        sendJson(res, 400, { error: `exams 必須為 1～${maxSyncEvents} 筆陣列` });
        return;
      }

      const now = new Date().toISOString();
      const checkedAt = typeof body.checkedAt === 'string' && body.checkedAt.trim() ? body.checkedAt.trim() : now;
      let dirty = pruneSuppressedCalendar() + pruneAlertedCalendar() > 0;
      const seenKeys = new Set();
      const newExams = [];

      for (const rawItem of body.exams) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const externalKey = typeof rawItem.externalKey === 'string' ? rawItem.externalKey.trim().toLowerCase() : '';
        if (
          !externalKey.startsWith(`${source}:`) ||
          !/^[a-z0-9_:-]{3,80}$/.test(externalKey) ||
          seenKeys.has(externalKey)
        ) {
          continue;
        }
        seenKeys.add(externalKey);

        const title = sanitizeText(rawItem.title ?? '', maxCalendarFieldLength);
        const urlValue = sanitizeText(rawItem.url ?? '', maxCalendarFieldLength);
        if (!title) continue;

        if (calendarSuppressed.has(externalKey) || calendarAlerted.has(externalKey)) continue;

        const slug = source === 'tabf' ? extractTabfSlugFromLink(urlValue) || externalKey.slice('tabf:'.length) : null;
        const exists = calendarEvents.some(
          (e) =>
            (e.externalKey && e.externalKey === externalKey) ||
            (slug && extractTabfSlugFromLink(e.link) === slug),
        );
        if (exists) {
          // Remember already-present manual exams so they won't alert after aging out.
          calendarAlerted.set(externalKey, now);
          dirty = true;
          continue;
        }

        newExams.push({
          externalKey,
          title,
          url: urlValue,
          isRegistering: Boolean(rawItem.isRegistering),
        });
      }

      if (newExams.length === 0) {
        if (dirty) await persistCalendar();
        sendJson(res, 200, {
          ok: true,
          summary: { source, received: body.exams.length, newCount: 0, emailed: false, reason: 'no_new_exams' },
        });
        return;
      }

      if (!submissionEmailNotifier.enabled) {
        if (dirty) await persistCalendar();
        sendJson(res, 200, {
          ok: true,
          summary: {
            source,
            received: body.exams.length,
            newCount: newExams.length,
            emailed: false,
            reason: 'email_disabled',
            newExams,
          },
        });
        return;
      }

      try {
        const result = await submissionEmailNotifier.notifyNewExams({ source, exams: newExams, checkedAt });
        for (const exam of newExams) calendarAlerted.set(exam.externalKey, now);
        await persistCalendar();
        sendJson(res, 200, {
          ok: true,
          summary: {
            source,
            received: body.exams.length,
            newCount: newExams.length,
            emailed: Boolean(result?.sent),
            emailId: result?.id || null,
            newExams,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[calendar-alert] email failed: ${message}`);
        sendJson(res, 502, { error: '新招考通知寄送失敗，下次排程將重試。' });
      }
      return;
    }

    // Admin: update or delete a single event by id.
    const adminEventMatch = url.pathname.match(/^\/api\/admin\/calendar\/([a-f0-9-]{36})$/);
    if (adminEventMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      const id = adminEventMatch[1];
      const idx = calendarEvents.findIndex((e) => e.id === id);
      if (idx === -1) {
        sendJson(res, 404, { error: 'event not found' });
        return;
      }

      if (req.method === 'DELETE') {
        const [removed] = calendarEvents.splice(idx, 1);
        if (removed?.externalKey) {
          calendarSuppressed.set(removed.externalKey, new Date().toISOString());
          pruneSuppressedCalendar();
        }
        await persistCalendar();
        sendJson(res, 200, { events: calendarEvents.map(shapeCalendarEvent) });
        return;
      }

      const body = await readJsonBody(req);
      const fields = cleanCalendarInput(body);
      if (!fields.org) {
        sendJson(res, 400, { error: '機關/名稱不可為空' });
        return;
      }
      calendarEvents[idx] = {
        ...calendarEvents[idx],
        ...fields,
        manualEdited: true,
        updatedAt: new Date().toISOString(),
      };
      sortCalendar(calendarEvents);
      pruneCalendar(); // drop any events that have since aged out of the window
      await persistCalendar();
      const updatedEvent = calendarEvents.find((e) => e.id === id);
      sendJson(res, 200, {
        event: updatedEvent ? shapeCalendarEvent(updatedEvent) : undefined,
        events: calendarEvents.map(shapeCalendarEvent),
      });
      return;
    }

    // --- 經驗分享 (experience posts) -------------------------------------
    // Public read: visible posts only, newest first.
    if (req.method === 'GET' && url.pathname === '/api/posts') {
      sendJson(res, 200, { posts: posts.filter(isPublicPost).map(publicPost) });
      return;
    }

    // Public 投稿：任何人都能投稿一篇文章，但一律先存成 hidden + pending（待審核），
    // 要等管理員在後台「顯示」後才會出現在 /api/posts。與後台發文走不同路徑。
    if (req.method === 'POST' && url.pathname === '/api/posts') {
      const body = await readJsonBody(req);
      // Honeypot：真實使用者看不到 website 欄位，有填就當機器人，假裝成功不存。
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (posts.length >= maxPosts) {
        sendJson(res, 400, { error: '文章數量已達上限，暫時無法投稿。' });
        return;
      }
      const fields = cleanPostInput(body);
      if (!fields.title) {
        sendJson(res, 400, { error: '標題不可為空' });
        return;
      }
      if (!fields.content) {
        sendJson(res, 400, { error: '內容不可為空' });
        return;
      }
      const turnstile = await turnstileVerifier.verify({
        token: body.turnstileToken,
        remoteIp: getClientIp(req),
        action: 'post-submit',
      });
      if (!turnstile.ok) {
        sendJson(res, turnstile.status, { error: turnstile.error });
        return;
      }
      const rate = checkRateLimit(getClientIp(req));
      if (!rate.ok) {
        sendJson(res, 429, { error: rate.reason });
        return;
      }
      if (posts.length >= maxPosts) {
        sendJson(res, 400, { error: '文章數量已達上限，暫時無法投稿。' });
        return;
      }
      const now = new Date().toISOString();
      const post = { id: randomUUID(), slug: uniqueSlug(), ...fields, hidden: true, pending: true, createdAt: now, updatedAt: now, votes: {} };
      posts.push(post);
      postById.set(post.id, post);
      sortPosts(posts);
      await persistPosts();
      sendJson(res, 200, { ok: true });
      // 通知是 best-effort：投稿已安全存檔後才寄，而且不延遲或改變投稿成功回應。
      // Resend 暫時失敗時只記錄錯誤，投稿仍留在後台待審核。
      void submissionEmailNotifier.notify(post).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[submission-email] failed for post ${post.id}: ${message}`);
      });
      return;
    }

    // 動態 SEO：伺服器端渲染的單篇文章頁（Caddy 只把爬蟲 UA 導到這裡）。
    const articleMatch = url.pathname.match(/^\/experience\/([a-f0-9-]{36})$/);
    if (req.method === 'GET' && articleMatch) {
      const post = postById.get(articleMatch[1]);
      if (!isPublicPost(post)) {
        sendHtml(res, 404, render404Html());
        return;
      }
      sendHtml(res, 200, renderArticleHtml(post));
      return;
    }

    // 短網址：/e/<slug> → 302 轉到 /experience/<id>（找不到就回文章列表）。
    const shortMatch = url.pathname.match(/^\/e\/([0-9A-Za-z]{6})$/);
    if (req.method === 'GET' && shortMatch) {
      const post = posts.find((p) => p.slug === shortMatch[1] && isPublicPost(p));
      res.writeHead(302, {
        Location: post ? `/experience/${post.id}` : '/experience',
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    // 經驗分享文章的動態 sitemap。
    if (req.method === 'GET' && url.pathname === '/api/sitemap-posts.xml') {
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(renderPostsSitemap());
      return;
    }

    // Public read: a single visible post by id (powers the per-article URL).
    const postReadMatch = url.pathname.match(/^\/api\/posts\/([a-f0-9-]{36})$/);
    if (req.method === 'GET' && postReadMatch) {
      const post = postById.get(postReadMatch[1]);
      if (!isPublicPost(post)) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      sendJson(res, 200, { post: publicPost(post) });
      return;
    }

    // 對文章按讚 / 倒讚。value: 1（讚）, -1（倒讚）, 0（取消）。
    const postVoteMatch = url.pathname.match(/^\/api\/posts\/([a-f0-9-]{36})\/vote$/);
    if (req.method === 'POST' && postVoteMatch) {
      const body = await readJsonBody(req);
      const voterId = enforceVoter(req);
      const value = Number(body.value);
      if (![1, 0, -1].includes(value)) {
        sendJson(res, 400, { error: 'value must be 1, 0, or -1' });
        return;
      }
      const post = postById.get(postVoteMatch[1]);
      if (!isPublicPost(post)) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      if (value !== 0) checkVoteCapacity(post.votes, voterId);
      if ((post.votes[voterId] || 0) !== value) {
        if (value === 0) delete post.votes[voterId];
        else post.votes[voterId] = value;
        await appendPostVote({ postId: post.id, voterId, value });
      }
      const latest = postById.get(post.id);
      if (!isPublicPost(latest)) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      sendJson(res, 200, { post: publicPost(latest) });
      return;
    }

    // Admin: list every post (including hidden) for management.
    if (req.method === 'GET' && url.pathname === '/api/admin/posts') {
      sendJson(res, 200, { posts: adminPosts() });
      return;
    }

    // Admin: create a post.
    if (req.method === 'POST' && url.pathname === '/api/admin/posts') {
      if (posts.length >= maxPosts) {
        sendJson(res, 400, { error: '文章數量已達上限' });
        return;
      }
      const body = await readJsonBody(req);
      const fields = cleanPostInput(body);
      if (!fields.title) {
        sendJson(res, 400, { error: '標題不可為空' });
        return;
      }
      if (!fields.content) {
        sendJson(res, 400, { error: '內容不可為空' });
        return;
      }
      const now = new Date().toISOString();
      const post = { id: randomUUID(), slug: uniqueSlug(), ...fields, hidden: false, pending: false, createdAt: now, updatedAt: now, votes: {} };
      posts.push(post);
      postById.set(post.id, post);
      sortPosts(posts);
      await persistPosts();
      sendJson(res, 200, { post: adminPost(post), posts: adminPosts() });
      return;
    }

    // Admin: edit a single post by id (category / title / author / content).
    const adminPostEditMatch = url.pathname.match(/^\/api\/admin\/posts\/([a-f0-9-]{36})$/);
    if (req.method === 'PUT' && adminPostEditMatch) {
      const body = await readJsonBody(req);
      const fields = cleanPostInput(body);
      if (!fields.title) {
        sendJson(res, 400, { error: '標題不可為空' });
        return;
      }
      if (!fields.content) {
        sendJson(res, 400, { error: '內容不可為空' });
        return;
      }
      const id = adminPostEditMatch[1];
      const idx = posts.findIndex((p) => p.id === id);
      if (idx === -1) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      posts[idx] = { ...posts[idx], ...fields, updatedAt: new Date().toISOString() };
      postById.set(id, posts[idx]); // keep the vote index pointing at the new object
      sortPosts(posts);
      await persistPosts();
      sendJson(res, 200, { post: adminPost(posts[idx]), posts: adminPosts() });
      return;
    }

    // Admin: hide / show / delete a single post by id.
    const adminPostMatch = url.pathname.match(/^\/api\/admin\/posts\/([a-f0-9-]{36})\/moderate$/);
    if (req.method === 'POST' && adminPostMatch) {
      const body = await readJsonBody(req);
      const action = body.action;
      if (!['hide', 'show', 'delete'].includes(action)) {
        sendJson(res, 400, { error: 'action must be hide, show or delete' });
        return;
      }
      const id = adminPostMatch[1];
      const idx = posts.findIndex((p) => p.id === id);
      if (idx === -1) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      if (action === 'delete') {
        const [removed] = posts.splice(idx, 1);
        if (removed) {
          postById.delete(removed.id);
          await removePostVotesFromLog(removed.id); // 連同投票紀錄一起從 log 清掉
        }
      } else {
        // 「顯示」即代表審核通過：清掉 pending（待審核）旗標。
        posts[idx] = {
          ...posts[idx],
          hidden: action === 'hide',
          pending: action === 'show' ? false : posts[idx].pending,
          updatedAt: new Date().toISOString(),
        };
        postById.set(posts[idx].id, posts[idx]);
      }
      await persistPosts();
      sendJson(res, 200, { posts: adminPosts() });
      return;
    }

    // --- 留言板管理 (admin) ----------------------------------------------
    // List every comment across all questions for moderation.
    if (req.method === 'GET' && url.pathname === '/api/admin/comments') {
      const all = questionComments.all().map(questionComments.adminComment);
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
      sendJson(res, 200, { comments: all });
      return;
    }

    // Hide / show / delete a single 面試篩選器 comment.
    const adminCommentMatch = url.pathname.match(/^\/api\/admin\/comments\/([a-f0-9-]{36})\/moderate$/);
    if (req.method === 'POST' && adminCommentMatch) {
      const body = await readJsonBody(req);
      const action = body.action;
      if (!['hide', 'show', 'delete'].includes(action)) {
        sendJson(res, 400, { error: 'action must be hide, show or delete' });
        return;
      }
      const ok = await questionComments.moderate(adminCommentMatch[1], action);
      if (!ok) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // 文章留言板 (admin): list every article comment, newest first. Joins the
    // article title so the admin can see which post each comment belongs to.
    if (req.method === 'GET' && url.pathname === '/api/admin/post-comments') {
      const all = postComments.all().map((comment) => ({
        ...postComments.adminComment(comment),
        postTitle: postById.get(comment.thread)?.title || '',
      }));
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      sendJson(res, 200, { comments: all });
      return;
    }

    // Hide / show / delete a single 文章 comment.
    const adminPostCommentMatch = url.pathname.match(/^\/api\/admin\/post-comments\/([a-f0-9-]{36})\/moderate$/);
    if (req.method === 'POST' && adminPostCommentMatch) {
      const body = await readJsonBody(req);
      const action = body.action;
      if (!['hide', 'show', 'delete'].includes(action)) {
        sendJson(res, 400, { error: 'action must be hide, show or delete' });
        return;
      }
      const ok = await postComments.moderate(adminPostCommentMatch[1], action);
      if (!ok) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const leaderboardMatch = url.pathname.match(/^\/api\/([a-z]+)\/leaderboard$/);
    if (req.method === 'GET' && leaderboardMatch && leaderboards[leaderboardMatch[1]]) {
      sendJson(res, 200, { leaderboard: leaderboards[leaderboardMatch[1]].leaderboard() }, cacheRead);
      return;
    }

    // --- 排行榜管理 (admin): delete a leaderboard entry by name ----------------
    const adminLbMatch = url.pathname.match(/^\/api\/admin\/([a-z]+)\/leaderboard$/);
    if (req.method === 'DELETE' && adminLbMatch && leaderboards[adminLbMatch[1]]) {
      const board = leaderboards[adminLbMatch[1]];
      const body = await readJsonBody(req);
      const name = String(body.name ?? '').trim();
      if (!name) {
        sendJson(res, 400, { error: '缺少要刪除的暱稱' });
        return;
      }
      if (!board.remove(name)) {
        sendJson(res, 404, { error: 'entry not found' });
        return;
      }
      await board.persist();
      sendJson(res, 200, { leaderboard: board.leaderboard() });
      return;
    }

    const gameMatch = url.pathname.match(/^\/api\/(checkgame|numbergame)\/(round|answer|next|score)$/);
    if (req.method === 'POST' && gameMatch) {
      const [, game, action] = gameMatch;
      const body = await readJsonBody(req);
      if (action === 'round') {
        const name = sanitizeText(typeof body.name === 'string' ? body.name : '', maxNameLength);
        if (!name) {
          sendJson(res, 400, { error: '暱稱不可為空' });
          return;
        }
        if (!allowGameStart(getClientIp(req))) {
          sendJson(res, 429, { error: '開始回合過於頻繁，請稍後再試。' });
          return;
        }
        sendJson(res, 200, gameRounds.start(game, name));
        return;
      }

      const round = gameRounds.get(game, body.roundId);
      if (action === 'answer') {
        sendJson(res, 200, gameRounds.answer(round, body.index, body.answer));
        return;
      }
      if (action === 'next') {
        sendJson(res, 200, gameRounds.next(round, body.index));
        return;
      }

      enforceVoter(req);
      const board = leaderboards[game];
      const result = await gameRounds.complete(round, async (name, score) => {
        const rank = board.record(name, score, new Date().toISOString());
        await board.persist();
        return { leaderboard: board.leaderboard(), rank, score };
      });
      sendJson(res, 200, result);
      return;
    }

    const questionId = parseQuestionId(url.pathname);
    if (req.method === 'POST' && questionId) {
      const body = await readJsonBody(req);

      const score = Number(body.score);
      const voterId = enforceVoter(req);

      if (!Number.isInteger(score) || score < 1 || score > 5) {
        sendJson(res, 400, { error: 'score must be an integer from 1 to 5' });
        return;
      }

      const votes = store.questions[String(questionId)]?.votes;
      checkVoteCapacity(votes, voterId);
      if (votes?.[voterId] !== score) {
        await setRating(questionId, voterId, score);
      }

      sendJson(res, 200, { rating: summarizeQuestion(questionId), myScore: score });
      return;
    }

    // --- 留言板 (面試篩選器題目 + 經驗分享文章) ----------------------------
    // Both boards share the same request shape; only the store + key differ. We
    // resolve which board this path targets, then run one common handler.
    const commentQuestionId = parseCommentQuestionId(url.pathname);
    const commentPostId = parsePostCommentId(url.pathname);
    const commentPost = commentPostId && postById.get(commentPostId);
    const commentTarget = commentQuestionId !== null
      ? { store: questionComments, thread: commentQuestionId }
      : isPublicPost(commentPost)
        ? { store: postComments, thread: commentPostId }
        : null;

    if (req.method === 'GET' && commentTarget) {
      const list = commentTarget.store.list(commentTarget.thread).filter((comment) => !comment.adminHidden);
      sendJson(res, 200, { comments: list.map(commentTarget.store.publicComment) });
      return;
    }

    if (req.method === 'POST' && commentTarget) {
      const body = await readJsonBody(req);

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

      const turnstile = await turnstileVerifier.verify({
        token: body.turnstileToken,
        remoteIp: getClientIp(req),
        action: 'comment-submit',
      });
      if (!turnstile.ok) {
        sendJson(res, turnstile.status, { error: turnstile.error });
        return;
      }

      const rate = checkRateLimit(getClientIp(req));
      if (!rate.ok) {
        sendJson(res, 429, { error: rate.reason });
        return;
      }

      // Moderation may run while Siteverify is in flight.
      if (commentTarget.store === postComments) {
        const post = postById.get(commentTarget.thread);
        if (!isPublicPost(post)) {
          sendJson(res, 404, { error: 'post not found' });
          return;
        }
      }
      const comment = await commentTarget.store.add(commentTarget.thread, name, text);
      if (comment.adminHidden || (commentPost && !isPublicPost(postById.get(commentPost.id)))) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }
      sendJson(res, 200, { comment: commentTarget.store.publicComment(comment) });
      return;
    }

    const voteTarget = parseCommentVote(url.pathname) || parsePostCommentVote(url.pathname);
    if (req.method === 'POST' && voteTarget) {
      const body = await readJsonBody(req);
      const existing = voteTarget.store.get(voteTarget.commentId);
      const post = voteTarget.store === postComments ? postById.get(voteTarget.thread) : null;
      if (!existing || existing.adminHidden || existing.thread !== voteTarget.thread ||
          (voteTarget.store === postComments && !isPublicPost(post))) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }

      const voterId = enforceVoter(req);
      const value = Number(body.value);

      if (![1, 0, -1].includes(value)) {
        sendJson(res, 400, { error: 'value must be 1, 0, or -1' });
        return;
      }

      if (value !== 0) checkVoteCapacity(existing.votes, voterId);
      if ((existing.votes[voterId] || 0) !== value) {
        await voteTarget.store.setVote(voteTarget.commentId, voterId, value);
      }
      if (existing.adminHidden || !voteTarget.store.get(voteTarget.commentId) ||
          (post && !isPublicPost(postById.get(post.id)))) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }
      sendJson(res, 200, { comment: voteTarget.store.publicComment(existing) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const status = error?.status || 500;
    sendJson(res, status, { error: status === 500 ? 'internal server error' : error.message });
  }
}).listen(port, bindHost, () => {
  const backend = useSqlite ? `SQLite ${process.env.DB_FILE || '/data/app.db'}` : `JSON ${dataFile}`;
  console.log(`ratings-api listening on :${port}, backend ${backend}`);
});
