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
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import checkGameData from '../src/data/checkGame.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';

const ADMIN = 'parity-admin-token';
const today = new Date().toISOString().slice(0, 10);
const children = new Set();
let fixtureDir;
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
    JSON.stringify([{ id: randomUUID(), org: '某銀行', signupStart: today, writtenExam: today, interview: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]),
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

const startServer = async (env) => {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const p = spawn(process.execPath, [api], {
    env: {
      PATH: process.env.PATH, PORT: String(port), NODE_ENV: 'test', ADMIN_TOKEN: ADMIN,
      COMMENT_MIN_INTERVAL_MS: '0', COMMENT_MAX_PER_WINDOW: '1000000', ...env,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  children.add(p);
  p.once('exit', () => children.delete(p));
  const base = `http://127.0.0.1:${port}`;
  await waitHealthy(base);
  const session = await request(base, '/api/admin/session', { method: 'POST', body: { token: ADMIN } });
  if (session.status !== 200) throw new Error('test administrator could not log in');
  return {
    base,
    cookie: session.cookie,
    stop: () => new Promise((resolve) => {
      p.once('exit', resolve);
      p.kill();
    }),
  };
};

async function request(base, path, { method = 'GET', body, cookie, origin = base, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...headers,
      ...(cookie ? { cookie } : {}),
      ...(method !== 'GET' ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    setCookie: response.headers.get('set-cookie'),
  };
}

const getJson = (base, path, cookie) => request(base, path, { cookie });
const postJson = async (base, path, body, cookie) => {
  const options = { method: 'POST', body, cookie };
  const response = await request(base, path, options);
  if (response.status !== 429) return response;
  await sleep(1100);
  return request(base, path, options);
};

const main = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  fixtureDir = dir;
  const dbFile = join(dir, 'app.db');
  writeFixture(dir);

  // Build the SQLite DB from the same fixture with the real migration script.
  await run(migrate, { ...fileEnv(dir), DB_FILE: dbFile });

  // As of Batch B every store (incl. calendar + leaderboards) loads from the DB
  // in SQLite mode, so the SQLite server gets NO JSON file paths — proving the
  // data really comes from app.db, not stray JSON files.
  const sqliteEnv = { USE_SQLITE: '1', DB_FILE: dbFile };
  const jsonSrv = await startServer(fileEnv(dir));
  const sqlSrv = await startServer(sqliteEnv);

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
    const [j, s] = await Promise.all([getJson(jsonSrv.base, path, jsonSrv.cookie), getJson(sqlSrv.base, path, sqlSrv.cookie)]);
    same(label, j.body, s.body);
  }

  await Promise.all([jsonSrv.stop(), sqlSrv.stop()]);

  // ---- write → restart → read-back round-trip (SQLite only) ----------------
  console.log('\n── SQLite write → restart → read-back ──');
  let srv = await startServer(sqliteEnv);
  const enrollment = await postJson(srv.base, '/api/voter-session', {});
  const voter = enrollment.cookie;
  eq('voter identity is issued as HttpOnly', enrollment.setCookie?.includes('HttpOnly'), true);
  eq('public ratings reject caller-supplied voter IDs',
    (await postJson(srv.base, '/api/ratings/9', { score: 5, voterId: 'fake-browser-id' })).status, 403);
  eq('admin reads require a session', (await getJson(srv.base, '/api/admin/posts')).status, 401);
  eq('admin writes reject a foreign origin', (await request(srv.base, '/api/admin/posts', {
    method: 'POST', cookie: srv.cookie, origin: 'https://untrusted.example', body: {},
  })).status, 403);

  // 1) new rating on a fresh question
  await postJson(srv.base, '/api/ratings/9', { score: 1, voterId: 'fake-browser-id-1' }, voter);
  await postJson(srv.base, '/api/ratings/9', { score: 4, voterId: 'fake-browser-id-2' }, voter);
  // 2) new comment on thread 1
  const added = await postJson(srv.base, '/api/comments/1', { text: 'round-trip comment', name: 'RT' });
  const newCommentId = added.body.comment?.id;
  // 3) vote that new comment up
  eq('comment voting checks the parent thread',
    (await postJson(srv.base, `/api/comments/2/${newCommentId}/vote`, { value: 1 }, voter)).status, 404);
  await postJson(srv.base, `/api/comments/1/${newCommentId}/vote`, { value: 1 }, voter);
  // 4) admin hide the originally-visible comment QC2
  await postJson(srv.base, `/api/admin/comments/${QC2}/moderate`, { action: 'hide' }, srv.cookie);
  // 5) public post submission (hidden + pending)
  const submitted = await postJson(srv.base, '/api/posts', { title: '投稿標題', content: '投稿內文', author: '投稿人', category: 'work' });
  // 6) admin delete the hidden post POST2 (and its votes)
  await postJson(srv.base, `/api/admin/posts/${POST2}/moderate`, { action: 'delete' }, srv.cookie);
  // 7) vote on POST1
  await postJson(srv.base, `/api/posts/${POST1}/vote`, { value: 1 }, voter);
  // 8) calendar: create two events, edit one, delete the other, then test automated sync
  const calA = await postJson(srv.base, '/api/admin/calendar', {
    org: '甲銀行',
    signupStart: today,
    link: 'https://svc.tabf.org.tw/115manual01/Home/Read',
  }, srv.cookie);
  const calAId = calA.body.event?.id;
  const calB = await postJson(srv.base, '/api/admin/calendar', { org: '乙銀行', signupStart: '2026-08-15' }, srv.cookie);
  const calBId = calB.body.event?.id;
  await request(srv.base, `/api/admin/calendar/${calAId}`, {
    method: 'PUT', cookie: srv.cookie, body: {
      org: '甲銀行（已改名）',
      signupStart: today,
      link: 'https://svc.tabf.org.tw/115manual01/Home/Read',
    },
  });
  await request(srv.base, `/api/admin/calendar/${calBId}`, { method: 'DELETE', cookie: srv.cookie });

  // 8b) calendar sync: create, deduplicate pre-existing manual slug, skip out-of-window & dateless
  const syncPayload1 = {
    source: 'tabf',
    events: [
      { externalKey: 'tabf:115manual01', org: '甲銀行（爬蟲不應覆蓋）', signupStart: today, link: 'https://svc.tabf.org.tw/115manual01/' },
      { externalKey: 'tabf:115sync01', org: '自動同步銀行A', signupStart: today, writtenExam: today, link: 'https://svc.tabf.org.tw/115sync01/' },
      { externalKey: 'tabf:115sync02', org: '自動同步銀行B', signupStart: today, link: 'https://svc.tabf.org.tw/115sync02/' },
      { externalKey: 'tabf:115sync03', org: '自動同步銀行C（會被管理員刪）', signupStart: today, link: 'https://svc.tabf.org.tw/115sync03/' },
      { externalKey: 'tabf:110old01', org: '過期招考', signupStart: '2021-01-01', link: 'https://svc.tabf.org.tw/110old01/' },
      { externalKey: 'tabf:115nodate', org: '無日期招考', link: 'https://svc.tabf.org.tw/115nodate/' },
    ],
  };
  const syncRes1 = await postJson(srv.base, '/api/admin/calendar/sync', syncPayload1, srv.cookie);
  eq('calendar sync initial run counts', {
    status: syncRes1.status,
    created: syncRes1.body.summary?.created,
    skippedManual: syncRes1.body.summary?.skippedManual,
    skippedOutOfWindow: syncRes1.body.summary?.skippedOutOfWindow,
    skippedInvalid: syncRes1.body.summary?.skippedInvalid,
  }, { status: 200, created: 3, skippedManual: 1, skippedOutOfWindow: 1, skippedInvalid: 1 });

  // Idempotent re-sync + update one event
  const syncRes2 = await postJson(srv.base, '/api/admin/calendar/sync', {
    source: 'tabf',
    events: [
      { externalKey: 'tabf:115sync01', org: '自動同步銀行A', signupStart: today, writtenExam: today, note: '已更新備註', link: 'https://svc.tabf.org.tw/115sync01/' },
      { externalKey: 'tabf:115sync02', org: '自動同步銀行B', signupStart: today, link: 'https://svc.tabf.org.tw/115sync02/' },
    ],
  }, srv.cookie);
  eq('calendar sync updates changed event and leaves unchanged untouched', {
    updated: syncRes2.body.summary?.updated,
    unchanged: syncRes2.body.summary?.unchanged,
  }, { updated: 1, unchanged: 1 });

  // Admin edits 115sync02 (locks it) and deletes 115sync03 (suppresses it)
  const adminCalMid = (await getJson(srv.base, '/api/admin/calendar', srv.cookie)).body.events;
  const sync2Ev = adminCalMid.find((e) => e.link === 'https://svc.tabf.org.tw/115sync02/');
  const sync3Ev = adminCalMid.find((e) => e.link === 'https://svc.tabf.org.tw/115sync03/');
  eq('public calendar omits internal sync metadata',
    ['externalKey', 'manualEdited'].some((k) => k in (sync2Ev || {})), false);
  await request(srv.base, `/api/admin/calendar/${sync2Ev.id}`, {
    method: 'PUT', cookie: srv.cookie, body: { org: '自動同步銀行B（人工微調）', signupStart: today, link: sync2Ev.link },
  });
  await request(srv.base, `/api/admin/calendar/${sync3Ev.id}`, { method: 'DELETE', cookie: srv.cookie });

  eq('forged leaderboard score rejected',
    (await postJson(srv.base, '/api/checkgame/score', { name: 'RoundTrip', score: 100000 }, voter)).status, 409);
  let question = (await postJson(srv.base, '/api/checkgame/round', { name: 'RoundTrip' })).body;
  const roundId = question.roundId;
  eq('question payload omits answer and explanation',
    ['answer', 'explanation'].some((key) => key in question.question), false);
  eq('unfinished rounds cannot submit scores',
    (await postJson(srv.base, '/api/checkgame/score', { roundId }, voter)).status, 409);
  for (let index = 0; index < question.total; index++) {
    const answer = checkGameData.questions.find(({ id }) => id === question.question.id).answer;
    const result = await postJson(srv.base, '/api/checkgame/answer', { roundId, index, answer });
    if (!result.body.correct) throw new Error(`answer rejected: ${JSON.stringify(result.body)}`);
    if (index + 1 < question.total) {
      question = (await postJson(srv.base, '/api/checkgame/next', { roundId, index })).body;
    }
  }
  const completed = await postJson(srv.base, '/api/checkgame/score', { roundId, score: 100000 }, voter);
  eq('only server scoring is recorded', completed.body.score > 0 && completed.body.score <= 4800, true);
  const repeated = await postJson(srv.base, '/api/checkgame/score', { roundId }, voter);
  eq('score submission is idempotent', repeated.body.score, completed.body.score);
  await request(srv.base, '/api/admin/checkgame/leaderboard', {
    method: 'DELETE', cookie: srv.cookie, body: { name: 'Champ' },
  });
  eq('hidden comment cannot be recovered by voting',
    (await postJson(srv.base, `/api/comments/1/${QC2}/vote`, { value: 1 }, voter)).status, 404);
  await postJson(srv.base, `/api/admin/posts/${POST1}/moderate`, { action: 'hide' }, srv.cookie);
  eq('hidden article comments are inaccessible',
    (await getJson(srv.base, `/api/post-comments/${POST1}`)).status, 404);
  await postJson(srv.base, `/api/admin/posts/${POST1}/moderate`, { action: 'show' }, srv.cookie);
  eq('admin can log out', (await request(srv.base, '/api/admin/session', { method: 'DELETE', cookie: srv.cookie })).status, 200);
  eq('logged-out session is revoked', (await getJson(srv.base, '/api/admin/posts', srv.cookie)).status, 401);

  await srv.stop();
  // Reopen a brand-new process on the same DB: everything must have persisted.
  srv = await startServer(sqliteEnv);

  const ratings = (await getJson(srv.base, '/api/ratings')).body.ratings;
  eq('rating q9 persisted (avg 4, count 1)', ratings.find((r) => r.questionId === 9), { questionId: 9, count: 1, average: 4 });

  const c1 = (await getJson(srv.base, '/api/comments/1')).body.comments;
  const rt = c1.find((c) => c.id === newCommentId);
  eq('new comment persisted with text', rt?.text, 'round-trip comment');
  eq('new comment upvote persisted (score 1)', rt?.score, 1);
  eq('admin-hidden comment stays absent after restart', c1.some((c) => c.id === QC2), false);
  const adminComments = (await getJson(srv.base, '/api/admin/comments', srv.cookie)).body.comments;
  eq('admin can still see the hidden comment', adminComments.find((c) => c.id === QC2)?.adminHidden, true);

  const adminPosts = (await getJson(srv.base, '/api/admin/posts', srv.cookie)).body.posts;
  eq('POST2 delete persisted (gone from admin list)', adminPosts.some((p) => p.id === POST2), false);
  const sub = adminPosts.find((p) => p.title === '投稿標題');
  eq('submission persisted as hidden+pending', sub ? { hidden: sub.hidden, pending: sub.pending } : null, { hidden: true, pending: true });

  const post1 = (await getJson(srv.base, `/api/posts/${POST1}`)).body.post;
  eq('POST1 vote persisted (up=2 from fixture+roundtrip)', post1?.up, 2);

  const cal = (await getJson(srv.base, '/api/admin/calendar', srv.cookie)).body.events;
  eq('calendar edit persisted (org renamed)', cal.find((e) => e.id === calAId)?.org, '甲銀行（已改名）');
  eq('calendar delete persisted (event gone)', cal.some((e) => e.id === calBId), false);
  eq('synced calendar update persisted', cal.find((e) => e.link === 'https://svc.tabf.org.tw/115sync01/')?.note, '已更新備註');

  // Re-sync AFTER restart: locked manual edit and deleted suppression must both hold across reboot
  const syncAfterReboot = await postJson(srv.base, '/api/admin/calendar/sync', {
    source: 'tabf',
    events: [
      { externalKey: 'tabf:115sync01', org: '自動同步銀行A', signupStart: today, writtenExam: today, note: '已更新備註', link: 'https://svc.tabf.org.tw/115sync01/' },
      { externalKey: 'tabf:115sync02', org: '自動同步銀行B（不該蓋掉人工）', signupStart: today, link: 'https://svc.tabf.org.tw/115sync02/' },
      { externalKey: 'tabf:115sync03', org: '自動同步銀行C（不該復活）', signupStart: today, link: 'https://svc.tabf.org.tw/115sync03/' },
    ],
  }, srv.cookie);
  eq('calendar sync lock & suppression survive SQLite restart', {
    unchanged: syncAfterReboot.body.summary?.unchanged,
    skippedManual: syncAfterReboot.body.summary?.skippedManual,
    skippedSuppressed: syncAfterReboot.body.summary?.skippedSuppressed,
  }, { unchanged: 1, skippedManual: 1, skippedSuppressed: 1 });
  const calAfterSync = (await getJson(srv.base, '/api/calendar')).body.events;
  eq('admin-edited synced event preserved', calAfterSync.find((e) => e.link === 'https://svc.tabf.org.tw/115sync02/')?.org, '自動同步銀行B（人工微調）');
  eq('admin-deleted synced event stays absent', calAfterSync.some((e) => e.link === 'https://svc.tabf.org.tw/115sync03/'), false);

  // Calendar alert check: synced, manual-slug, suppressed, and aged-out seen keys are ignored; only brand-new triggers
  const alertCheck = await postJson(srv.base, '/api/admin/calendar/alerts', {
    source: 'tabf',
    exams: [
      { externalKey: 'tabf:115manual01', title: '甲銀行', url: 'https://svc.tabf.org.tw/115manual01/', isRegistering: true },
      { externalKey: 'tabf:115sync01', title: '自動同步銀行A', url: 'https://svc.tabf.org.tw/115sync01/', isRegistering: false },
      { externalKey: 'tabf:115sync03', title: '被刪掉的銀行C', url: 'https://svc.tabf.org.tw/115sync03/', isRegistering: false },
      { externalKey: 'tabf:110old01', title: '過期招考', url: 'https://svc.tabf.org.tw/110old01/', isRegistering: false },
      { externalKey: 'tabf:116brandnew01', title: '全新招考銀行', url: 'https://svc.tabf.org.tw/116brandnew01/', isRegistering: true },
    ],
  }, srv.cookie);
  eq('calendar alerts detects only brand-new unseen exam', {
    status: alertCheck.status,
    newCount: alertCheck.body.summary?.newCount,
    emailed: alertCheck.body.summary?.emailed,
    reason: alertCheck.body.summary?.reason,
    firstKey: alertCheck.body.summary?.newExams?.[0]?.externalKey,
  }, { status: 200, newCount: 1, emailed: false, reason: 'email_disabled', firstKey: 'tabf:116brandnew01' });

  const lb = (await getJson(srv.base, '/api/checkgame/leaderboard')).body.leaderboard;
  eq('leaderboard score persisted', lb.find((e) => e.name === 'RoundTrip')?.score, completed.body.score);
  eq('leaderboard delete persisted (Champ gone)', lb.some((e) => e.name === 'Champ'), false);

  await srv.stop();

  console.log(`\n${failed === 0 ? '✅ PARITY OK' : '❌ PARITY FAILED'} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => {
  for (const child of children) child.kill();
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});
