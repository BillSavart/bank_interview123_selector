# SQLite 切換 + 備份 Runbook（零資料損失）

把正式環境後端從 JSON 檔切到 SQLite（`/data/app.db`），並建立 SQLite 備份機制。
設計目標：**切換前資料零損失、可秒回滾**；捨棄 JSON 後 **靠 SQLite 備份當安全網**。

所有指令都在 VM 上、repo 根目錄執行：

```bash
cd /home/billwang_tech/bank_interview123_selector
```

## 前提

- Phase 2/3 已 push、CI 已自動 build 新 api image 並部署。**因為 `USE_SQLITE` 預設沒設，
  線上此刻仍跑 JSON、行為零變動。** 先確認這個「無痛新 image」已上線：

  ```bash
  DC="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
  $DC logs --tail=5 api      # 看到 "backend JSON /data/ratings.json" = 新 image 已上、仍 JSON
  ```

- ⚠️ **回滾語意**：保留的舊 JSON 只能還原到「切換當下」。切到 SQLite 後寫入的新資料只存在
  `app.db`，回滾 JSON 會遺失那段。真正的長期保險是下面的 SQLite 備份 + 切換前的完整 `/data` 備份。

---

## 1. 一鍵切換

```bash
bash deploy/cutover-to-sqlite.sh
```

腳本會依序：**preflight（確認 image 真的含 better-sqlite3）→ 完整備份 `/data` 成
`data-backup-<時間>.tgz` → 停 api → 跑 migrate（會印每張表搬幾列，對一下數字）→ 設
`USE_SQLITE=1` → 重啟 api → 驗證 log 出現 `backend SQLite`**。結束會印出回滾指令與備份檔位置。

> 防呆：若偵測到「已經切換過」（`USE_SQLITE=1` 且 `/data/app.db` 已存在），腳本會**拒絕**再次
> 執行破壞性的 migrate（避免拿 JSON 覆蓋已在用的 SQLite，尤其 JSON 已捨棄時會清空資料）。
> 真要重新從 JSON 匯入才用 `FORCE=1 bash deploy/cutover-to-sqlite.sh`。

切完務必到前台 + 後台（`https://admin.你的網域`）抽查 ratings / 留言 / 文章 / 行事曆 /
排行榜都讀得到舊資料，並新增一筆確認寫得進去。

### 回滾

```bash
sed -i '/^USE_SQLITE=1$/d' deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api
# log 應變回 "backend JSON /data/ratings.json"
```

### 手動步驟（腳本內部做的事，萬一中途要逐步檢查時參考）

1. 備份：`CID=$($DC ps -q api); docker cp "$CID:/data" ./data-backup-X && tar czf data-backup-X.tgz data-backup-X`
2. `$DC stop api`
3. `$DC run --rm --no-deps api node server/migrate-to-sqlite.mjs`
4. `echo 'USE_SQLITE=1' >> deploy/.env`
5. `$DC up -d api`
6. `$DC logs --tail=5 api`（確認 `backend SQLite`）

---

## 2. SQLite 備份機制（切換後就要開始做）

`cp app.db` **不可靠**（WAL 模式下資料可能還在 `-wal`，會抓到殘缺狀態）。要用線上備份：

```bash
bash deploy/backup-sqlite.sh
```

它在容器內用 `VACUUM INTO` 產生一份一致、單檔的快照到 `/data/backups/app-<時間>.db`
（保留最新 `BACKUP_KEEP` 份，預設 14），再把最新一份 `docker cp` 到 host 的
`./sqlite-backups/`，方便送出本機。

### 排程（cron，每天一次）

```bash
# 這台 VM 預設可能沒裝 cron（crontab: command not found）。先裝：
sudo apt-get update && sudo apt-get install -y cron && sudo systemctl enable --now cron

# 免進編輯器、直接加排程。每天 03:30（刻意避開台北 04:00 = deploy.yml 的每日 build &
# deploy，那時會重建 api 容器）。log 寫到家目錄（一般使用者沒權限寫 /var/log）。
( crontab -l 2>/dev/null; echo '30 3 * * * cd /home/billwang_tech/bank_interview123_selector && bash deploy/backup-sqlite.sh >> "$HOME/sqlite-backup.log" 2>&1' ) | crontab -
crontab -l   # 確認
```

> 不想裝 cron 也可以用 systemd timer（systemd 一定有）：建 `sqlite-backup.service`
> (`Type=oneshot`、`User=<你>`、`WorkingDirectory=repo`、`ExecStart=/bin/bash deploy/backup-sqlite.sh`)
> 與 `sqlite-backup.timer`(`OnCalendar=*-*-* 03:30:00`、`Persistent=true`)，
> 再 `sudo systemctl enable --now sqlite-backup.timer`。

> 補充：`deploy.yml` 有個每日 cron（台北 04:00）會重抓 Google Sheet、重建前端並重新部署。
> 它對 SQLite 無害（`USE_SQLITE=1` 在未進 git 的 `deploy/.env`、資料在 volume），但備份排程
> 要錯開它的時間。也盡量別剛好在 04:00 前後手動跑切換。

### Off-box（重要）

同一台 VM 的備份擋得住程式 bug / 誤刪，但**擋不住 VM 或磁碟整個掛掉**。捨棄 JSON 後尤其要把
備份送出本機，例如：

```bash
gsutil cp sqlite-backups/app-*.db gs://你的bucket/bank-interview/   # GCS
# 或 scp / rclone 到你的異地備份
```

### 還原備份

```bash
$DC stop api
CID=$($DC run -d --no-deps api sleep 600)         # 或直接操作 volume
docker cp ./sqlite-backups/app-XXXX.db "$CID:/data/app.db"   # 覆蓋
# 清掉可能殘留的 -wal/-shm，避免和還原的檔不一致
docker exec "$CID" sh -c 'rm -f /data/app.db-wal /data/app.db-shm'
docker rm -f "$CID"; $DC up -d api
```

---

## 3. 捨棄 JSON 的安全清單（確認後才做）

捨棄 JSON＝拿掉「秒回滾到切換當下」的能力。**滿足全部條件再做**：

- [ ] SQLite 已穩定運行夠久（建議至少數天～一兩週），前後台功能都正常。
- [ ] 切換前的 `data-backup-<時間>.tgz` 還在（裡面有全部 JSON + 當時的 app.db）。
- [ ] `deploy/backup-sqlite.sh` 已在跑、且最新備份能通過 `PRAGMA integrity_check`。
- [ ] 至少有一份 SQLite 備份已送到 **off-box**（GCS / 異地）。

都打勾後，把 JSON 從 volume 移除（先打包再刪，留條後路）：

```bash
CID=$($DC ps -q api)
docker exec "$CID" sh -c 'cd /data && tar czf /data/json-archive-$(date +%F).tgz *.json *.jsonl && rm -f *.json *.jsonl'
docker cp "$CID:/data/json-archive-"*.tgz ./        # 取出封存，連 volume 內那份也可留著
$DC restart api                                      # 確認沒了 JSON 仍正常（SQLite 模式不讀 JSON）
$DC logs --tail=5 api                                # 仍是 backend SQLite、health OK
```

> 之後 compose 裡那些 `*_FILE: /data/*.json` 環境變數可以留著不刪（SQLite 模式根本不讀），
> 或下次順手清掉。`USE_SQLITE=1` 之後就是常態，別再拿掉（拿掉會切回 JSON，但 JSON 已不在 → 空資料）。

## 本機預先驗證

切換前可在本機把整套對拍一次（合成資料、JSON vs SQLite 兩模式逐端點比對 + 寫入重啟讀回）：

```bash
npm run test:parity
```
