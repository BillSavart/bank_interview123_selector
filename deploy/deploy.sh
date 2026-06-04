#!/usr/bin/env bash
# One-shot deploy from your laptop to the GCP VM.
# Build happens LOCALLY (e2-micro's 1GB RAM can OOM on `vite build`), only artifacts ship.
#
# Usage:
#   VM=user@vm-external-ip ./deploy/deploy.sh
#
# Assumes on the VM:
#   - /var/www/bank-interview   (served by Caddy)
#   - /opt/bank-interview/server (proxy code, run by systemd unit llm-proxy)
#   - your SSH user can sudo without password OR owns those dirs
set -euo pipefail

: "${VM:?Set VM=user@host (e.g. VM=bill@34.x.x.x)}"

echo "==> Building locally..."
npm run build

echo "==> Syncing static site → /var/www/bank-interview"
rsync -az --delete dist/ "$VM:/tmp/bank-dist/"
ssh "$VM" "sudo rsync -a --delete /tmp/bank-dist/ /var/www/bank-interview/ && rm -rf /tmp/bank-dist"

echo "==> Syncing proxy → /opt/bank-interview/server"
rsync -az --delete --exclude node_modules server/ "$VM:/tmp/bank-server/"
ssh "$VM" "sudo rsync -a --delete --exclude node_modules /tmp/bank-server/ /opt/bank-interview/server/ && rm -rf /tmp/bank-server && sudo systemctl restart llm-proxy"

echo "==> Done. Proxy status:"
ssh "$VM" "systemctl is-active llm-proxy && curl -s localhost:3001/api/health"
