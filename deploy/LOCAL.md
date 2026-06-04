# 本地測試（部署前）

不需要 VM、不需要網域、不需要 Docker。兩個終端機即可跑完整功能。

## 1. 設定 LLM 金鑰

```bash
cp server/.env.example server/.env
# 編輯 server/.env，填入：
#   GEMINI_API_KEY=...   （https://aistudio.google.com/apikey 免費）
#   GROQ_API_KEY=...     （https://console.groq.com/keys 免費，可留空只用 Gemini）
```

> **費用安全**：兩個 key 的帳號都**不要綁帳單/不要升級付費** → 超額只會顯示「流量已用完」，不會被收費。詳見 [CICD.md](CICD.md#-費用安全務必先讀)。

## 2. 起 LLM proxy（終端機 1）

```bash
cd server
npm run dev          # 讀 server/.env，listen 127.0.0.1:3001
```

## 3. 起前端（終端機 2）

```bash
npm install          # 第一次才需要
npm run dev          # Vite，通常 http://localhost:5173
```

Vite 已設好把 `/api` 代理到 `localhost:3001`（見 vite.config.ts），所以前端直接能呼叫 proxy。

## 4. 測什麼

- 篩選題目：輸入考生條件，看排序變化。
- **模擬面試**：任一題點「開始模擬面試」→ AI 出題 → 回答 → 看串流回饋。
- **Gemini→Groq fallback**：把 `server/.env` 的 `GEMINI_API_KEY` 故意填錯 → 對話應自動改用 Groq（proxy 終端機會印 `falling back to groq`）。
- **廣告版位**：沒設 `VITE_ADSENSE_CLIENT` 時會顯示虛線佔位框（題目列表上方、每 8 題之間）。不會有彈出式廣告。

## 5.（選用）本機跑 Docker 整套

驗證 production image 與 CI 一致：

```bash
docker build -t local/bank-interview-web -f Dockerfile .
docker build -t local/bank-interview-proxy -f server/Dockerfile server
# 用一份本機 keys 檔（不要用 /etc/ 那份）
docker run -d --name proxy --network-alias proxy --network bridge \
  -e GEMINI_API_KEY=xxx -e GROQ_API_KEY=xxx local/bank-interview-proxy
# web 容器同網路，DOMAIN=:80 走純 HTTP
```

> 日常開發用步驟 2–3 就好，Docker 留到要驗證部署時再跑。

---

## 等你準備好部署

1. 在 Cloudflare 買網域。
2. 開 GCP e2-micro、裝 Docker（見 [CICD.md](CICD.md)）。
3. GitHub repo 加 `SSH_HOST` / `SSH_USER` / `SSH_KEY` secrets。
4. `git push main` → 自動部署。
