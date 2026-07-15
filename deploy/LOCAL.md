# 本地測試（部署前）

題庫與主要畫面是靜態 SPA；評分、留言、投稿等完整互動仍需要 Node API。不需要 LLM API key。

## 開發模式

```bash
npm ci
npm run dev
```

打開 Vite 顯示的網址，通常是 `http://localhost:5173`。

若要測完整互動，另開 terminal 執行 `npm run api:local`。本機預設不設定 Turnstile keys，因此
`/api/security-config` 會回報停用、widget 不顯示，既有 honeypot／輸入驗證／rate limit 仍有效。
真實 Turnstile 測試方式與 localhost hostname 注意事項見
[Turnstile 防濫用技術設計](../docs/turnstile-bot-protection.md)。

## 驗證重點

- 左側考生條件會影響題目排序。
- 題目卡的「展開答案」會在卡片內顯示答題重點與示範回答。
- 切換條件後，已展開或重新展開的答案會依新的背景重算。
- 沒有任何 `/api/chat` runtime 呼叫。

## 本機測 production image

> 注意:web image 烤進的 `Caddyfile.docker` 現在帶 `tls /certs/origin.pem ...`（正式環境用
> Cloudflare Origin Certificate），所以**不能**再直接用 `DOMAIN=:80` 純 HTTP 跑——Caddy 會因為
> 在 `:80` 站台上設 `tls` 而報錯。本機要驗證畫面,直接用上面的 `npm run dev` 最簡單。

若真的要在本機跑 production image,把 `deploy/Caddyfile.docker` 兩個 block 的 `tls` 行先註解掉再 build:

```bash
docker build -t local/bank-interview-web -f Dockerfile .
docker run --rm -p 8080:80 -e DOMAIN=:80 local/bank-interview-web
```

然後開 `http://localhost:8080`。（記得別把註解掉 `tls` 的版本 commit 上去。）
