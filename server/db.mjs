// SQLite schema + connection helper for the ratings/comments/posts API.
//
// Phase 0 of the JSON → SQLite migration: this module only *defines* the
// database. The live API (server/ratings-api.mjs) still reads/writes the JSON
// and JSONL files; nothing here is wired into request handling yet. That swap
// is Phase 2. Keeping schema separate means the one-off migration script
// (server/migrate-to-sqlite.mjs) and the future API can share one source of
// truth for the table layout.
//
// Design notes:
// - Single file `/data/app.db` lives in the same persisted volume as today's
//   JSON, so backup / move stays "copy one file".
// - WAL mode gives concurrent readers + a single writer without blocking, which
//   is plenty for a tiny VM and removes the whole-file-rewrite race the JSON
//   store has today.
// - The two comment boards (面試題目留言 / 經驗分享文章留言) share one `comments`
//   table discriminated by `board`, mirroring the single generic makeCommentStore
//   in the API. Comment ids are UUIDs (unique across boards), so `comment_votes`
//   needs no board column.
// - The three `*-mods.jsonl` moderation logs collapse into the `admin_hidden`
//   column (hide/show) and row deletion (delete) — no separate table needed.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const defaultDbFile = process.env.DB_FILE || '/data/app.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ratings (
  question_id INTEGER NOT NULL,
  voter_id    TEXT    NOT NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  PRIMARY KEY (question_id, voter_id)
);

-- Both comment boards. board = 'question' | 'post'.
-- thread is stored as TEXT (question題號 stored as its decimal string).
CREATE TABLE IF NOT EXISTS comments (
  id           TEXT    PRIMARY KEY,
  board        TEXT    NOT NULL CHECK (board IN ('question','post')),
  thread       TEXT    NOT NULL,
  name         TEXT    NOT NULL DEFAULT '匿名',
  text         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL,
  admin_hidden INTEGER NOT NULL DEFAULT 0  -- replayed from *-mods.jsonl (hide/show)
);
CREATE INDEX IF NOT EXISTS idx_comments_board_thread ON comments (board, thread, created_at);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id TEXT    NOT NULL,
  voter_id   TEXT    NOT NULL,
  value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (comment_id, voter_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT    PRIMARY KEY,
  slug       TEXT    NOT NULL DEFAULT '',
  category   TEXT    NOT NULL DEFAULT 'exam',
  title      TEXT    NOT NULL DEFAULT '',
  author     TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  pending    INTEGER NOT NULL DEFAULT 0,  -- 使用者投稿、待審核公開
  created_at TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category, created_at);

CREATE TABLE IF NOT EXISTS post_votes (
  post_id  TEXT    NOT NULL,
  voter_id TEXT    NOT NULL,
  value    INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (post_id, voter_id)
);

-- 招考行事曆。固定欄位（對應 ratings-api.mjs 的 calendarFields）。
CREATE TABLE IF NOT EXISTS calendar_events (
  id             TEXT PRIMARY KEY,
  org            TEXT NOT NULL DEFAULT '',
  signup_start   TEXT NOT NULL DEFAULT '',
  signup_end     TEXT NOT NULL DEFAULT '',
  written_exam   TEXT NOT NULL DEFAULT '',
  answer_key     TEXT NOT NULL DEFAULT '',
  written_result TEXT NOT NULL DEFAULT '',
  interview      TEXT NOT NULL DEFAULT '',
  interview2     TEXT NOT NULL DEFAULT '',
  final_result   TEXT NOT NULL DEFAULT '',
  link           TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT '',
  updated_at     TEXT NOT NULL DEFAULT ''
);

-- 小遊戲排行榜。game 區分各遊戲，每個遊戲每個名字最多一列。
CREATE TABLE IF NOT EXISTS leaderboard (
  game       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (game, name)
);
`;

// The fixed calendar columns, paired with their JSON field names. Shared with
// the migration script so the column order stays in one place.
export const calendarColumns = [
  ['org', 'org'],
  ['signup_start', 'signupStart'],
  ['signup_end', 'signupEnd'],
  ['written_exam', 'writtenExam'],
  ['answer_key', 'answerKey'],
  ['written_result', 'writtenResult'],
  ['interview', 'interview'],
  ['interview2', 'interview2'],
  ['final_result', 'finalResult'],
  ['link', 'link'],
  ['note', 'note'],
];

// Open (creating if needed) the SQLite database at `file`, apply pragmas, and
// ensure the schema exists. Returns the better-sqlite3 handle.
export const openDb = (file = defaultDbFile) => {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
};
