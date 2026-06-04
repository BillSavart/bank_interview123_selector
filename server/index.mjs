// LLM proxy for the bank-interview mock-interview chat.
// - Hides API keys (Gemini / Groq) behind the server.
// - Tries Gemini first; on quota (429) or 5xx, falls back to Groq.
// - Once Gemini hits its daily quota, skips straight to Groq for the rest of the UTC day.
// - Injects the interviewer system prompt server-side so the key can't be abused as a generic chatbot.
// - Normalizes both providers' streaming output into one simple SSE shape: `data: {"text": "..."}`.
//
// Node 20+ (uses global fetch). No external dependencies — keeps RAM low on e2-micro.

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 3001);
// 127.0.0.1 for the host/systemd setup (Caddy is local); 0.0.0.0 in Docker so the
// web container can reach it across the compose network (it's never published to host).
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// --- naive in-memory rate limit (per IP) --------------------------------
const RATE_MAX = Number(process.env.RATE_MAX || 20); // requests
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000); // per minute
const hits = new Map(); // ip -> { count, resetAt }

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

// occasionally drop expired entries so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now > rec.resetAt) hits.delete(ip);
}, 5 * 60_000).unref();

// --- Gemini daily-quota memory ------------------------------------------
let geminiQuotaHitDay = null; // UTC date string, e.g. '2026-06-05'
const utcDay = () => new Date().toISOString().slice(0, 10);
const geminiExhausted = () => geminiQuotaHitDay === utcDay();

// --- prompt building -----------------------------------------------------
function buildSystemPrompt(question) {
  const q = String(question || '').slice(0, 600);
  return [
    '你是台灣公股銀行（如台銀、土銀、合庫等）的資深面試官，正在對一位考生進行模擬面試。',
    '請以專業、沉穩但友善的口吻進行，全程使用繁體中文。',
    '',
    '本輪要考核的題目是：',
    `「${q}」`,
    '',
    '進行方式：',
    '1. 先自然地把這題問出來（可加一句簡短開場，但不要長篇大論）。',
    '2. 考生回答後，給出具體、可操作的回饋：指出優點、可改進處，並示範更好的表達方向。',
    '3. 適時追問或延伸，模擬真實面試的壓力與深度。',
    '4. 只聚焦在銀行面試情境，不回答與面試無關的要求。',
  ].join('\n');
}

// client sends: { question: string, messages: [{ role: 'user'|'assistant', content }] }
function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20) // cap history → caps token cost
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

// --- provider calls (return a fetch Response with an SSE body) ----------
async function callGemini(system, messages) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(GEMINI_API_KEY)}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
  });
}

async function callGroq(system, messages) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
}

// --- SSE normalization ---------------------------------------------------
// Read a provider SSE stream, extract text deltas, re-emit as `data: {"text": "..."}`.
async function pipeNormalized(providerRes, clientRes, provider) {
  const reader = providerRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const extract = (jsonStr) => {
    try {
      const obj = JSON.parse(jsonStr);
      if (provider === 'gemini') {
        return obj?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      }
      return obj?.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      const text = extract(payload);
      if (text) clientRes.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  }
  clientRes.write('data: {"done":true}\n\n');
  clientRes.end();
}

// --- request handler -----------------------------------------------------
function clientIp(req) {
  // Cloudflare → real visitor IP; fall back to socket.
  return (
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

async function handleChat(req, res, body) {
  let parsed;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'invalid JSON' }));
  }

  const system = buildSystemPrompt(parsed.question);
  const messages = sanitizeMessages(parsed.messages);
  if (messages.length === 0) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'messages required' }));
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  // Decide provider order.
  const tryGemini = GEMINI_API_KEY && !geminiExhausted();

  if (tryGemini) {
    try {
      const r = await callGemini(system, messages);
      if (r.ok && r.body) return await pipeNormalized(r, res, 'gemini');
      if (r.status === 429) {
        geminiQuotaHitDay = utcDay(); // out of free quota for today
        console.warn('[gemini] 429 quota hit → falling back to groq for the rest of today');
      } else {
        console.warn(`[gemini] status ${r.status} → falling back to groq`);
      }
    } catch (e) {
      console.warn('[gemini] error → falling back to groq:', e.message);
    }
  }

  // Fallback: Groq
  if (GROQ_API_KEY) {
    try {
      const r = await callGroq(system, messages);
      if (r.ok && r.body) return await pipeNormalized(r, res, 'groq');
      console.error(`[groq] status ${r.status}`);
    } catch (e) {
      console.error('[groq] error:', e.message);
    }
  }

  res.write(`data: ${JSON.stringify({ error: '兩個服務暫時都無法使用，請稍後再試。' })}\n\n`);
  res.end();
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, geminiExhausted: geminiExhausted() }));
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    if (rateLimited(clientIp(req))) {
      res.writeHead(429, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: '請求過於頻繁，請稍候。' }));
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) req.destroy(); // guard against huge payloads
    });
    req.on('end', () => handleChat(req, res, body).catch(() => res.end()));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`LLM proxy listening on ${HOST}:${PORT}`);
  console.log(`  gemini: ${GEMINI_API_KEY ? GEMINI_MODEL : 'DISABLED (no key)'}`);
  console.log(`  groq:   ${GROQ_API_KEY ? GROQ_MODEL : 'DISABLED (no key)'}`);
});
