#!/usr/bin/env bash
# Push scraped calendar JSON (passed on stdin) into the running API container
# over loopback HTTPS using the VM's local deploy/.env credentials.
#
# Keeps ADMIN_TOKEN on the VM only (never copied into GitHub Secrets, never
# passed on argv, and the temporary admin session is revoked on exit).
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
ENV_FILE=deploy/.env

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f deploy/certs/origin.pem ]]; then
  echo "Missing deploy/certs/origin.pem" >&2
  exit 1
fi

read_env() {
  local key=$1 val
  val=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  val=${val%$'\r'}
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val=${val:1:${#val}-2}
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val=${val:1:${#val}-2}
  fi
  printf '%s' "$val"
}

ADMIN_DOMAIN=$(read_env ADMIN_DOMAIN)
ADMIN_TOKEN=$(read_env ADMIN_TOKEN)
if [[ -z "$ADMIN_DOMAIN" || -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_DOMAIN and ADMIN_TOKEN must be set in $ENV_FILE" >&2
  exit 1
fi

origin_pin="sha256//$(openssl x509 -in deploy/certs/origin.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A)"

work_dir=$(mktemp -d)
chmod 700 "$work_dir"
cookie_jar="$work_dir/cookies.txt"
login_body="$work_dir/login.json"
payload_file="$work_dir/payload.json"
resp_file="$work_dir/response.json"
logged_in=0

curl_admin() {
  curl --silent --show-error --connect-timeout 5 --max-time 20 --noproxy '*' \
    --resolve "$ADMIN_DOMAIN:443:127.0.0.1" --insecure --pinnedpubkey "$origin_pin" \
    -H "Origin: https://$ADMIN_DOMAIN" "$@"
}

cleanup() {
  if [[ $logged_in -eq 1 ]]; then
    curl_admin -X DELETE -b "$cookie_jar" "https://$ADMIN_DOMAIN/api/admin/session" >/dev/null 2>&1 || true
  fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

cat > "$payload_file"
if [[ ! -s "$payload_file" ]]; then
  echo "Empty sync payload on stdin" >&2
  exit 1
fi

# Escape ADMIN_TOKEN safely as JSON without putting it in argv.
ADMIN_TOKEN="$ADMIN_TOKEN" python3 -c 'import json, os; print(json.dumps({"token": os.environ["ADMIN_TOKEN"]}))' > "$login_body"
chmod 600 "$login_body"

login_status=$(curl_admin -c "$cookie_jar" -H 'Content-Type: application/json' \
  --data-binary "@$login_body" -o /dev/null -w '%{http_code}' \
  "https://$ADMIN_DOMAIN/api/admin/session")
if [[ "$login_status" != "200" ]]; then
  echo "Admin login failed with HTTP $login_status" >&2
  exit 1
fi
logged_in=1

sync_status=$(curl_admin -b "$cookie_jar" -H 'Content-Type: application/json' \
  --data-binary "@$payload_file" -o "$resp_file" -w '%{http_code}' \
  "https://$ADMIN_DOMAIN/api/admin/calendar/sync")
if [[ "$sync_status" != "200" ]]; then
  echo "Calendar sync failed with HTTP $sync_status: $(cat "$resp_file")" >&2
  exit 1
fi

cat "$resp_file"
printf '\n'
