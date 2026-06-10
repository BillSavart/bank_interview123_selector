# 系統架構圖

這張圖依目前 repo 的實際檔案整理：Vite React SPA、Caddy web container、Node HTTP API、Docker Compose、Cloudflare、GitHub Actions，以及 VM 本機 Docker volume 持久化。

![公股銀行新手村系統架構圖](./system-architecture.svg)

## 可編輯 Mermaid 版

```mermaid
flowchart LR
  user["使用者 Browser<br/>主網域 SPA / admin 子網域<br/>localStorage: voterId、投票狀態、admin token"]
  cf["Cloudflare<br/>Proxied DNS / CDN / DDoS<br/>Edge TLS + /api/* GET cache<br/>GCP 防火牆只允許 Cloudflare IP"]

  subgraph vm["GCP e2-micro VM / Docker Compose"]
    web["web container<br/>Caddy 2 + /srv 靜態 SPA<br/>服務 React routes、PDF、OG 圖、banks-data.json<br/>reverse_proxy /api/*、/e/*、crawler SEO -> api:3000"]
    api["api container<br/>Node server/ratings-api.mjs<br/>/api/ratings、/api/comments、/api/post-comments<br/>/api/posts、/api/calendar、/api/*/leaderboard<br/>/api/admin/* 使用 Bearer ADMIN_TOKEN"]
    caddyvol["caddy_data / caddy_config<br/>Cloudflare Origin Certificate 相關狀態"]
    datavol["ratings_data Docker volume<br/>ratings.json、comments.jsonl、comment-votes.jsonl<br/>comment-mods.jsonl、posts.json、post-votes.jsonl<br/>calendar.json、checkgame-top.json、numbergame-top.json"]
  end

  subgraph ci["GitHub Actions CI/CD"]
    trigger["main push / daily cron / manual run"]
    checks["typecheck + unit test + check:banks-data"]
    build["Build web image + api image"]
    ghcr["Push to GHCR"]
    deploy["SSH VM<br/>docker compose pull + up -d"]
  end

  subgraph data["Build-time Data Pipeline"]
    questions["public/20260515bank123.pdf<br/>bank123_pdftojson.json<br/>scripts/extract-questions.mjs<br/>-> src/data/questions.generated.ts"]
    mapdata["Google Sheet XLSX + g0v GeoJSON<br/>scripts/build-banks-data.mjs<br/>-> public/banks-data.json"]
    answers["answer_bank.json<br/>-> baked into SPA"]
  end

  user -->|HTTPS| cf
  cf -->|80/443 origin request| web
  web -->|reverse_proxy api:3000| api
  api -->|read/write| datavol
  web --> caddyvol

  trigger --> checks --> build --> ghcr --> deploy --> vm
  questions --> build
  mapdata --> build
  answers --> build
```

## 圖上的重點

- 前端是 Vite React SPA，正式環境由 Caddy container 服務靜態檔。
- API 是一個輕量 Node `node:http` sidecar，不使用外部資料庫。
- 使用者互動資料存進 Docker volume `ratings_data`，包含評分、留言、文章、行事曆、小遊戲排行榜。
- Cloudflare 負責 CDN/TLS/DDoS 與公開 GET API 的短快取；寫入和 admin API 不走 cache。
- GitHub Actions 負責 build image；e2-micro VM 只 pull image 和重啟容器，避免在 1GB RAM 機器上建置。
