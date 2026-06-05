# 部署到 GCP e2-micro + Cloudflare 網域

這個專案主體是靜態 SPA。答案在 build 後由前端規則與題庫標籤產生；參考答案評分另外用一個輕量 Node API 儲存在 VM 本機 Docker volume，不需要 Firebase、外部資料庫、LLM key、Vercel 或後端 proxy。

## 架構

```text
使用者
  |
  v
Cloudflare DNS / CDN
  |
  v
GCP e2-micro VM
  |
  |- Caddy web container -> /srv 靜態檔
  |
  `- ratings api container -> ratings_data/ratings.json
```

## 建 VM

- Compute Engine 建 `e2-micro`。
- Always Free 區域請選 `us-west1`、`us-central1` 或 `us-east1`。
- 開機碟可用 Debian 12 或 Ubuntu 22.04，30GB standard。
- 防火牆放行 TCP `80`、`443`。
- 將 VM external IP 設成 static。

## Cloudflare

1. 在 Cloudflare 買或接入網域。
2. A record：`@` 指到 VM static IP。
3. Proxy 開啟，也就是橘色雲。
4. SSL/TLS mode 設 `Full`。

## 推薦部署方式

用 Docker + GitHub Actions，讓 GitHub build image，e2-micro 只負責 pull 和跑容器，避免 1GB RAM 在 VM 上 build 爆掉。

詳見 [CICD.md](CICD.md)。

## 手動部署方式

如果暫時不做 CI/CD，可以在本機 build 後把 `dist/` 傳到 VM。
這種方式只會部署靜態前端；若要啟用評分，仍建議使用 Docker Compose，或另外在 VM 上常駐 `npm run api` 並讓 Caddy 的 `/api/*` 指到 `127.0.0.1:3000`。

```bash
npm install
npm run build
rsync -av --delete dist/ USER@VM_IP:/tmp/bank-interview-dist/
ssh USER@VM_IP 'sudo mkdir -p /var/www/bank-interview && sudo rsync -a --delete /tmp/bank-interview-dist/ /var/www/bank-interview/'
```

VM 上安裝 Caddy 後，把 [Caddyfile](Caddyfile) 的 `YOUR_DOMAIN` 換成你的網域，再放到 `/etc/caddy/Caddyfile`。

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 驗證

```bash
curl -I https://你的網域
```

應該看到 `200` 或 `304`，且首頁能正常載入題庫、展開答案與參考答案評分。

## 評分資料

評分資料存在 Docker volume `ratings_data` 的 `/data/ratings.json`。同一瀏覽器同一題再次評分會覆蓋原本分數，因此不會重複增加人數。

這個檔案式方案適合 e2-micro 和小型題庫網站；若未來評分量成長到幾十萬筆以上，再改 SQLite 會比較適合。
