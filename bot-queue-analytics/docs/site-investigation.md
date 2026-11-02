# 臺灣銀行線上取號系統（`ino.bot.com.tw`）技術調查報告（Phase 0）

> **調查日期**：2026-11-02  
> **目標網址**：`https://ino.bot.com.tw/INOWeb/ImmOrder/Service.aspx`  
> **最高指導原則**：**零干擾、嚴格唯讀、不影響銀行系統正常運作**。

---

## 1. 實際支援分行數量與分類統計

透過 `https://ino.bot.com.tw/INOWeb/ImmOrder/Branch.aspx` 盤點全臺 22 個縣市並以 `branch_id`（3 碼字串）去重後：

- **系統登錄國內營業據點總數**：**164 間**
  - **可查詢／已啟用（Enabled，`disabled=false`）**：**151 間**
    - 包含 `003 營業部`、149 間一般分行，以及 1 間簡易型分行（`205 北府簡易型分行`）。
  - **灰階停用（Disabled，`<input ... disabled>` + `<td class="csp-muted">`）**：**13 間**
    - **國際機場分行（4 間）**：`279 臺北國際機場分行`、`115 桃園國際機場分行`、`289 臺中國際機場分行`、`191 高雄國際機場分行`
    - **簡易型分行（4 間）**：`193 永吉簡易型分行`、`194 東門簡易型分行`、`195 愛國簡易型分行`、`198 臺電簡易型分行`
    - **一般／科學園區分行（5 間）**：`033 南門分行`、`034 公館分行`、`110 中崙分行`、`047 潭子分行`、`146 臺南科學園區分行`

### 各縣市分行數分佈（共 22 縣市、164 間）

| 縣市 | 總據點數 | 啟用數 | 停用數 | 停用分行（代碼與名稱） |
| --- | ---: | ---: | ---: | --- |
| 台北市 | 43 | 35 | 8 | `033` 南門、`034` 公館、`110` 中崙、`193` 永吉簡易、`194` 東門簡易、`195` 愛國簡易、`198` 臺電簡易、`279` 臺北機場 |
| 高雄市 | 24 | 23 | 1 | `191` 高雄國際機場 |
| 台中市 | 22 | 20 | 2 | `047` 潭子、`289` 臺中國際機場 |
| 新北市 | 19 | 19 | 0 | —（`205` 北府簡易型分行為啟用狀態） |
| 桃園市 | 12 | 11 | 1 | `115` 桃園國際機場 |
| 台南市 | 10 | 9 | 1 | `146` 臺南科學園區 |
| 屏東縣 | 5 | 5 | 0 | — |
| 新竹市、彰化縣、南投縣、嘉義市、宜蘭縣 | 各 3（共 15） | 15 | 0 | — |
| 新竹縣、苗栗縣、雲林縣、花蓮縣 | 各 2（共 8） | 8 | 0 | — |
| 基隆市、嘉義縣、台東縣、澎湖縣、連江縣、金門縣 | 各 1（共 6） | 6 | 0 | — |
| **合計** | **164** | **151** | **13** | — |

### 低干擾快速發現機制（2 次搜尋取代 22 次縣市輪詢）
實測 `Branch.aspx` 的關鍵字搜尋（`txtKey` + `__EVENTTARGET=lbtSearch2`）係對分行名稱做子字串比對：
1. 搜尋 `txtKey="分行"`：單次回傳 **163 間**（含所有一般分行、簡易型分行、機場分行）。
2. 搜尋 `txtKey="營業部"`：單次回傳 **1 間**（`003 營業部`）。
因此 `src/discover.py` 僅需 **2 次搜尋請求**即可動態更新全臺 164 間分行清單與啟用狀態。完整種子清單已保存於 [`data/branches_seed.json`](../data/branches_seed.json)。

---

## 2. 頁面欄位結構與業務種類（`Service.aspx`）

進入任一啟用分行的 `Service.aspx` 後，**單次 HTML 回應（約 `7.6 KB ~ 11.1 KB`）即包含該分行的所有業務類別**，無須依業務分次請求。

### 2.1 分行層級欄位
- `span#lbTime`：伺服器端資料時間，格式 `YYYY/MM/DD HH:MM:SS`（`Asia/Taipei`，精確至秒）。
- `span#lbBrname`：分行名稱（如 `營業部`、`館前分行`）。
- `span#lbPhone`、`span#lbAddr`：電話與地址。
- `input#hfPageValid`：`"true"` 表正常開放線上取號／查詢；`"false"` 時前端彈出 `#CLOSEMESSAGE`（預設文字：`線上取號時間已結束`）。
- `a#lbtRenew`：`javascript:__doPostBack('lbtRenew','')`，可在同一頁面直接刷新即時叫號資料。

### 2.2 業務層級欄位與兩種 DOM 變體
每個業務區塊位於 `<div class="center_area service_area">` 內（若超過 4 個業務會拆成多個 `.service_area`）：
- **變體 A（一般型 `<div class="service s1~s4">`）**：
  - `p.service_title`：業務名稱（如 `外匯業務`、`一般收付`、`服務台`、`公庫業務`、`公司團體`、`個人帳戶`）。
  - `p.service_ty`：業務細項說明（以 `<br>` 分隔）。
  - `p.service_tw`：**目前叫號號碼**（4 碼字串，如 `0510`、`3125`）。
  - `p.service_tc`：**現場等待人數**（非負整數，如 `2`、`0`）。
  - `a.js-order-link[data-order-key]`：**業務唯一識別碼**（9 碼字串，如 `001000001`、`002000001`）。
- **變體 B（含官方預估等待時間型 `<div class="service s1t~s4t">`）**：
  - 除上述欄位外，額外包含 **`p.service_tt`**：例如 `5&nbsp;<span>分鐘</span>`，為臺銀系統本身計算之**官方預估等待分鐘數**。

### 2.3 五間代表性分行之真實解析結果（2026-11-02 14:52 實測）

```json
{
  "003": {
    "branch_name": "營業部",
    "data_time": "2026/11/02 14:52:17",
    "page_valid": true,
    "services": [
      {"slot": "s1", "service_code": "001000002", "service_name": "外匯業務", "current_ticket_raw": "0510", "waiting_count": 2, "official_wait_minutes": null},
      {"slot": "s2", "service_code": "001000005", "service_name": "外幣兌換", "current_ticket_raw": "0065", "waiting_count": 1, "official_wait_minutes": null},
      {"slot": "s3", "service_code": "002000001", "service_name": "一般收付", "current_ticket_raw": "0127", "waiting_count": 5, "official_wait_minutes": null}
    ]
  },
  "007": {
    "branch_name": "館前分行",
    "data_time": "2026/11/02 14:52:21",
    "page_valid": true,
    "services": [
      {"slot": "s1t", "service_code": "001000001", "service_name": "一般收付", "current_ticket_raw": "0162", "waiting_count": 9, "official_wait_minutes": 5},
      {"slot": "s2", "service_code": "001000002", "service_name": "外匯業務", "current_ticket_raw": "3125", "waiting_count": 4, "official_wait_minutes": null},
      {"slot": "s3", "service_code": "001000003", "service_name": "服務台", "current_ticket_raw": "1011", "waiting_count": 0, "official_wait_minutes": null}
    ]
  },
  "012": {
    "branch_name": "基隆分行",
    "data_time": "2026/11/02 14:52:23",
    "page_valid": true,
    "services": [
      {"slot": "s1", "service_code": "001000003", "service_name": "服務台", "current_ticket_raw": "0522", "waiting_count": 4, "official_wait_minutes": null},
      {"slot": "s2", "service_code": "001000009", "service_name": "公庫業務", "current_ticket_raw": "0744", "waiting_count": 6, "official_wait_minutes": null},
      {"slot": "s3", "service_code": "001000020", "service_name": "公司團體", "current_ticket_raw": "0442", "waiting_count": 0, "official_wait_minutes": null},
      {"slot": "s4", "service_code": "001000021", "service_name": "個人帳戶", "current_ticket_raw": "0223", "waiting_count": 2, "official_wait_minutes": null},
      {"slot": "s1", "service_code": "002000002", "service_name": "外匯業務", "current_ticket_raw": "0446", "waiting_count": 1, "official_wait_minutes": null}
    ]
  },
  "205": {
    "branch_name": "北府簡易型分行",
    "data_time": "2026/11/02 14:52:24",
    "page_valid": true,
    "services": [
      {"slot": "s1", "service_code": "001000001", "service_name": "一般收付", "current_ticket_raw": "0169", "waiting_count": 0, "official_wait_minutes": null}
    ]
  },
  "064": {
    "branch_name": "松山分行",
    "data_time": "2026/11/02 14:52:26",
    "page_valid": true,
    "services": [
      {"slot": "s1", "service_code": "001000001", "service_name": "一般收付", "current_ticket_raw": "0168", "waiting_count": 5, "official_wait_minutes": null},
      {"slot": "s2", "service_code": "001000002", "service_name": "外匯業務", "current_ticket_raw": "0599", "waiting_count": 0, "official_wait_minutes": null},
      {"slot": "s3", "service_code": "001000003", "service_name": "服務台", "current_ticket_raw": "0305", "waiting_count": 0, "official_wait_minutes": null}
    ]
  }
}
```

---

## 3. Session 狀態機與「零干擾」採集設計（Session-Pinned `lbtRenew`）

### 3.1 伺服器端 Session 驗證規則
1. 未帶有效 `ASP.NET_SessionId` 直接 `GET /INOWeb/ImmOrder/Service.aspx` 會收到 `302 Found -> /INOWeb/SessionLogout.aspx -> /INOWeb/Default.aspx`。
2. 在 `Branch.aspx` 送出 `lbtCheck` 時，伺服器會驗證 `hfBRNO` 必須位於該 Session **最近一次搜尋結果清單內且非 `disabled`**；若跨區偽造 `hfBRNO` 或在 Session 已進入 `Service.aspx` 後直接對 `Branch.aspx` 重送舊 ViewState，伺服器會立即回傳 `302 -> /INOWeb/SessionLogout.aspx?err=0` 並銷毀 Session。
3. 當 Session 位於某分行的 `Service.aspx` 時，送出 `POST /INOWeb/ImmOrder/Service.aspx`（`__EVENTTARGET=lbtRenew`、`hfKEY=""`），伺服器會直接回傳 `200 OK`（約 `9.3 KB`）與最新 `lbTime` 及叫號快照。

### 3.2 保護銀行系統的五大硬性防線（Hard Safety Guardrails）
1. **程式碼層級唯讀鎖死（Read-Only Lock）**：
   - 在 `client.py` 中強制將 `hfKEY` 設為空字串 `""`，且 `__EVENTTARGET` 僅允許白名單 `{"lbtImmOrder", "lbtSearch", "lbtSearch2", "lbtCheck", "lbtRenew"}`，**從程式碼層面杜絕誤觸取號（`confirmSubmit`）或預約功能的可能**。
2. **Session-Pinned `lbtRenew` 快取（減少 67% 請求數與 85% 流量）**：
   - 將每個目標分行的 Cookie 與 `Service.aspx` ViewState 快取於 `data/session_cache.json`。
   - 常態輪詢時，每間分行**僅發送 1 個 `lbtRenew` POST 請求（9.3 KB）**，不再重複查詢 `Default.aspx` 與 `Branch.aspx`。
3. **預設僅輪詢 5 間測試分行（Pilot Mode）與嚴格單執行緒順序執行（Concurrency = 1）**：
   - 預設僅針對 5 間代表性分行（`003`、`007`、`012`、`064`、`205`）採集；全站採集須明確指定旗標，且強制 `concurrency = 1`（同一瞬間絕不超過 1 個請求在途），請求間強制間隔 `1.5s ~ 2.5s`（含隨機 Jitter）。
4. **慢回應與錯誤斷路器（Circuit Breaker）**：
   - 若連續 3 次出現 HTTP 錯誤（`429`/`403`/`5xx`/逾時）或伺服器回應時間超過閾值（`3.5 秒`），立即中止當輪採集並進入 `15 分鐘` 冷卻期（記錄於 `data/circuit_breaker.json`），絕不對銀行系統重試轟炸。
5. **營業時段守門員（Business Hours Gate）**：
   - 非營業時段（週六日、國定假日、平日 `08:55` 前或 `17:00` 後）自動跳過排程，不在非營業時間消耗銀行伺服器資源。
