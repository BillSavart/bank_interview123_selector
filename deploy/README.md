# 部署到 GCP e2-micro + Cloudflare 網域

這個專案主體是靜態 SPA。答案在 build 後由前端規則與題庫標籤產生；參考答案評分、匿名留言與留言投票另外用一個輕量 Node API 儲存在 VM 本機 Docker volume，不需要 Firebase、外部資料庫、LLM key、Vercel 或後端 proxy。

## 架構

```text
使用者
  |
  v
Cloudflare（橘雲 Proxied / CDN）
  |- 邊緣快取公開 GET API（/api/* Cache Rule，吃 s-maxage=10）
  |- 邊緣 TLS、DDoS 防護、隱藏 origin IP
  |
  v   （只接受 Cloudflare IP；GCP 防火牆 80/443 鎖定 CF 網段）
GCP e2-micro VM
  |
  |- Caddy web container -> /srv 靜態檔（主網域 + admin 子網域）
  |   └ 用 Cloudflare Origin Certificate（15 年）終止 TLS，不跑 Let's Encrypt
  |
  `- ratings api container -> ratings_data/{ratings.json, comments.jsonl,
       comment-votes.jsonl, comment-mods.jsonl, checkgame-top.json,
       numbergame-top.json, calendar.json}
```

> 安全/成本取捨:沒有使用 Cloudflare Tunnel。單台 e2-micro 移除外部 IP 後仍需 egress,只能靠外部 IP 或 Cloud NAT,後者反而更貴,所以保留外部 IP、改用「防火牆只放 Cloudflare + Origin Certificate」拿到等同 Tunnel 的隱藏 origin 效果,且零額外費用。

## 建 VM

- Compute Engine 建 `e2-micro`。
- Always Free 區域請選 `us-west1`、`us-central1` 或 `us-east1`。
- 開機碟可用 Debian 12 或 Ubuntu 22.04，30GB standard。
- 防火牆一開始放行 TCP `80`、`443`（上線並確認 Origin Certificate 生效後，再收緊成只允許 Cloudflare 網段，見下方「安全性收尾」）。
- 保留 VM external IP（cloudflared 不用，但 VM 仍需這顆 IP 做對外 egress；e2-micro 單機移除它並不省錢）。
- 不建議在 e2-micro 安裝 Ops Agent：otel + fluent-bit 常駐約佔 100~250MB RAM，對 1GB 機器負擔明顯，本專案應用層幾乎不產生 log，監控價值不高。

## Cloudflare

1. 在 Cloudflare 買或接入網域。
2. A record：`@` 指到 VM external IP；再加一筆 `admin`（A 或 CNAME）指到同一台。
3. 兩筆都開 Proxy（橘色雲）。
4. **SSL/TLS → Origin Server → Create Certificate**：產一張涵蓋 `你的網域` 與 `*.你的網域` 的 Origin Certificate，分別存成 `origin.pem`（憑證）與 `origin.key`（私鑰），放到 VM 的 `deploy/certs/`（compose 會以唯讀掛載到 web 容器的 `/certs`）。Caddy 用它終止 TLS，免去 Let's Encrypt 續期（續期需要 inbound，鎖防火牆後會失敗）。
5. **SSL/TLS encryption mode 設 `Full (strict)`**（Origin Certificate 由 Cloudflare 簽發、受其信任，可通過 strict 驗證）。
6. **Caching → Cache Rules** 新增一條：`URI Path` 符合 `/api/*` → `Eligible for cache`、Edge TTL 尊重 origin（用 cache-control header）。這樣公開 GET API（`/api/ratings`、`/api/comments/:id`、`/api/calendar`、`/api/*/leaderboard`，皆帶 `s-maxage=10`）會被邊緣快取吸收，origin 在高流量下幾乎閒置。寫入/admin/health 一律 `no-store`，不受影響。

## 安全性收尾（確認 Origin Certificate 生效後再做）

把 GCP 防火牆 `default-allow-http` / `default-allow-https` 的來源從 `0.0.0.0/0` 收緊成只允許 Cloudflare 的 IPv4 網段，讓外人無法繞過 Cloudflare 直連 VM。SSH（22）不要動。

```bash
CF="173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22"
gcloud compute firewall-rules update default-allow-http  --source-ranges="$CF"
gcloud compute firewall-rules update default-allow-https --source-ranges="$CF"
```

- Cloudflare IP 清單以 <https://www.cloudflare.com/ips-v4> 為準。
- 萬一站台變 522（回源失敗），把來源改回 `0.0.0.0/0` 即可還原。
- 驗證:直連 IP 應 timeout、走網域應 200;`curl -sI https://你的網域/api/ratings` 連兩次,`cf-cache-status` 由 `MISS` 變 `HIT` 代表快取生效。

## 推薦部署方式

用 Docker + GitHub Actions，讓 GitHub build image，e2-micro 只負責 pull 和跑容器，避免 1GB RAM 在 VM 上 build 爆掉。

詳見 [CICD.md](CICD.md)。

## 手動部署方式（legacy，不含 Origin Cert / 防火牆收尾）

> 目前正式環境走上面的 Docker + CI/CD;以下主機版 Caddy（[Caddyfile](Caddyfile)）使用 Let's Encrypt 自動 HTTPS,**與「Origin Certificate + 防火牆只放 Cloudflare」的收尾不相容**（鎖防火牆後 ACME 續期會失敗）。僅在不走 Cloudflare 收尾時參考。

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

應該看到 `200` 或 `304`，且首頁能正常載入題庫、展開答案、參考答案評分與留言板。

## 使用者資料

使用者互動資料存在 Docker volume `ratings_data`：

- `/data/ratings.json`：參考答案 1-5 顆星評分。同一瀏覽器同一題再次評分會覆蓋原本分數，因此不會重複增加人數。
- `/data/comments.jsonl`：匿名留言，append-only JSONL。
- `/data/comment-votes.jsonl`：留言讚/倒讚紀錄，append-only JSONL，同一瀏覽器同一則留言最後一次投票為準。
- `/data/comment-mods.jsonl`：留言審核紀錄（hide/show/delete），append-only，啟動時重播套用。
- `/data/checkgame-top.json`、`/data/numbergame-top.json`：兩個小遊戲各自的排行榜，只保留前 10 名（每次寫入重寫並截斷，掉出前 10 直接捨棄），檔案大小固定不會成長。
- `/data/calendar.json`：招考行事曆事件，由 admin API 維護；只保留「上個月～下下下個月」視窗內的事件，過期自動裁掉。

留言淨分數 `<= COMMENT_HIDE_SCORE` 時會預設隱藏，Docker Compose 目前設定為 `-100`；使用者仍可在前端切換顯示隱藏留言。

這個檔案式方案適合 e2-micro 和小型題庫網站；若未來評分量成長到幾十萬筆以上，再改 SQLite 會比較適合。

## 磁碟保護

Docker Compose 已對 `web` 和 `api` container 設定 `json-file` log rotation，每個 container 最多保留 3 個 10MB log 檔。VM 一次性設定也可套用 [docker-daemon.json](docker-daemon.json) 到 `/etc/docker/daemon.json`，讓 Docker daemon 對其他 container 也使用相同上限。

這些設定只處理 Docker 系統 log，不會清理或修改 `ratings_data` 裡的 `/data/ratings.json`、`/data/comments.jsonl`、`/data/comment-votes.jsonl`、`/data/checkgame-top.json` 使用者資料。
