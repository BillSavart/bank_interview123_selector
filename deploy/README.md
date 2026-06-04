# 部署到 GCP e2-micro（Always Free）+ 自有網域 + Cloudflare

> **兩種部署方式擇一：**
> - **[CICD.md](CICD.md)（Docker + GitHub Actions，推薦）** — push 到 main 自動 build + 部署。
> - **本文件（systemd 手動）** — 不用 Docker 的替代方案，需自己 build + rsync。


整體架構：

```
網域 (Cloudflare 託管 DNS, Full TLS)
   │
   ▼
GCP e2-micro VM  ──  Caddy (自動 HTTPS)
                       ├─ /          → /var/www/bank-interview  (靜態 SPA)
                       └─ /api/*     → 127.0.0.1:3001  (Node LLM proxy, systemd)
                                          │
                                          ├─ 先試 Gemini 2.0 Flash（免費額度）
                                          └─ 429/失敗 → 自動 fallback Groq
```

---

## 1. 建 VM

- Compute Engine → 建 e2-micro，**區域必選** `us-west1` / `us-central1` / `us-east1`（只有這三個 Always Free）。
- 開機碟：Debian 12 或 Ubuntu 22.04，30GB standard（免費上限）。
- VPC 防火牆放行 **tcp:80, tcp:443**。
- VPC network → IP addresses → 把 VM 的外部 IP 設成 **Static**（掛在 VM 上免費）。

## 2. VM 上裝環境（SSH 進去後）

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Caddy（官方 apt repo）
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# 目錄
sudo mkdir -p /var/www/bank-interview /opt/bank-interview/server /etc/bank-interview
```

## 3. 放 API 金鑰（不進 git）

```bash
sudo tee /etc/bank-interview/proxy.env >/dev/null <<'EOF'
GEMINI_API_KEY=你的_gemini_key
GROQ_API_KEY=gsk_你的_groq_key
PORT=3001
EOF
sudo chmod 600 /etc/bank-interview/proxy.env
```

- Gemini key：https://aistudio.google.com/apikey （免費）
- Groq key：https://console.groq.com/keys （免費）

> **⚠️ 費用安全**：兩個 key 的帳號都**不要綁帳單/不要升級付費**，這樣超額只會回 429（顯示「流量已用完」），**不可能被收費**。程式的額度偵測是被動的，擋不住「已開帳單後的超額計費」。詳見 [CICD.md](CICD.md#-費用安全務必先讀)。可選 `DAILY_CALL_CAP=2000` 加一道自訂每日上限。

## 4. 裝 Caddy 設定 + systemd

```bash
# 把 Caddyfile 裡的 YOUR_DOMAIN 換成你的網域，再：
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

sudo cp deploy/llm-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now llm-proxy
```

## 5. Cloudflare DNS

- 把網域 NS 指到 Cloudflare。
- 加 A record：`@` → VM 靜態 IP，Proxy 狀態打開（橘色雲）。
- SSL/TLS 模式設 **Full**。
- 好處：靜態檔走 Cloudflare CDN，幾乎不吃 GCP 每月 1GB 免費 egress。

## 6. 部署（在你的筆電上）

```bash
VM=你的帳號@VM外部IP ./deploy/deploy.sh
```

之後每次更新程式，重跑這行就好。

---

## 廣告（AdSense，非彈出式）

1. 網站上線、有內容後到 https://adsense.google.com 申請、加網域。
2. 通過後拿到的 `<script>` 放進 `index.html` 的 `<head>`。
3. 版位用 **display / in-article**，**不要開 interstitial（插頁）** → 就不會彈出。
4. 建議位置：題目卡片之間、結果頁底部；避開對話進行中的區塊。

## 驗證

```bash
curl https://你的網域/api/health      # {"ok":true,...}
```
