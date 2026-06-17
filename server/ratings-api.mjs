import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { openDb, calendarColumns } from './db.mjs';

const port = Number(process.env.PORT || 3000);
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
const checkGameMaxScore = Number(process.env.CHECKGAME_MAX_SCORE || 100000);

const numberGameFile = process.env.NUMBERGAME_FILE || '/data/numbergame-top.json';
const numberGameTopN = Number(process.env.NUMBERGAME_TOP_N || 10);
const numberGameMaxScore = Number(process.env.NUMBERGAME_MAX_SCORE || 100000);

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

const makeLeaderboard = ({ game, file, topN, maxScore }) => {
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

  return { load, persist, record, remove, leaderboard: () => top, maxScore };
};

// One leaderboard per mini-game, keyed by the URL slug used in /api/<game>/*.
const leaderboards = {
  checkgame: makeLeaderboard({ game: 'checkgame', file: checkGameFile, topN: checkGameTopN, maxScore: checkGameMaxScore }),
  numbergame: makeLeaderboard({ game: 'numbergame', file: numberGameFile, topN: numberGameTopN, maxScore: numberGameMaxScore }),
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
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM calendar_events').all();
    calendarEvents = sortCalendar(
      rows.map((r) => ({
        id: String(r.id),
        // DB columns are snake_case; cleanCalendarInput keys on the camelCase
        // form names, so map them back via the shared calendarColumns table.
        ...cleanCalendarInput(Object.fromEntries(calendarColumns.map(([col, jsonKey]) => [jsonKey, r[col]]))),
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
      })),
    );
    if (pruneCalendar() > 0) await persistCalendar();
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
  if (useSqlite) {
    const cols = ['id', ...calendarColumns.map(([col]) => col), 'created_at', 'updated_at'];
    const ins = db.prepare(`INSERT OR REPLACE INTO calendar_events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    db.transaction(() => {
      db.prepare('DELETE FROM calendar_events').run();
      for (const e of calendarEvents) {
        ins.run(String(e.id), ...calendarColumns.map(([, jsonKey]) => String(e[jsonKey] ?? '')), String(e.createdAt || ''), String(e.updatedAt || ''));
      }
    })();
    return Promise.resolve();
  }
  calendarWriteQueue = calendarWriteQueue.then(async () => {
    await mkdir(dirname(calendarFile), { recursive: true });
    const tmpFile = `${calendarFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpFile, `${JSON.stringify(calendarEvents, null, 2)}\n`);
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
    .filter((p) => !p.hidden)
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
  return { store: questionComments, commentId: match[2] };
};

// 文章留言：以文章 id（UUID）為 thread key，與題目留言的整數題號分流。
const parsePostCommentId = (pathname) => {
  const match = pathname.match(/^\/api\/post-comments\/([a-f0-9-]{36})$/);
  return match ? match[1] : null;
};

const parsePostCommentVote = (pathname) => {
  const match = pathname.match(/^\/api\/post-comments\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/vote$/);
  if (!match) return null;
  return { store: postComments, commentId: match[2] };
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

    // --- 經驗分享 (experience posts) -------------------------------------
    // Public read: visible posts only, newest first.
    if (req.method === 'GET' && url.pathname === '/api/posts') {
      sendJson(res, 200, { posts: posts.filter((p) => !p.hidden).map(publicPost) }, cacheRead);
      return;
    }

    // Public 投稿：任何人都能投稿一篇文章，但一律先存成 hidden + pending（待審核），
    // 要等管理員在後台「顯示」後才會出現在 /api/posts。與後台發文走不同路徑。
    if (req.method === 'POST' && url.pathname === '/api/posts') {
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }
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
      const rate = checkRateLimit(getClientIp(req));
      if (!rate.ok) {
        sendJson(res, 429, { error: rate.reason });
        return;
      }
      const now = new Date().toISOString();
      const post = { id: randomUUID(), slug: uniqueSlug(), ...fields, hidden: true, pending: true, createdAt: now, updatedAt: now, votes: {} };
      posts.push(post);
      postById.set(post.id, post);
      sortPosts(posts);
      await persistPosts();
      sendJson(res, 200, { ok: true });
      return;
    }

    // 動態 SEO：伺服器端渲染的單篇文章頁（Caddy 只把爬蟲 UA 導到這裡）。
    const articleMatch = url.pathname.match(/^\/experience\/([a-f0-9-]{36})$/);
    if (req.method === 'GET' && articleMatch) {
      const post = posts.find((p) => p.id === articleMatch[1] && !p.hidden);
      if (!post) {
        sendHtml(res, 404, render404Html());
        return;
      }
      sendHtml(res, 200, renderArticleHtml(post), 'public, max-age=0, s-maxage=60');
      return;
    }

    // 短網址：/e/<slug> → 302 轉到 /experience/<id>（找不到就回文章列表）。
    const shortMatch = url.pathname.match(/^\/e\/([0-9A-Za-z]{6})$/);
    if (req.method === 'GET' && shortMatch) {
      const post = posts.find((p) => p.slug === shortMatch[1] && !p.hidden);
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
        'Cache-Control': 'public, max-age=0, s-maxage=300',
      });
      res.end(renderPostsSitemap());
      return;
    }

    // Public read: a single visible post by id (powers the per-article URL).
    const postReadMatch = url.pathname.match(/^\/api\/posts\/([a-f0-9-]{36})$/);
    if (req.method === 'GET' && postReadMatch) {
      const post = posts.find((p) => p.id === postReadMatch[1] && !p.hidden);
      if (!post) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      sendJson(res, 200, { post: publicPost(post) }, cacheRead);
      return;
    }

    // 對文章按讚 / 倒讚。value: 1（讚）, -1（倒讚）, 0（取消）。
    const postVoteMatch = url.pathname.match(/^\/api\/posts\/([a-f0-9-]{36})\/vote$/);
    if (req.method === 'POST' && postVoteMatch) {
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
      const post = postById.get(postVoteMatch[1]);
      if (!post || post.hidden) {
        sendJson(res, 404, { error: 'post not found' });
        return;
      }
      if (value === 0) delete post.votes[voterId];
      else post.votes[voterId] = value;
      await appendPostVote({ postId: post.id, voterId, value });
      sendJson(res, 200, { post: publicPost(post) });
      return;
    }

    // Admin: list every post (including hidden) for management.
    if (req.method === 'GET' && url.pathname === '/api/admin/posts') {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      sendJson(res, 200, { posts: adminPosts() });
      return;
    }

    // Admin: create a post.
    if (req.method === 'POST' && url.pathname === '/api/admin/posts') {
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (posts.length >= maxPosts) {
        sendJson(res, 400, { error: '文章數量已達上限' });
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
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const all = questionComments.all().map(questionComments.adminComment);
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
      sendJson(res, 200, { comments: all });
      return;
    }

    // Hide / show / delete a single 面試篩選器 comment.
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
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
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
      if (!isAdmin(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const board = leaderboards[adminLbMatch[1]];
      const bodyText = await readBody(req);
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        sendJson(res, 400, { error: 'request body must be valid JSON' });
        return;
      }
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

      await setRating(questionId, voterId, score);

      sendJson(res, 200, { rating: summarizeQuestion(questionId), myScore: score });
      return;
    }

    // --- 留言板 (面試篩選器題目 + 經驗分享文章) ----------------------------
    // Both boards share the same request shape; only the store + key differ. We
    // resolve which board this path targets, then run one common handler.
    const commentQuestionId = parseCommentQuestionId(url.pathname);
    const commentPostId = parsePostCommentId(url.pathname);
    const commentTarget = commentQuestionId !== null
      ? { store: questionComments, thread: commentQuestionId }
      : commentPostId !== null && postById.has(commentPostId)
        ? { store: postComments, thread: commentPostId }
        : null;

    if (req.method === 'GET' && commentTarget) {
      const list = commentTarget.store.list(commentTarget.thread);
      sendJson(res, 200, { comments: list.map(commentTarget.store.publicComment) }, cacheRead);
      return;
    }

    if (req.method === 'POST' && commentTarget) {
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

      const comment = await commentTarget.store.add(commentTarget.thread, name, text);
      sendJson(res, 200, { comment: commentTarget.store.publicComment(comment) });
      return;
    }

    const voteTarget = parseCommentVote(url.pathname) || parsePostCommentVote(url.pathname);
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

      const comment = await voteTarget.store.setVote(voteTarget.commentId, voterId, value);
      if (!comment) {
        sendJson(res, 404, { error: 'comment not found' });
        return;
      }

      sendJson(res, 200, { comment: voteTarget.store.publicComment(comment) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const status = error?.status || 500;
    sendJson(res, status, { error: status === 500 ? 'internal server error' : error.message });
  }
}).listen(port, '0.0.0.0', () => {
  const backend = useSqlite ? `SQLite ${process.env.DB_FILE || '/data/app.db'}` : `JSON ${dataFile}`;
  console.log(`ratings-api listening on :${port}, backend ${backend}`);
});
