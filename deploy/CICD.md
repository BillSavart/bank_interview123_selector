# Docker + CI/CD 部署到 GCP e2-micro

推薦用 GitHub Actions 在雲端 build Docker image，再讓 GCP e2-micro pull image。e2-micro 記憶體只有 1GB，不適合在 VM 上跑 `vite build`。

## 流程

```text
git push main
  |
  v
GitHub Actions
  |- npm run build
  |- docker build bank-interview-web
  |- docker build bank-interview-api
  |- push image to ghcr.io
  |
  v
SSH 到 GCP VM
  |- docker compose pull
  |- docker compose up -d
```

VM 上跑 `web` container 與輕量 `api` container。Caddy 負責 HTTPS、靜態檔服務，並把 `/api/*` 反向代理到評分 API。

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

放 compose 檔與環境變數：

```bash
sudo mkdir -p /opt/bank-interview
sudo cp deploy/docker-compose.yml /opt/bank-interview/docker-compose.yml

sudo tee /opt/bank-interview/.env >/dev/null <<'EOF'
REGISTRY=ghcr.io/你的github帳號
DOMAIN=你的網域
ADMIN_DOMAIN=admin.你的網域
ADMIN_TOKEN=用一段夠長的隨機字串
# 選用：邊界 Basic Auth 的 bcrypt hash（caddy hash-password 產生）
ADMIN_BASIC_HASH=
EOF
```

- `DOMAIN` 是 Cloudflare 上的正式網域，例如 `example.com` 或 `interview.example.com`。
- `ADMIN_DOMAIN` 是管理後台子網域，例如 `admin.interview.example.com`。
- `ADMIN_TOKEN` 是招考行事曆後台的管理金鑰，保護 `/api/admin/*` 寫入。
  產生方式例如：`openssl rand -hex 24`。**未設定時後台寫入一律拒絕**（行事曆變唯讀）。
- 改完 `.env` 後 `docker compose up -d` 讓 api / web 重新讀取環境變數。

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

- A record `@` 或子網域指到 VM static IP。
- **另外加一筆 `admin` 的 A record（或 CNAME 指到主網域）也指到同一個 VM static IP**，
  讓 `admin.你的網域` 能解析。
- Proxy 開啟，橘色雲。
- SSL/TLS mode 設 `Full`。

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
cd /opt/bank-interview
docker compose ps
docker compose logs -f web
docker compose logs -f api
curl -I https://你的網域
```

首頁應能載入題庫，題目卡的「展開答案」應在前端直接顯示預製答案與評分列。
