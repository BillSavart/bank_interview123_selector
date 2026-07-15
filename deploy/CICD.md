# Docker + CI/CD 部署到 GCP e2-micro

推薦用 GitHub Actions 在雲端 build Docker image，再讓 GCP e2-micro pull image。e2-micro 記憶體只有 1GB，不適合在 VM 上跑 `vite build`。

## 流程

```text
git push main
  |
  v
GitHub Actions
  |- npm ci
  |- typecheck / unit tests / banks-data validation
  |- docker build bank-interview-web
  |- docker build bank-interview-api
  |- push image to ghcr.io
  |
  v
SSH 到 GCP VM
  |- docker compose pull
  |- docker compose up -d
```

VM 上跑 `web` container 與輕量 `api` container。Caddy 負責 HTTPS、靜態檔服務，並把 `/api/*` 反向代理到 Node API。使用者投稿先寫入 API 的持久層，再由 API container 透過 Resend HTTPS API 寄送管理員通知；Email provider 不在 VM 內運行。

### 可重現的 dependency install

- `package.json` 以 `packageManager` 固定 npm 10.8.2，`package-lock.json` 也用同一版本維護。
- PR checks、main branch 的 deploy gate 與 frontend Docker build 都只執行
  `npm ci --ignore-scripts --no-audit --no-fund`。這些階段不啟動 SQLite API，因此不需要編譯
  `better-sqlite3`；停用 lifecycle scripts 可移除 runner 上約一分鐘的 native build。Audit 不放在每次
  deploy 的 critical path，維護相依套件時應另外執行 `npm audit`。
- workflow 不提供 `npm install` fallback；若 manifest 與 lockfile 不一致，CI 會立即失敗，避免重新解析
  dependency tree 後仍繼續部署，也避免同一個 job 重複安裝。
- `Dockerfile.api` 的 `npm install --no-save` 是刻意的例外：該 stage 只從 `package.json` 讀取已固定的
  `better-sqlite3` 版本，為 Node 20 / glibc 編譯單一 native runtime dependency，不負責安裝完整專案。

新增或升級套件時，請用 npm 10.8.2 執行 `npm install`，一併提交 `package.json` 與
`package-lock.json`，並在 push 前以 `npm ci` 做一次 clean-install 驗證。

## VM 一次性設定

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

設定 Docker daemon 的系統層級 log rotation，避免 30GB 小磁碟被 container stdout/stderr log 長期吃滿：

```bash
sudo mkdir -p /etc/docker
sudo cp deploy/docker-daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
```

這只限制 Docker container log；不會清理或截斷 `ratings_data` volume 裡的評分、留言、留言投票檔案。

e2-micro 建議加 swap，避免容器更新時記憶體太緊：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

在 VM 的 repo 根目錄建立部署環境變數。GitHub Actions 會固定從這個 checkout 的
`deploy/.env` 讀取設定：

> 新環境可先參考 [`deploy/.env.example`](.env.example)；既有環境不要用 `cp` 覆蓋正式
> `.env`，只補上需要的新欄位。

```bash
cd /home/billwang_tech/bank_interview123_selector
umask 077
tee deploy/.env >/dev/null <<'EOF'
REGISTRY=ghcr.io/你的github帳號
DOMAIN=你的網域
ADMIN_DOMAIN=admin.你的網域
ADMIN_TOKEN=用一段夠長的隨機字串
# 選用：邊界 Basic Auth 的 bcrypt hash（caddy hash-password 產生）
ADMIN_BASIC_HASH=
# 選用：使用者投稿成功後寄 Email 通知（以下三項須同時設定）
RESEND_API_KEY=re_xxxxxxxxx
SUBMISSION_NOTIFY_EMAIL=你的收件信箱
SUBMISSION_EMAIL_FROM="銀行面試考古題 <notifications@send.你的網域>"
# Cloudflare Turnstile：公開投稿／留言的前後端驗證（兩把 key 都必須設定）
TURNSTILE_SITE_KEY=0x4AAAA...
TURNSTILE_SECRET_KEY=0x4AAAA...
TURNSTILE_EXPECTED_HOSTNAMES=你的網域,www.你的網域
TURNSTILE_TIMEOUT_MS=5000
EOF
```

- `DOMAIN` 是 Cloudflare 上的正式網域，例如 `example.com` 或 `interview.example.com`。
- `ADMIN_DOMAIN` 是管理後台子網域，例如 `admin.interview.example.com`。
- `ADMIN_TOKEN` 是招考行事曆後台的管理金鑰，保護 `/api/admin/*` 寫入。
  產生方式例如：`openssl rand -hex 24`。**未設定時後台寫入一律拒絕**（行事曆變唯讀）。
- 投稿通知三個變數的啟用條件、DNS 與失敗行為見下節；缺少任何一項時通知保持停用，不影響投稿。
- Turnstile 的 Site key 可公開，Secret key 只能留在 `deploy/.env`／API container。兩把都未設定時刻意停用；只設定其中一把時公開投稿與留言會 fail closed。
- 改完 `deploy/.env` 後執行
  `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d`，讓 api / web
  重新讀取環境變數。

### 投稿 Email 通知部署

1. 在 Resend 新增獨立寄信子網域，例如 `send.你的網域`。
2. 把 Resend dashboard 當下提供的 SPF／DKIM 等紀錄加入 Cloudflare，郵件紀錄維持
   **DNS only**，並等 Resend sending status 顯示 `Verified`。不需要啟用 Cloudflare
   Email Routing，因為它處理的是收信／轉寄。
3. 建立權限為 `Sending access` 的 API Key，並限制到這個寄信網域；不要使用不必要的
   Full access key。
4. 在 `deploy/.env` 同時設定 `RESEND_API_KEY`、`SUBMISSION_NOTIFY_EMAIL`、
   `SUBMISSION_EMAIL_FROM`。多個收件信箱可用逗號分隔。
5. 只重建 API container 以重新讀取環境變數：

   ```bash
   DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
   $DC up -d api
   ```

6. 不輸出 secret，只確認 container 內是否收到設定：

   ```bash
   $DC exec api node -e '
   for (const key of ["RESEND_API_KEY", "SUBMISSION_NOTIFY_EMAIL", "SUBMISSION_EMAIL_FROM", "ADMIN_BASE_URL"]) {
     console.log(`${key}: ${process.env[key] ? "set" : "missing"}`);
   }'
   ```

通知只會在真實投稿成功存檔後觸發；honeypot、格式錯誤與 rate-limited request 都不會寄信。
Email 採 best-effort，Resend 失敗不會回滾投稿。端到端測試後要在後台刪除測試投稿，避免正式
資料殘留測資；故障時查看 `$DC logs --tail=100 api` 的 `[submission-email]` 訊息與 Resend Logs。

完整 sequence、payload、idempotency、timeout、安全性、failure matrix 與未來 outbox 擴充方案見
[投稿 Email 通知技術設計](../docs/submission-email-notifications.md)。

### Turnstile 防濫用部署

1. Cloudflare Turnstile 建立 `bank-interview-advisor` Managed widget，允許根網域與 `www`，不開 Pre-clearance。
2. 將 Site/Secret key 與 expected hostnames 加到 VM 的 `deploy/.env`；不要把真實值 commit。
3. 只重建 API container，環境變數即生效；前端會由 `/api/security-config` runtime 取得 public Site key，不需重建 web image：

   ```bash
   DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
   $DC up -d api
   ```

4. 不顯示值，只確認 API container 收到設定：

   ```bash
   $DC exec api node -e '
   for (const key of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAMES"]) {
     console.log(`${key}: ${process.env[key] ? "set" : "missing"}`);
   }'
   ```

5. `curl -s https://你的網域/api/security-config` 只能看到 `enabled` 與 Site key，絕不能包含 Secret key。
6. 正式頁面完成 widget 後測試投稿／留言；缺 token 或重送同一 token 應被拒絕。測完刪除測資。

詳細 threat model、request sequence、failure matrix 與金鑰輪替見
[Turnstile 防濫用技術設計](../docs/turnstile-bot-protection.md)。

### Origin Certificate（首次部署前必放）

web 容器的 Caddyfile 會讀 `/certs/origin.pem`、`/certs/origin.key`（compose 由 `./certs`
唯讀掛載）。**憑證必須在 image rollout 之前就放好**，否則 Caddy 找不到檔會起不來。

```bash
# 在 compose 所在目錄（GitHub Actions 是 repo 的 deploy/）旁建立 certs/
mkdir -p deploy/certs
# 把 Cloudflare Origin Certificate 貼進去（沒 SSH 也可用 GCP Console 瀏覽器 SSH 上傳）
#   deploy/certs/origin.pem   ← 憑證
#   deploy/certs/origin.key   ← 私鑰
chmod 600 deploy/certs/origin.key
```

> `deploy/certs/`、`*.pem`、`*.key` 已在 `.gitignore`，私鑰不會被 commit。

> 注意:GitHub Actions（[deploy.yml](../.github/workflows/deploy.yml)）會自動 SSH 到 VM
> `git pull` 並 `docker compose -f deploy/docker-compose.yml ... pull && up -d`，
> 也就是 **push 後會自動部署**。所以新增/改 Caddyfile 這類烤進 image 的變更時，
> 要先確保 VM 上的 `deploy/certs/` 已就位，再 push。

## 招考行事曆後台

- 部署後到 `https://admin.你的網域`（子網域根目錄即後台），輸入 `ADMIN_TOKEN` 即可新增/編輯/刪除招考。
  （本地測試沒有子網域，改用 `http://localhost:5173/admin`。）
- 事件存在 `ratings_data` volume 的 `calendar.json`，**改內容不需要重新 deploy**。
- 想再加一層瀏覽器登入：在 `deploy/Caddyfile.docker` 的 admin block 取消 `basic_auth`
  註解，用 `docker run --rm caddy:2-alpine caddy hash-password` 產生 hash 填到 `ADMIN_BASIC_HASH`。

## 廣告

- 每個前台頁面都已預留廣告版位（首頁題目間每 8 題一則、其他頁在 navbar 與內容之間 + 最下方）。
- **本地 `npm run dev` 會顯示佔位框；正式上線預設「不顯示」任何廣告。**
- 想正式啟用廣告時，需同時：build 時設 `VITE_ADSENSE_CLIENT`（AdSense 發佈商 id）**且**
  `VITE_ADS_ENABLED=true`。只設其中一個都不會顯示，確保不會誤開。

## Cloudflare

- A record `@` 或子網域指到 VM external IP。
- **另外加一筆 `admin` 的 A record（或 CNAME 指到主網域）也指到同一個 VM external IP**，
  讓 `admin.你的網域` 能解析。
- 兩筆都開 Proxy（橘色雲）。
- **SSL/TLS → Origin Server → Create Certificate**：產一張涵蓋 `你的網域` + `*.你的網域`
  的 Origin Certificate，存成 `origin.pem` / `origin.key` 放到 VM 的 `deploy/certs/`
  （compose 會唯讀掛載到 web 容器 `/certs`，Caddy 用它終止 TLS，免 Let's Encrypt 續期）。
- **SSL/TLS encryption mode 設 `Full (strict)`**。
- **Caching → Cache Rules** 加一條：`/api/*` → `Eligible for cache`、Edge TTL 尊重 origin，
  讓公開 GET API（帶 `s-maxage=10`）被邊緣快取吸收。
- 上線並確認憑證生效後，把防火牆 80/443 收緊成只允許 Cloudflare 網段，詳見
  [README.md](README.md) 的「安全性收尾」。

## GitHub Secrets

Settings -> Secrets and variables -> Actions:

| Secret | 內容 |
| --- | --- |
| `SSH_HOST` | VM external IP |
| `SSH_USER` | VM SSH user |
| `SSH_KEY` | SSH private key |

ghcr push 可用 GitHub Actions 內建 `GITHUB_TOKEN`。

## ghcr image 權限

第一次 workflow 跑完後，到 GitHub Packages 把 `bank-interview-web` 和 `bank-interview-api` 設成 public，VM 就不用 docker login。

如果要 private package，請在 VM 上先登入 ghcr：

```bash
echo "$CR_PAT" | docker login ghcr.io -u 你的github帳號 --password-stdin
```

## 驗證

```bash
cd /home/billwang_tech/bank_interview123_selector
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f web
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api
curl -I https://你的網域
```

首頁應能載入題庫，題目卡的「展開答案」應在前端直接顯示預製答案與評分列。
