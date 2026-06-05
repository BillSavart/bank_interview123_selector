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
EOF
```

`DOMAIN` 是 Cloudflare 上的正式網域，例如 `example.com` 或 `interview.example.com`。

## Cloudflare

- A record `@` 或子網域指到 VM static IP。
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
