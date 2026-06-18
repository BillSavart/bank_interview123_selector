#!/usr/bin/env bash
# One-shot JSON → SQLite cutover, run ON THE VM from the repo root:
#
#   bash deploy/cutover-to-sqlite.sh
#
# Does, in order: pre-flight → full /data backup → stop api → migrate JSON into
# app.db → flip USE_SQLITE=1 → restart api → verify. Safe and reversible: the
# JSON files stay in the volume, and the rollback command is printed at the end.
#
# Requires the NEW api image (with better-sqlite3) to already be deployed — the
# pre-flight check enforces that. Run it after CI has finished deploying the push.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root (compose paths are relative to here)
ENV_FILE=deploy/.env
DC=(docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE")
STAMP=$(date +%F-%H%M%S)
FORCE=${FORCE:-0}

echo "==> 0. Pre-flight"
# (a) the deployed image must actually contain better-sqlite3, or the API would
#     boot-loop after the flip. Fail loudly BEFORE touching anything.
"${DC[@]}" run --rm --no-deps api node -e "require('better-sqlite3'); console.log('    better-sqlite3 present in image: OK')"

# (b) re-run guard: if we have ALREADY cut over (flag on + app.db exists), running
#     the destructive migrate again would clobber live SQLite data with the JSON
#     snapshot (or WIPE it, if the JSON has since been discarded). Refuse unless
#     FORCE=1 is set deliberately.
already_flag=0
[ -f "$ENV_FILE" ] && grep -q '^USE_SQLITE=1$' "$ENV_FILE" && already_flag=1
db_exists=$("${DC[@]}" run --rm --no-deps api sh -c "[ -f /data/app.db ] && echo yes || echo no")
if [ "$already_flag" = "1" ] && [ "$db_exists" = "yes" ] && [ "$FORCE" != "1" ]; then
  echo "    REFUSING: already cut over (USE_SQLITE=1 and /data/app.db exists)." >&2
  echo "    Re-running migrate would OVERWRITE live SQLite data from JSON." >&2
  echo "    This is almost never what you want — especially after discarding JSON." >&2
  echo "    If you really mean to re-import from JSON, re-run with: FORCE=1 bash $0" >&2
  exit 1
fi

echo "==> 1. Back up the whole /data volume → data-backup-$STAMP.tgz"
CID=$("${DC[@]}" ps -q api || true)
if [ -n "$CID" ]; then
  docker cp "$CID:/data" "./data-backup-$STAMP"
else
  "${DC[@]}" run --rm --no-deps -v "$PWD:/backup" api sh -c "cp -a /data /backup/data-backup-$STAMP"
fi
tar czf "data-backup-$STAMP.tgz" "data-backup-$STAMP"
rm -rf "data-backup-$STAMP"
ls -la "data-backup-$STAMP.tgz"

echo "==> 2. Stop api (brief downtime so no writes are lost during migrate)"
"${DC[@]}" stop api

echo "==> 3. Migrate JSON → /data/app.db (prints per-table row counts — sanity-check them)"
"${DC[@]}" run --rm --no-deps api node server/migrate-to-sqlite.mjs

echo "==> 4. Flip USE_SQLITE=1 in $ENV_FILE"
touch "$ENV_FILE"
sed -i '/^USE_SQLITE=/d' "$ENV_FILE"
echo 'USE_SQLITE=1' >> "$ENV_FILE"

echo "==> 5. Recreate api on the SQLite backend"
"${DC[@]}" up -d api

echo "==> 6. Verify"
sleep 2
if "${DC[@]}" logs --tail=10 api | grep -q "backend SQLite"; then
  echo "    OK: api is running on SQLite."
else
  echo "    WARNING: did not see 'backend SQLite' in logs — check: ${DC[*]} logs api" >&2
fi

cat <<EOF

────────────────────────────────────────────────────────────────────────
Cutover done. Now spot-check the live site + admin (ratings / comments /
posts / calendar / leaderboards), and add a fresh entry to confirm writes.

Full pre-cutover backup: data-backup-$STAMP.tgz  (keep this!)

ROLL BACK to JSON anytime:
  sed -i '/^USE_SQLITE=1\$/d' $ENV_FILE && ${DC[*]} up -d api

Do NOT delete the JSON files until SQLite has run cleanly for a while AND you
have SQLite backups (see deploy/backup-sqlite.sh + SQLITE-CUTOVER.md).
────────────────────────────────────────────────────────────────────────
EOF
