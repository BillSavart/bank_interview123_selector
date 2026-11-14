#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
: "${WEB_IMAGE:?Expected a web image}" "${API_IMAGE:?Expected an API image}"
compose=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

# The Cloudflare Origin CA is private to the edge. Pin the installed origin
# certificate's public key for requests sent directly to this VM over loopback.
origin_pin="sha256//$(openssl x509 -in deploy/certs/origin.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A)"

check_status() {
  local host=$1 path=$2 expected=$3 status
  status=$(curl --silent --show-error --connect-timeout 3 --max-time 6 \
    --retry 2 --retry-connrefused --retry-delay 1 --noproxy '*' \
    --resolve "$host:443:127.0.0.1" --insecure --pinnedpubkey "$origin_pin" \
    --output /dev/null --write-out '%{http_code}' "https://$host$path") || return 1
  if [[ $status != "$expected" ]]; then
    printf '%s%s returned %s, expected %s\n' "$host" "$path" "$status" "$expected" >&2
    return 1
  fi
}

verify_origin() {
  local mode=$1 web_id domain_env site_host admin_host
  web_id=$("${compose[@]}" ps -q web) || return 1
  domain_env=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$web_id") || return 1
  site_host=$(sed -n 's/^DOMAIN=//p' <<<"$domain_env")
  admin_host=$(sed -n 's/^ADMIN_DOMAIN=//p' <<<"$domain_env")
  check_status "$site_host" /api/health 200 && check_status "$admin_host" /api/health 200 || return 1
  if [[ $mode == release ]]; then
    check_status "$admin_host" / 200 && check_status "$site_host" /api/admin/calendar 404 \
      && check_status "$admin_host" /api/admin/calendar 401 || return 1
  fi
}

verify_database() {
  "${compose[@]}" exec -T api node -e '
    console.log(`Node ${process.version}`);
    if (process.env.USE_SQLITE === "1") {
      const db = require("better-sqlite3")(process.env.DB_FILE, { readonly: true });
      const result = db.pragma("quick_check", { simple: true });
      db.close();
      if (result !== "ok") throw new Error("SQLite quick_check failed");
      console.log("SQLite quick_check ok");
    }
  ' </dev/null
}

prior_api=$("${compose[@]}" ps --all -q api)
prior_web=$("${compose[@]}" ps --all -q web)
if [[ -n $prior_api && -n $prior_web ]]; then
  prior_api_image=$(docker inspect --format '{{.Image}}' "$prior_api")
  prior_web_image=$(docker inspect --format '{{.Image}}' "$prior_web")
fi

"${compose[@]}" pull
if "${compose[@]}" up -d --wait --wait-timeout 90 && verify_origin release && verify_database; then
  echo 'Origin HTTPS, API health, and admin isolation verified.'
else
  if [[ -z ${prior_api_image:-} || -z ${prior_web_image:-} ]]; then
    echo 'Release failed and there is no previous pair of images.' >&2
  elif API_IMAGE="$prior_api_image" WEB_IMAGE="$prior_web_image" \
    "${compose[@]}" up -d --wait --wait-timeout 90 && verify_origin rollback; then
    echo 'Release failed. The previous images were restored and origin health verified.' >&2
  else
    echo 'Release failed and rollback did not pass verification.' >&2
  fi
  exit 1
fi
