// Run the TABF PDF schedule scraper locally (from Taiwan residential network)
// and push the parsed events to the GCP VM's deploy/sync-calendar.sh over SSH.
//
// Usage:
//   VM=billwang_tech@<VM_IP> npm run sync:calendar         # push over ssh (or save VM= and optional SSH_KEY= in .env.local)
//   ADMIN_TOKEN=<token> npm run sync:calendar              # push directly to https://admin.bank-interview-advisor.com (or save in .env.local)
//   npm run sync:calendar                                  # reads .env.local, or falls back to gcloud compute ssh
//   npm run sync:calendar -- --dry-run                     # scrape & print JSON only
//   npm run sync:calendar -- --local                       # push to local `npm run api:local` (http://127.0.0.1:3000)

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const scraperPath = path.join(__dirname, 'scrape-tabf-calendar.mjs');

function loadLocalEnv() {
  const file = path.join(rootDir, '.env.local');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadLocalEnv();

const REMOTE_DIR = process.env.REMOTE_DIR || '/home/billwang_tech/bank_interview123_selector';
const GCP_INSTANCE = process.env.GCP_INSTANCE || 'bankinterviewer';
const GCP_ZONE = process.env.GCP_ZONE || 'us-west1-b';
const REMOTE_CMD = `cd ${REMOTE_DIR} && bash deploy/sync-calendar.sh`;

function expandHome(p) {
  if (!p) return '';
  return p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p;
}

function runScraper() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scraperPath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Scraper exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function pushOverCommand(bin, args, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.stdin.end(payload);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${bin} exited with code ${code}`));
      else resolve();
    });
  });
}

async function pushViaAdminApi(baseUrl, token, payload) {
  const base = baseUrl.replace(/\/$/, '');
  const origin = new URL(base).origin;
  const login = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ token }),
  });
  if (!login.ok) throw new Error(`Admin login failed at ${base} (${login.status})`);
  const setCookies =
    typeof login.headers.getSetCookie === 'function'
      ? login.headers.getSetCookie()
      : [login.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies
    .map((c) => c.split(';')[0].trim())
    .find((c) => c.startsWith('__Host-admin-session=') || c.startsWith('admin-session='));
  if (!cookie) throw new Error(`Admin login at ${base} did not return a session cookie`);
  try {
    const res = await fetch(`${base}/api/admin/calendar/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: payload,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Calendar sync failed (${res.status}): ${text}`);
    console.log(text);
  } finally {
    await fetch(`${base}/api/admin/session`, {
      method: 'DELETE',
      headers: { origin, cookie },
    }).catch(() => {});
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const localMode = args.has('--local');

  const payload = await runScraper();

  if (dryRun) {
    process.stdout.write(payload);
    return;
  }

  if (localMode) {
    const localUrl = process.env.LOCAL_API_URL || 'http://127.0.0.1:3000';
    console.error(`[sync-local] pushing to local API (${localUrl})...`);
    await pushViaAdminApi(localUrl, process.env.ADMIN_TOKEN || 'local-admin', payload);
    return;
  }

  const vmTarget = (process.env.VM || '').trim();
  if (vmTarget) {
    const sshKey = expandHome((process.env.SSH_KEY || '').trim());
    const sshArgs = [];
    if (sshKey) sshArgs.push('-i', sshKey);
    sshArgs.push(vmTarget, REMOTE_CMD);
    console.error(`[sync-local] pushing to ${vmTarget} via ssh...`);
    await pushOverCommand('ssh', sshArgs, payload);
    return;
  }

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (adminToken) {
    const adminUrl = (process.env.ADMIN_URL || 'https://admin.bank-interview-advisor.com').trim();
    console.error(`[sync-local] pushing to ${adminUrl} via admin API...`);
    await pushViaAdminApi(adminUrl, adminToken, payload);
    return;
  }

  console.error(`[sync-local] pushing to ${GCP_INSTANCE} (${GCP_ZONE}) via gcloud compute ssh...`);
  try {
    await pushOverCommand(
      'gcloud',
      ['compute', 'ssh', GCP_INSTANCE, '--zone', GCP_ZONE, '--command', REMOTE_CMD],
      payload,
    );
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        '本機未安裝 gcloud CLI。請改用以下任一方式（也可寫入已 gitignore 的 .env.local 一次設定）：\n' +
          '  1. SSH：VM=billwang_tech@你的VM_IP npm run sync:calendar（有私鑰可加 SSH_KEY=~/.ssh/...）\n' +
          '  2. 後台 HTTPS API：ADMIN_TOKEN=你的後台金鑰 npm run sync:calendar',
      );
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`[sync-local] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
