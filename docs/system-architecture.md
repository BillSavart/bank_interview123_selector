# 系統架構圖

這張圖依目前 repo 的實際檔案整理：Vite React SPA、Cloudflare、Caddy web container、Node HTTP API、Docker Compose、GitHub Actions、GHCR，以及 VM 本機 Docker volume 持久化。README 直接嵌入同一張 SVG，這裡補充圖上的判讀方式與資料層細節。

![系統架構圖](system-architecture.svg)

> 註：實線是 runtime 請求流，虛線是建置／部署流。

## 圖上的重點

- 前端是 Vite React SPA，正式環境由 `web` image 內的 Caddy 服務 `/srv` 靜態檔。
- Caddy 直接服務 SPA、PDF、OG 圖、`banks-data.json`，並把 `/api/*`、`/e/*`、爬蟲用的 `/experience/*` SEO HTML 反向代理到 API。
- API 是輕量 Node `node:http` sidecar：`server/ratings-api.mjs`，不引入 Express 之類的 web framework。
- 使用者互動資料存進 Docker volume `ratings_data`。目前是 SQLite 遷移狀態：已切換的資料讀寫 `/data/app.db`，原 JSON / JSONL 檔保留作為匯入來源與回滾安全網。
- Cloudflare 負責 DNS、CDN/TLS/DDoS 與公開 GET API 的短快取；寫入和 admin API 不走 cache。
- GitHub Actions 負責 typecheck、Vitest、`check:banks-data`、前後端 image build/push；e2-micro VM 只 `docker compose pull && up -d`，避免在 1GB RAM 機器上建置。

## 資料層

JSON / JSONL 檔目前仍留在同一個 `ratings_data` volume，包含評分、題目留言（留言／投票／後台隱藏）、文章留言（留言／投票／後台隱藏）、經驗分享文章、文章投票、行事曆、兩個小遊戲排行榜。這些檔案在遷移期主要作為匯入來源與回滾安全網。

SQLite 不是外部資料庫服務；它仍在 API container 內用 `better-sqlite3` 存取 `/data/app.db`。依目前 `server/ratings-api.mjs`，`USE_SQLITE=1` 時 ratings、comments、posts、calendar、leaderboards 都會走 SQLite 持久層。正式切換與備份步驟見 [deploy/SQLITE-CUTOVER.md](../deploy/SQLITE-CUTOVER.md)。
