#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
招考行事曆同步

  ./sync-calendar.sh             抓取研訓院時程，依現有設定同步至正式站
  ./sync-calendar.sh --dry-run   預覽抓到的資料（JSON）
  ./sync-calendar.sh --local     同步至已啟動的本機 API
  ./sync-calendar.sh --help      顯示用法
EOF
}

case "$#:${1-}" in
  0:)
    start_message='正在抓取研訓院招考時程，完成後將依現有設定同步至正式站。'
    end_message='招考行事曆同步完成。'
    ;;
  1:--dry-run)
    start_message='預覽模式，正在抓取研訓院招考時程。'
    end_message='預覽完成。'
    ;;
  1:--local)
    start_message='本機模式，完成抓取後將同步至本機 API。'
    end_message='本機行事曆同步完成。'
    ;;
  1:-h|1:--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '找不到 Node.js。請先啟用此專案的 Node.js 環境。' >&2
  exit 127
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null
printf '%s\n' "$start_message" >&2
node scripts/sync-tabf-local.mjs "$@"
printf '%s\n' "$end_message" >&2
