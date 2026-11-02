# 每日實測統計指標定義與 Stage B 網站整合規格

> **最高原則：零推估模型（Zero Estimation Policy）**  
> 本系統**不計算任何 Little's Law 或外推估算值**。資料庫與報表中的每一個數字，皆為從臺銀線上取號頁面（`Service.aspx`）實際抓到的**百分之百真實觀測數據**及其直接敘述統計（平均值、最大／最小值、發生時間、首末筆紀錄）。

---

## 1. 每次快照直接擷取的頁面真實欄位（`queue_snapshots`）

每次針對某分行查詢 `Service.aspx` 時，僅記錄全分行共通顯示的真實欄位：

1. **`source_reported_at`（`<span id="lbTime">`）**：臺銀伺服器印在頁面上的資料時間（精確到秒，如 `2026/11/02 15:10:11`）。
2. **`current_ticket_raw`（`<p class="service_tw">`）**：頁面上顯示的目前叫號原始字串（如 `"0168"`、`"3128"`）及轉整數之 `ticket_number`（`168`、`3128`）。
3. **`waiting_count`（`<p class="service_tc">`）**：頁面上顯示的現場等待人數（如 `14`、`8`、`0`）。
   *(註：由於並非每間分行都會顯示 `<p class="service_tt">` 等待分鐘數，為保持全臺分行欄位一致性，本系統不抓取該欄位。)*

---

## 2. 每日純實測統計指標（`daily_metrics`）

針對同日（`date_local`，`Asia/Taipei`）、同分行（`branch_id`）、同業務代碼（`service_code`）的所有有效快照，直接計算以下 **100% 真實敘述統計量**：

### A. 觀測時間範圍
- **`first_observed_at` / `last_observed_at`**：當日首筆與末筆快照的頁面時間（`HH:MM:SS`）。

### B. 現場等待人數實測統計
- **`avg_waiting_count`**：當日所有採樣之現場等待人數算術平均（$\frac{1}{N}\sum w_i$）。
- **`min_waiting_count`**：當日實測最低等待人數。
- **`max_waiting_count`**：當日實測最高等待人數。
- **`max_waiting_at`**：當日最高等待人數發生的實際時間點（`HH:MM:SS`）。
- **`peak_hour_local`**：當日實測平均等待人數最高的小時區段（如 `14:00-15:00`、`15:00-16:00`）。

### C. 總叫號人數實測統計
- **`total_called_count`（總叫號人數）**：當首末筆屬於同一字軌且末筆 $\ge$ 首筆時，直接記錄 `當日末筆叫號 - 當日首筆叫號` 的實際叫號人數差值（例如從 `0162` 號叫到 `0190` 號，總叫號人數即為 `28`）。

---

## 3. Stage B 整合規格（對接 `bank_interview123_selector`）

當資料累積穩定後，現有專案 `server/ratings-api.mjs` 可透過 `better-sqlite3` 以 `{ readonly: true }` 掛載 `bot_queue.db`，並提供以下公開唯讀端點：

1. `GET /api/bot-queue/summary`：
   - 回傳各分行各業務之每日實測統計（`avg_waiting_count`、`max_waiting_count`、`max_waiting_at`、`peak_hour_local`、`total_called_count`）與最新快照。
