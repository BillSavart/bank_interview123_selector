import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.RATINGS_FILE || '/data/ratings.json';
const maxQuestionId = Number(process.env.MAX_QUESTION_ID || 123);

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
      if (body.length > 4096) {
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

await loadStore();

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

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const status = error?.status || 500;
    sendJson(res, status, { error: status === 500 ? 'internal server error' : error.message });
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`ratings-api listening on :${port}, data file ${dataFile}`);
});
