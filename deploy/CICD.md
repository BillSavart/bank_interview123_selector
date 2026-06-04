# Docker + CI/CD 部署（推薦路徑）

兩種部署方式擇一：

- **這份（Docker + GitHub Actions）** — 推送到 `main` 自動 build image、push 到 ghcr、SSH 到 VM 更新。**推薦**。
- [README.md](README.md) 的 systemd 手動方式 — 不想用 Docker 時的替代方案。

---

## 流程總覽

```
git push main
   │
   ▼
GitHub Actions (.github/workflows/deploy.yml)
   ├─ build web image   (Dockerfile → caddy + 靜態 SPA)
   ├─ build proxy image (server/Dockerfile → node LLM proxy)
   ├─ push 兩個 image 到 ghcr.io
   └─ SSH 進 VM → docker compose pull && up -d
                      │
                      ▼
            VM: web 容器(80/443) ──/api──> proxy 容器(3001, 不對外)
```

**image 在 GitHub 雲端 build，VM 只 pull** —— e2-micro 的 1GB RAM 不夠跑 `vite build`，這樣才不會 OOM。

---

## 一次性設定

### 1. VM 裝 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 重新登入後生效
```

### 2. VM 放檔案與金鑰

```bash
sudo mkdir -p /opt/bank-interview /etc/bank-interview

# LLM 金鑰（不進 git，proxy 容器用 env_file 讀）
sudo tee /etc/bank-interview/proxy.env >/dev/null <<'EOF'
GEMINI_API_KEY=你的_gemini_key
GROQ_API_KEY=gsk_你的_groq_key
EOF
sudo chmod 600 /etc/bank-interview/proxy.env

# compose 檔
sudo cp deploy/docker-compose.yml /opt/bank-interview/docker-compose.yml
# 或 scp 上去：scp deploy/docker-compose.yml user@vm:/opt/bank-interview/

# compose 的變數（你的 ghcr 帳號 + 網域）
sudo tee /opt/bank-interview/.env >/dev/null <<'EOF'
REGISTRY=ghcr.io/你的github帳號
DOMAIN=你的網域
EOF
```

> `DOMAIN` 設成真實網域時 Caddy 會自動申請 HTTPS 憑證。本機/測試可設 `DOMAIN=:80`（純 HTTP）。

### 3. ghcr image 設為 public（最省事）

第一次 workflow 跑完後，到 GitHub → 你的頭像 → Packages → `bank-interview-web` / `bank-interview-proxy` → Package settings → Change visibility → **Public**。
這樣 VM 不用登入就能 pull。

（若想保持 private：在 VM 上 `echo $CR_PAT | docker login ghcr.io -u 你的帳號 --password-stdin`，PAT 需 `read:packages` 權限。）

### 4. GitHub repo 加 Secrets

Settings → Secrets and variables → Actions → New repository secret：

| Secret | 內容 |
|--------|------|
| `SSH_HOST` | VM 外部 IP |
| `SSH_USER` | VM SSH 帳號 |
| `SSH_KEY` | 該帳號的 SSH **私鑰**（整段，含 BEGIN/END） |

> 在 VM 上 `ssh-keygen` 產一把專用 deploy key，公鑰加進 `~/.ssh/authorized_keys`，私鑰貼到 `SSH_KEY`。
> ghcr 的推送用內建 `GITHUB_TOKEN`，不必另設。

### 5. Cloudflare DNS

A record `@` → VM 靜態 IP（橘色雲打開），SSL/TLS 模式 **Full**。靜態檔走 CDN，省 GCP 每月 1GB egress。

---

## 之後的日常

改完 code → `git push` 到 `main` → 全自動部署。也可在 GitHub Actions 頁面手動 **Run workflow**。

第一次部署（VM 上還沒有容器）會由 workflow 的 SSH 步驟自動 `up -d` 拉起來。

## 驗證 / 排錯

```bash
# VM 上
cd /opt/bank-interview
docker compose ps
docker compose logs -f web
docker compose logs -f proxy

# proxy 健康檢查（容器內）
docker compose exec proxy wget -qO- localhost:3001/api/health
```

## 本機跑整套（選用）

```bash
docker build -t local/bank-interview-web -f Dockerfile .
docker build -t local/bank-interview-proxy -f server/Dockerfile server
REGISTRY=local DOMAIN=:80 \
  docker compose -f deploy/docker-compose.yml up
# 開 http://localhost  （需先把 compose 的 env_file 指到一份有 key 的本機檔，或暫時移除該行）
```
