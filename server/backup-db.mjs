// Online backup of the SQLite database (Phase 3 of the JSON → SQLite migration).
//
// Once the JSON files are discarded, the SQLite backups ARE the safety net, so
// this must be a *correct* backup. It uses `VACUUM INTO`, which:
//   - is safe to run while the API is live (WAL mode allows concurrent readers);
//   - writes a single, consistent, defragmented file (no separate -wal/-shm to
//     keep in sync) — unlike `cp app.db`, which can capture a torn state and
//     miss data still sitting in the -wal file.
//
// Writes a timestamped copy into BACKUP_DIR and prunes all but the newest
// BACKUP_KEEP backups. Run it in the API container (which has better-sqlite3):
//   docker compose ... run --rm api node server/backup-db.mjs
// Schedule it from cron for periodic snapshots. See deploy/SQLITE-CUTOVER.md.

import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const src = process.env.DB_FILE || '/data/app.db';
const dir = process.env.BACKUP_DIR || '/data/backups';
const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14));

mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-'); // filesystem-safe
const dest = join(dir, `app-${stamp}.db`);

const db = new Database(src);
db.pragma('busy_timeout = 5000');
// VACUUM INTO writes a fresh consistent copy to `dest` (must not already exist).
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log(`backup written: ${dest}`);

// Rotation: keep the newest `keep` app-*.db snapshots, delete the rest.
const backups = readdirSync(dir)
  .filter((f) => /^app-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

for (const { f } of backups.slice(keep)) {
  unlinkSync(join(dir, f));
  console.log(`pruned old backup: ${f}`);
}

console.log(`kept ${Math.min(backups.length, keep)} backup(s) in ${dir}`);
