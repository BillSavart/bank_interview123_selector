# SQLite 切換 Runbook（零資料損失）

把正式環境的後端從 JSON 檔切到 SQLite（`/data/app.db`）的操作手冊。設計目標：
**切換前的資料零損失、可秒回滾**。

## 前提

- 程式碼已支援 `USE_SQLITE` 開關（Phase 2），且 `Dockerfile.api` 已會編譯
  `better-sqlite3`（Phase 3）。把這些 push 到 main 後，CI 會自動 build 新 image 並部署，
  **但因為 `USE_SQLITE` 預設沒設，線上仍跑 JSON、行為零變動**。先確認這個「無痛新 image」
  已上線，再做下面的切換。
- 切換指令都在 VM 上、compose 所在目錄執行：

  ```bash
  cd /home/billwang_tech/bank_interview123_selector
  DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
  ```

- ⚠️ **回滾語意**：保留的舊 JSON 只能還原到「切換當下」的狀態。切到 SQLite 之後寫入的新
  評分/留言/文章只存在 `app.db`，回滾 JSON 會遺失那段期間的新資料。真正的保險是下面
  步驟 1 的 `/data` 完整備份。

---

## 切換步驟

### 1. 備份整個 /data（最重要，別跳過）

用 `docker cp` 從 api 容器把 `/data` 整包複製出來（走 daemon，不受容器內 `node` 使用者
權限影響）：

```bash
CID=$($DC ps -q api)
docker cp "$CID:/data" "./data-backup-$(date +%F-%H%M)"
tar czf "data-backup-$(date +%F-%H%M).tgz" "data-backup-$(date +%F-%H%M)"
ls -la data-backup-*          # 確認備份檔在、且大小合理
```

### 2. 暫停 api（避免遷移過程中還有寫入造成「快照空窗」）

```bash
$DC stop api                  # 短暫停機；web 仍在，/api 會短暫 502
```

> 若你不想要任何停機，也可以略過這步「線上遷移」，但要接受極小的空窗：遷移拍快照到
> 翻 flag 之間若剛好有人寫入，那一筆會留在 JSON、沒進 DB。低流量時段做、停機幾秒最穩。

### 3. 把 JSON 遷移進 app.db（一次性，腳本只讀 JSON、不改它）

```bash
$DC run --rm api node server/migrate-to-sqlite.mjs
```

輸出會列出每張表搬了幾列（ratings / comments / posts / calendar / leaderboard …）。
**對照一下數字是否合理**（例如留言數、文章數跟你印象相符）。

### 4. 翻開關

編輯 `deploy/.env`，加入（或改成）：

```bash
echo 'USE_SQLITE=1' >> deploy/.env
```

> `deploy/.env` 不在 git 裡（`.env` 已被 gitignore），所以 `git pull` 不會覆蓋它，
> 這個開關是 VM 本地狀態。

### 5. 用新環境重啟 api

```bash
$DC up -d api                 # 重新建立 api 容器，讀到 USE_SQLITE=1
```

### 6. 驗證

```bash
$DC logs --tail=5 api         # 應看到 "backend SQLite /data/app.db"
curl -s https://你的網域/api/health
curl -s https://你的網域/api/ratings        | head -c 300; echo
curl -s https://你的網域/api/posts          | head -c 300; echo
curl -s https://你的網域/api/calendar       | head -c 300; echo
curl -s https://你的網域/api/checkgame/leaderboard
```

再到後台（`https://admin.你的網域`）確認招考行事曆、留言審核、文章管理都讀得到舊資料、
也能新增/編輯。挑一筆做新增→重新整理確認有寫進去。

---

## 回滾（切換後發現問題）

把開關拿掉、重啟即可立刻回到 JSON（舊 JSON 檔一直都還在 volume 裡）：

```bash
sed -i '/^USE_SQLITE=1$/d' deploy/.env   # 或手動把那行刪掉
$DC up -d api
$DC logs --tail=5 api                    # 應看到 "backend JSON /data/ratings.json"
```

> 提醒：回滾後，切到 SQLite 期間寫入的新資料不會出現在 JSON 版（見最上面的回滾語意）。
> 若那段資料重要，先用 `$DC run --rm api node server/migrate-to-sqlite.mjs` 反向不可行
> （腳本是 JSON→DB 單向），需手動從 `app.db` 撈出來。所以切換後若要長期觀察，建議盡早
> 確認沒問題，不要拖太久才決定。

---

## 切換穩定後（選用）

確認 SQLite 跑穩一段時間後，可以：

- 保留最初的 `data-backup-*.tgz` 當長期保險。
- 舊 JSON 檔可留著不動（佔空間極小），或在更有把握後移除（仍建議留備份）。
- 之後備份改成備份 `app.db`（連同 `-wal`/`-shm`，或先 `docker exec ... sqlite3 checkpoint`）。

## 本機預先驗證

切換前可在本機把整套對拍一次（合成資料、JSON vs SQLite 兩模式逐端點比對 + 寫入重啟讀回）：

```bash
npm run test:parity
```
