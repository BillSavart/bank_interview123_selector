// Parity check: JSON backend vs SQLite backend (Phase 2 of the migration).
//
// Builds a synthetic fixture that exercises every replay rule (rating votes,
// comment up/down with last-write-wins + 0-clear, hide/show/delete moderation,
// hidden/pending posts, post votes), migrates it into a temp SQLite DB with the
// real migration script, then boots server/ratings-api.mjs twice — once on the
// JSON fixture, once on the migrated DB — and asserts every read endpoint
// returns byte-identical JSON. Finally it does a write → restart → read-back
// round-trip against the SQLite DB to prove persistence survives a reboot.
//
// Run: node server/parity-check.mjs   (no production data touched — temp dir only)

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ADMIN = 'parity-admin-token';
const api = new URL('./ratings-api.mjs', import.meta.url).pathname;
const migrate = new URL('./migrate-to-sqlite.mjs', import.meta.url).pathname;

let passed = 0;
let failed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};
const bad = (label, a, b) => {
  failed++;
  console.log(`  ✗ ${label}`);
  console.log(`     JSON   : ${a}`);
  console.log(`     SQLite : ${b}`);
};
// Response key order is produced by the same shaping code in both modes, so a
// stringify compare is a strict equality check (catches order + value diffs).
const same = (label, a, b) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) ok(label);
  else bad(label, sa, sb);
};
const eq = (label, actual, expected) => {
  const sa = JSON.stringify(actual);
  const se = JSON.stringify(expected);
  if (sa === se) ok(label);
  else bad(label, se, sa);
};

// ---- fixture ---------------------------------------------------------------
const POST1 = randomUUID(); // visible
const POST2 = randomUUID(); // admin-hidden
const POST3 = randomUUID(); // user submission: hidden + pending
const QC1 = randomUUID();
const QC2 = randomUUID();
const QC3 = randomUUID(); // will be deleted via mod log
const PC1 = randomUUID();

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

const writeFixture = (dir) => {
  const f = (name) => join(dir, name);

  writeFileSync(
    f('ratings.json'),
    JSON.stringify({
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: {
        1: { votes: { va: 5, vb: 4, vc: 3 } },
        2: { votes: { vd: 1 } },
        7: { votes: { ve: 2, vf: 2, vg: 5 } },
      },
    }),
  );

  // 面試題目留言板
  writeFileSync(
    f('comments.jsonl'),
    jsonl([
      { questionId: 1, id: QC1, name: 'Alice', text: 'first', createdAt: '2026-01-02T01:00:00.000Z' },
      { questionId: 1, id: QC2, name: '匿名', text: 'second', createdAt: '2026-01-02T02:00:00.000Z' },
      { questionId: 2, id: QC3, name: 'Carol', text: 'doomed', createdAt: '2026-01-02T03:00:00.000Z' },
    ]),
  );
  writeFileSync(
    f('comment-votes.jsonl'),
    jsonl([
      { commentId: QC1, voterId: 'voter-aaaaaa', value: 1 },
      { commentId: QC1, voterId: 'voter-bbbbbb', value: -1 },
      { commentId: QC1, voterId: 'voter-aaaaaa', value: 1 }, // repeat, last-write-wins
      { commentId: QC2, voterId: 'voter-cccccc', value: 1 },
      { commentId: QC2, voterId: 'voter-cccccc', value: 0 }, // cleared
      { commentId: QC3, voterId: 'voter-dddddd', value: 1 }, // on doomed comment
    ]),
  );
  writeFileSync(
    f('comment-mods.jsonl'),
    jsonl([
      { commentId: QC2, action: 'hide', at: '2026-01-03T00:00:00.000Z' },
      { commentId: QC2, action: 'show', at: '2026-01-03T01:00:00.000Z' }, // net visible
      { commentId: QC1, action: 'hide', at: '2026-01-03T02:00:00.000Z' }, // stays hidden
      { commentId: QC3, action: 'delete', at: '2026-01-03T03:00:00.000Z' },
    ]),
  );

  // 文章留言板
  writeFileSync(
    f('post-comments.jsonl'),
    jsonl([{ postId: POST1, id: PC1, name: 'Reader', text: 'nice post', createdAt: '2026-01-04T00:00:00.000Z' }]),
  );
  writeFileSync(
    f('post-comment-votes.jsonl'),
    jsonl([
      { commentId: PC1, voterId: 'voter-eeeeee', value: 1 },
      { commentId: PC1, voterId: 'voter-ffffff', value: 1 },
    ]),
  );
  writeFileSync(f('post-comment-mods.jsonl'), '');

  // 經驗分享文章
  writeFileSync(
    f('posts.json'),
    JSON.stringify([
      { id: POST1, slug: 'aaaaaa', category: 'exam', title: '可見文章', author: '作者A', content: '內文一\n\n第二段', hidden: false, pending: false, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
      { id: POST2, slug: 'bbbbbb', category: 'work', title: '隱藏文章', author: '作者B', content: '看不到', hidden: true, pending: false, createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
      { id: POST3, slug: 'cccccc', category: 'exam', title: '待審投稿', author: '路人', content: '審核中', hidden: true, pending: true, createdAt: '2026-02-03T00:00:00.000Z', updatedAt: '2026-02-03T00:00:00.000Z' },
    ]),
  );
  writeFileSync(
    f('post-votes.jsonl'),
    jsonl([
      { postId: POST1, voterId: 'voter-gggggg', value: 1 },
      { postId: POST1, voterId: 'voter-hhhhhh', value: -1 },
      { postId: POST1, voterId: 'voter-gggggg', value: 1 }, // repeat
      { postId: POST2, voterId: 'voter-iiiiii', value: 1 }, // on hidden post
      { postId: 'nonexistent-post-id', voterId: 'voter-xxxxxx', value: 1 }, // ignored
    ]),
  );

  // calendar + leaderboards read the same JSON in both modes (Batch B not done).
  writeFileSync(
    f('calendar.json'),
    JSON.stringify([{ id: randomUUID(), org: '某銀行', signupStart: '2026-06-01', writtenExam: '2026-07-01', interview: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]),
  );
  writeFileSync(f('checkgame-top.json'), JSON.stringify([{ name: 'Champ', score: 999, createdAt: '2026-01-01T00:00:00.000Z' }]));
  writeFileSync(f('numbergame-top.json'), JSON.stringify([{ name: 'Pro', score: 555, createdAt: '2026-01-01T00:00:00.000Z' }]));
};

// env mapping the API/migration file paths into the temp dir
const fileEnv = (dir) => {
  const f = (name) => join(dir, name);
  return {
    RATINGS_FILE: f('ratings.json'),
    COMMENTS_FILE: f('comments.jsonl'),
    COMMENT_VOTES_FILE: f('comment-votes.jsonl'),
    COMMENT_MOD_FILE: f('comment-mods.jsonl'),
    POST_COMMENTS_FILE: f('post-comments.jsonl'),
    POST_COMMENT_VOTES_FILE: f('post-comment-votes.jsonl'),
    POST_COMMENT_MOD_FILE: f('post-comment-mods.jsonl'),
    CHECKGAME_FILE: f('checkgame-top.json'),
    NUMBERGAME_FILE: f('numbergame-top.json'),
    CALENDAR_FILE: f('calendar.json'),
    POSTS_FILE: f('posts.json'),
    POST_VOTES_FILE: f('post-votes.jsonl'),
  };
};

const run = (file, env) =>
  new Promise((resolve, reject) => {
    const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`))));
    p.on('error', reject);
  });

const waitHealthy = async (base) => {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server at ${base} never became healthy`);
};

const startServer = async (port, env) => {
  const p = spawn('node', [api], {
    // Relax the anti-spam limiter so the rapid round-trip writes aren't throttled.
    env: { ...process.env, PORT: String(port), ADMIN_TOKEN: ADMIN, COMMENT_MIN_INTERVAL_MS: '0', COMMENT_MAX_PER_WINDOW: '100000', ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const base = `http://127.0.0.1:${port}`;
  await waitHealthy(base);
  return {
    base,
    stop: () =>
      new Promise((resolve) => {
        p.on('exit', () => resolve());
        p.kill();
      }),
  };
};

const getJson = async (base, path, admin = false) => {
  const r = await fetch(`${base}${path}`, admin ? { headers: { authorization: `Bearer ${ADMIN}` } } : undefined);
  return { status: r.status, body: await r.json() };
};
const postJson = (base, path, body, admin = false) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const main = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const dbFile = join(dir, 'app.db');
  writeFixture(dir);

  // Build the SQLite DB from the same fixture with the real migration script.
  await run(migrate, { ...fileEnv(dir), DB_FILE: dbFile });

  // As of Batch B every store (incl. calendar + leaderboards) loads from the DB
  // in SQLite mode, so the SQLite server gets NO JSON file paths — proving the
  // data really comes from app.db, not stray JSON files.
  const sqliteEnv = { USE_SQLITE: '1', DB_FILE: dbFile };
  const jsonSrv = await startServer(4601, fileEnv(dir));
  const sqlSrv = await startServer(4602, sqliteEnv);

  console.log('\n── Read parity: JSON vs SQLite ──');
  const readPaths = [
    ['GET /api/ratings', '/api/ratings'],
    ['GET /api/comments/1', '/api/comments/1'],
    ['GET /api/comments/2 (deleted comment gone)', '/api/comments/2'],
    ['GET /api/posts (public, visible only)', '/api/posts'],
    [`GET /api/posts/${POST1}`, `/api/posts/${POST1}`],
    [`GET /api/posts/${POST2} (hidden → 404)`, `/api/posts/${POST2}`],
    [`GET /api/post-comments/${POST1}`, `/api/post-comments/${POST1}`],
    ['GET /api/calendar', '/api/calendar'],
    ['GET /api/checkgame/leaderboard', '/api/checkgame/leaderboard'],
    ['GET /api/numbergame/leaderboard', '/api/numbergame/leaderboard'],
  ];
  for (const [label, path] of readPaths) {
    const [j, s] = await Promise.all([getJson(jsonSrv.base, path), getJson(sqlSrv.base, path)]);
    same(`${label}  (status ${j.status})`, { status: j.status, body: j.body }, { status: s.status, body: s.body });
  }

  console.log('\n── Read parity: admin endpoints ──');
  const adminPaths = [
    ['GET /api/admin/posts (all incl hidden/pending)', '/api/admin/posts'],
    ['GET /api/admin/comments', '/api/admin/comments'],
    ['GET /api/admin/post-comments', '/api/admin/post-comments'],
  ];
  for (const [label, path] of adminPaths) {
    const [j, s] = await Promise.all([getJson(jsonSrv.base, path, true), getJson(sqlSrv.base, path, true)]);
    same(label, j.body, s.body);
  }

  await Promise.all([jsonSrv.stop(), sqlSrv.stop()]);

  // ---- write → restart → read-back round-trip (SQLite only) ----------------
  console.log('\n── SQLite write → restart → read-back ──');
  const NEWVOTER = 'roundtrip-voter-1';
  let srv = await startServer(4603, sqliteEnv);

  // 1) new rating on a fresh question
  await postJson(srv.base, '/api/ratings/9', { score: 4, voterId: NEWVOTER });
  // 2) new comment on thread 1
  const added = await postJson(srv.base, '/api/comments/1', { text: 'round-trip comment', name: 'RT' });
  const newCommentId = added.body.comment?.id;
  // 3) vote that new comment up
  await postJson(srv.base, `/api/comments/1/${newCommentId}/vote`, { voterId: NEWVOTER, value: 1 });
  // 4) admin hide the originally-visible comment QC2
  await postJson(srv.base, `/api/admin/comments/${QC2}/moderate`, { action: 'hide' }, true);
  // 5) public post submission (hidden + pending)
  const submitted = await postJson(srv.base, '/api/posts', { title: '投稿標題', content: '投稿內文', author: '投稿人', category: 'work' });
  // 6) admin delete the hidden post POST2 (and its votes)
  await postJson(srv.base, `/api/admin/posts/${POST2}/moderate`, { action: 'delete' }, true);
  // 7) vote on POST1
  await postJson(srv.base, `/api/posts/${POST1}/vote`, { voterId: NEWVOTER, value: 1 });
  // 8) calendar: create two events, edit one, delete the other
  const calA = await postJson(srv.base, '/api/admin/calendar', { org: '甲銀行', signupStart: '2026-08-01' }, true);
  const calAId = calA.body.event?.id;
  const calB = await postJson(srv.base, '/api/admin/calendar', { org: '乙銀行', signupStart: '2026-08-15' }, true);
  const calBId = calB.body.event?.id;
  await fetch(`${srv.base}/api/admin/calendar/${calAId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ org: '甲銀行（已改名）', signupStart: '2026-08-01' }),
  });
  await fetch(`${srv.base}/api/admin/calendar/${calBId}`, { method: 'DELETE', headers: { authorization: `Bearer ${ADMIN}` } });
  // 9) leaderboard: submit a score, delete the fixture champion
  await postJson(srv.base, '/api/checkgame/score', { name: 'RoundTrip', score: 12345 });
  await fetch(`${srv.base}/api/admin/checkgame/leaderboard`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ name: 'Champ' }),
  });

  await srv.stop();
  // Reopen a brand-new process on the same DB: everything must have persisted.
  srv = await startServer(4604, sqliteEnv);

  const ratings = (await getJson(srv.base, '/api/ratings')).body.ratings;
  eq('rating q9 persisted (avg 4, count 1)', ratings.find((r) => r.questionId === 9), { questionId: 9, count: 1, average: 4 });

  const c1 = (await getJson(srv.base, '/api/comments/1')).body.comments;
  const rt = c1.find((c) => c.id === newCommentId);
  eq('new comment persisted with text', rt?.text, 'round-trip comment');
  eq('new comment upvote persisted (score 1)', rt?.score, 1);
  const qc2 = c1.find((c) => c.id === QC2);
  eq('QC2 admin-hide persisted (hidden=true)', qc2?.hidden, true);

  const adminPosts = (await getJson(srv.base, '/api/admin/posts', true)).body.posts;
  eq('POST2 delete persisted (gone from admin list)', adminPosts.some((p) => p.id === POST2), false);
  const sub = adminPosts.find((p) => p.title === '投稿標題');
  eq('submission persisted as hidden+pending', sub ? { hidden: sub.hidden, pending: sub.pending } : null, { hidden: true, pending: true });

  const post1 = (await getJson(srv.base, `/api/posts/${POST1}`)).body.post;
  eq('POST1 vote persisted (up=2 from fixture+roundtrip)', post1?.up, 2);

  const cal = (await getJson(srv.base, '/api/admin/calendar', true)).body.events;
  eq('calendar edit persisted (org renamed)', cal.find((e) => e.id === calAId)?.org, '甲銀行（已改名）');
  eq('calendar delete persisted (event gone)', cal.some((e) => e.id === calBId), false);

  const lb = (await getJson(srv.base, '/api/checkgame/leaderboard')).body.leaderboard;
  eq('leaderboard score persisted', lb.find((e) => e.name === 'RoundTrip')?.score, 12345);
  eq('leaderboard delete persisted (Champ gone)', lb.some((e) => e.name === 'Champ'), false);

  await srv.stop();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n${failed === 0 ? '✅ PARITY OK' : '❌ PARITY FAILED'} — ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
