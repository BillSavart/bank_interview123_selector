# 本地測試（部署前）

這個版本是純前端靜態站，不需要 LLM API key，也不用啟動 proxy server。

## 開發模式

```bash
npm install
npm run dev
```

打開 Vite 顯示的網址，通常是 `http://localhost:5173`。

## 驗證重點

- 左側考生條件會影響題目排序。
- 題目卡的「展開答案」會在卡片內顯示答題重點與示範回答。
- 切換條件後，已展開或重新展開的答案會依新的背景重算。
- 沒有任何 `/api/chat` runtime 呼叫。

## 本機測 production image

```bash
docker build -t local/bank-interview-web -f Dockerfile .
docker run --rm -p 8080:80 -e DOMAIN=:80 local/bank-interview-web
```

然後開 `http://localhost:8080`。
