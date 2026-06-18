#!/usr/bin/env bash
# Take one consistent SQLite backup (and prune old ones). Run ON THE VM from the
# repo root, manually or from cron:
#
#   bash deploy/backup-sqlite.sh
#
# Produces /data/backups/app-<timestamp>.db inside the volume via VACUUM INTO
# (WAL-safe, single self-contained file), keeping the newest BACKUP_KEEP. Then
# copies the newest snapshot out to ./sqlite-backups/ on the host so it's easy to
# ship OFF the box (the in-volume copy alone does NOT survive VM/disk loss).
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=deploy/.env
DC=(docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE")
KEEP=${BACKUP_KEEP:-14}

echo "==> Online backup (VACUUM INTO) inside the api container, keep=$KEEP"
"${DC[@]}" run --rm --no-deps -e BACKUP_KEEP="$KEEP" api node server/backup-db.mjs

echo "==> Copy newest snapshot to host ./sqlite-backups/"
mkdir -p sqlite-backups
CID=$("${DC[@]}" ps -q api || true)
if [ -n "$CID" ]; then
  NEWEST=$(docker exec "$CID" sh -c "ls -t /data/backups/app-*.db | head -1")
  docker cp "$CID:$NEWEST" "./sqlite-backups/$(basename "$NEWEST")"
else
  # api not running: use a throwaway container to reach the volume
  "${DC[@]}" run --rm --no-deps -v "$PWD/sqlite-backups:/out" api \
    sh -c 'cp "$(ls -t /data/backups/app-*.db | head -1)" /out/'
fi
ls -la sqlite-backups/ | tail -5

cat <<'EOF'

Tip: ship the host copy off the box, e.g.
  gsutil cp sqlite-backups/app-*.db gs://YOUR_BUCKET/bank-interview/   # GCS
  # or: scp / rclone to wherever you keep off-site backups
Schedule daily from cron (on the VM), e.g.:
  0 4 * * * cd /home/billwang_tech/bank_interview123_selector && bash deploy/backup-sqlite.sh >> /var/log/sqlite-backup.log 2>&1
EOF
