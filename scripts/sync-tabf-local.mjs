// Run the TABF PDF schedule scraper locally (from Taiwan residential network)
// and push the parsed events to the GCP VM's deploy/sync-calendar.sh over SSH.
//
// Usage:
//   npm run sync:calendar                                  # uses gcloud compute ssh (bankinterviewer / us-west1-b)
//   VM=billwang_tech@<VM_IP> npm run sync:calendar         # uses plain ssh
//   npm run sync:calendar -- --dry-run                     # scrape & print JSON only
//   npm run sync:calendar -- --local                       # push to local `npm run api:local` (http://127.0.0.1:3000)

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scraperPath = path.join(__dirname, 'scrape-tabf-calendar.mjs');

const REMOTE_DIR = process.env.REMOTE_DIR || '/home/billwang_tech/bank_interview123_selector';
const GCP_INSTANCE = process.env.GCP_INSTANCE || 'bankinterviewer';
const GCP_ZONE = process.env.GCP_ZONE || 'us-west1-b';
const REMOTE_CMD = `cd ${REMOTE_DIR} && bash deploy/sync-calendar.sh`;

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

async function pushLocal(payload) {
  const base = (process.env.LOCAL_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const token = process.env.ADMIN_TOKEN || 'local-admin';
  const login = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ token }),
  });
  if (!login.ok) throw new Error(`Local admin login failed (${login.status})`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  try {
    const res = await fetch(`${base}/api/admin/calendar/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, cookie },
      body: payload,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Local calendar sync failed (${res.status}): ${text}`);
    console.log(text);
  } finally {
    await fetch(`${base}/api/admin/session`, {
      method: 'DELETE',
      headers: { origin: base, cookie },
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
    console.error('[sync-local] pushing to local API...');
    await pushLocal(payload);
    return;
  }

  const vmTarget = (process.env.VM || '').trim();
  if (vmTarget) {
    console.error(`[sync-local] pushing to ${vmTarget} via ssh...`);
    await pushOverCommand('ssh', [vmTarget, REMOTE_CMD], payload);
    return;
  }

  console.error(`[sync-local] pushing to ${GCP_INSTANCE} (${GCP_ZONE}) via gcloud compute ssh...`);
  await pushOverCommand(
    'gcloud',
    ['compute', 'ssh', GCP_INSTANCE, '--zone', GCP_ZONE, '--command', REMOTE_CMD],
    payload,
  );
}

main().catch((error) => {
  console.error(`[sync-local] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
