# 臺灣銀行分行叫號與排隊分析系統 (`bot-queue-analytics`)

> **Stage A（獨立低干擾採集與統計 MVP）→ Stage B（無縫對接 `bank_interview123_selector` 網站）**  
> **最高設計原則**：**零干擾、嚴格唯讀、絕不影響臺灣銀行線上取號系統正常運作**。

---

## 1. 專案亮點與實測發現摘要

1. **全臺 164 間營業據點完整盤點（[`data/branches_seed.json`](data/branches_seed.json)）**：
   - **啟用（151 間）**：含 `003 營業部`、149 間一般分行、`205 北府簡易型分行`。
   - **灰階停用（13 間）**：4 間國際機場分行（`279`、`115`、`289`、`191`）、4 間簡易型分行（`193`、`194`、`195`、`198`）、5 間一般／園區分行（`033`、`034`、`110`、`047`、`146`）。
2. **相容 `s1~s4` 與 `s1t~s4t` 雙版型容器，僅擷取全分行共通之真實數據**：
   - 自動識別 `<div class="service s1~s4">` 與 `<div class="service s1t~s4t">` 容器，僅擷取所有分行皆具備的**目前叫號（`service_tw`）**與**現場等待人數（`service_tc`）**，不抓取僅少數分行顯示的等待時間，亦不含任何推估公式。
3. **Session-Pinned `lbtRenew` 低負載採集架構（省下 67% 請求數與 85% 流量）**：
   - 於 [`data/session_cache.json`](config.json) 快取各分行 `Service.aspx` 的 Cookie 與 ViewState。
   - 後續輪詢每間分行僅需發送 **1 個 `POST (__EVENTTARGET=lbtRenew)` 請求（~9.3 KB）**，無須重查 `Default.aspx` 與 `Branch.aspx`。
4. **保護銀行系統的五大硬性防線（Hard Safety Guardrails）**：
   - **唯讀鎖死**：`src/client.py` 強制鎖定 `hfKEY=""` 並檢查 `__EVENTTARGET` 白名單，從程式碼層面禁止取號或預約。
   - **預設 Pilot 模式**：預設僅輪詢 5 間代表性分行（`003`、`007`、`012`、`064`、`205`）。
   - **單執行緒 + 隨機抖動（Concurrency = 1 + Jitter）**：同一瞬間絕不超過 1 個請求在途，分行間強制間隔 `1.5s ~ 2.5s`。
   - **慢回應與錯誤斷路器（Circuit Breaker）**：若遇 `429`/`403`/`5xx`、連續 3 次失敗或連續 3 次慢回應（`>3.5s`），立即中止當輪採集並進入 15 分鐘冷卻。
   - **營業時段守門員**：非營業時段（週末、國定假日、平日 `08:55` 前或 `17:00` 後）自動跳過。
5. **零外部強依賴（Zero Mandatory Dependencies）**：
   - 核心採集、解析、SQLite WAL 儲存、每日聚合、本地 Web Dashboard 與單元測試全部基於 **Python 3.11+ 標準庫**，在 macOS 本機與 1GB RAM 的 GCP `e2-micro` 上皆可直接執行。

---

## 2. 快速開始（Quick Start）

所有指令皆可在 `bot-queue-analytics/` 目錄下直接以 `python3` 執行：

### Step 1：初始化 SQLite 資料庫並匯入 164 間分行清單

```bash
cd bot-queue-analytics
python3 scripts/init_db.py
```

（若需連網以 2 次關鍵字搜尋動態重新發現全臺分行，可加上 `--live-discover`）

### Step 2：單次執行低頻唯讀採集（預設 Pilot 5 間分行）

```bash
# 預設僅採集 config.json 設定的 5 間代表性分行 (003, 007, 012, 064, 205)
python3 scripts/run_once.py

# 或指定特定分行測試 Session-Pinned lbtRenew 快取
python3 scripts/run_once.py --branches 003,007

# 非營業時段若需手動單次測試，可加上 --force-off-hours
python3 scripts/run_once.py --branches 003,007 --force-off-hours
```

### Step 3：計算每日統計指標並匯出 CSV

```bash
python3 scripts/aggregate_daily.py --date 2026-11-02
```

輸出檔案位於 `data/daily_metrics_2026-11-02.csv`，同時寫入 SQLite `daily_metrics` 資料表。

### Step 4：啟動本地輕量儀表板（同時預覽 Stage B JSON API）

```bash
python3 -m src.dashboard --db data/bot_queue.db --port 8502
```

瀏覽器開啟 `http://127.0.0.1:8502` 即可依日期、分行篩選檢視每日統計與最新快照；API 端點 `http://127.0.0.1:8502/api/bot-queue/summary` 即為未來 Stage B 整合進 `bank_interview123_selector` 的資料結構。

---

## 3. 執行單元測試

```bash
python3 -m unittest discover -s tests -v
```

測試涵蓋：
- 5 間真實分行匿名化樣本解析（含 `007 館前分行` 的 `s1t` 官方預估等待分鐘數、`012 基隆分行` 跨區塊 5 種業務）。
- 台北市 43 間分行搜尋結果解析（35 間啟用 + 8 間灰階停用）。
- 唯讀安全防線測試（阻擋非空 `hfKEY` 取號與非白名單 PostBack）。
- 統計邊界條件測試（號碼重置／倒退、跨字軌暴衝、長時間缺漏樣本、零速率回傳 `None`/`N/A` 而非 `0 分鐘`）。

---

## 4. 定時排程建議（Cron）

建議先以 **Pilot 模式（5 間分行）、每 5–10 分鐘一次** 連續觀察數個營業日：

```cron
# 週一至週五 09:00-17:00 (Asia/Taipei) 每 5 分鐘執行一次 Pilot 採集
*/5 9-16 * * 1-5 cd /path/to/bank_interview123_selector/bot-queue-analytics && /usr/bin/python3 scripts/run_once.py >> data/collector.log 2>&1

# 每日 17:05 執行當日統計聚合與 CSV 匯出
5 17 * * 1-5 cd /path/to/bank_interview123_selector/bot-queue-analytics && /usr/bin/python3 scripts/aggregate_daily.py >> data/collector.log 2>&1
```

---

## 5. 詳細技術文件

- [Phase 0 網站調查報告 (`docs/site-investigation.md`)](docs/site-investigation.md)
- [統計指標定義與 Stage B 網站整合規格 (`docs/metric-definitions.md`)](docs/metric-definitions.md)
