# 可靠度：目標、監看、出事怎麼辦、上線檢查

這份寫的是 DropOut OS 正式營運時「多穩、怎麼知道壞了、壞了誰做什麼」。數字是對客戶的承諾，SLA 頁用同一組數字；改數字要兩邊一起改。

## 目標

| 項目 | 目標 | 白話 |
| --- | --- | --- |
| 月可用率 | **99.5%** | 30 天的月份，加起來最多約 3 小時 36 分不能用 |
| RPO（最多掉多少資料） | **24 小時** | 每天備份一次；最壞情況回到前一次備份 |
| RTO（多久恢復） | **8 小時** | 從確認出事到客戶能再用 |
| 嚴重事故回應 | **2 小時內** | 有人回覆受影響的公司：發生什麼、正在做什麼、下次什麼時候更新 |
| 支援時段 | **週一至週五 09:00–18:00**（台灣時間） | 一般問題在這個時段回覆 |

支援時段外的嚴重事故怎麼算、事先公告的維護算不算停機，以 SLA 頁的文字為準。

### 可用率怎麼算

膠水每 5 分鐘檢查每家沒解約的公司兩件事：

- 那家的 ERPNext：`/api/method/ping` 要回 `pong`（8 秒內）
- 那家的殼網址：`/api/health` 要回 `ok: true`（8 秒內）

每一次檢查都記進 D1（`monitor_daily`），可用率＝成功次數 ÷ 檢查次數。一次失敗就算進去，所以這個數字比實際停機嚴格一點。營運後台與 `/status` 都看得到近 30 天的數字。

### 事故的嚴重程度

| 等級 | 什麼情況 | 回應 |
| --- | --- | --- |
| 嚴重 | 一家以上的公司完全不能用（打不開、不能登入、不能開單）；資料可能遺失或外洩；金流、電子發票開錯 | 2 小時內 |
| 一般 | 某個功能壞了但有別的方法做（例：LINE 訊息晚到、會議紀錄沒出來） | 支援時段內，下一個工作天前 |
| 輕微 | 畫面問題、使用問題 | 支援時段內 |

## 怎麼知道壞了

| 誰在看 | 看什麼 | 壞了會怎樣 |
| --- | --- | --- |
| 膠水排程（每 5 分鐘） | 每家公司的 ERPNext 與殼 | 連續 2 次失敗（約 10 分鐘）開一筆事故；恢復時關掉。有變化就通知營運一次，也記在那家公司的歷史（動作「連不上」「恢復」） |
| 外部監看（GitHub Actions `uptime.yml`，每 10 分鐘） | 膠水 `GET /health`、`GET /status`（膠水自己的排程有沒有在跑）；殼 `GET /api/health`、`GET /status` | 膠水自己掛掉時，膠水的排程也不會跑，**一定要有外部的人看膠水**。任何一項不對，這次執行就失敗（GitHub 會寄信給設定了通知的人）；有設 `ALERT_WEBHOOK_URL` 的話，壞掉與恢復各發一則。要更密就另外加 Cloudflare Health Checks 或 UptimeRobot |
| 膠水每日排程（台灣 02:00） | 每家公司 R2 裡最新的備份 | 超過 26 小時沒有新備份、或最新的一份只在本機沒上傳 R2，開一筆「備份」事故並通知；公司歷史記「備份過期」，好了記「備份恢復」。這種事故不上 `/status`（客戶還能用） |
| 膠水每日排程 | 解約滿 90 天的公司 | 每家通知一次「N 家解約滿 90 天，等刪除」，營運後台列在最上面。**不會自動刪**（見「解約後刪除」） |
| Workers Logs | 膠水與殼的紀錄、traces | 膠水的錯誤一行一個 JSON：`level`、`event`、`site`。常用的 `event`：`job.dead_letter`（同步放棄、進死信）、`monitor.failed`（監看本身失敗）、`monitor.budget_exhausted`（一輪沒檢查完）、`alert.not_sent`（通知沒送出去）、`scheduled.failed` |
| 公開狀態頁 `/status` | 平台整體（畫面、系統同步、ERPNext） | 客戶自己可以看；不顯示任何公司名稱或網址。在公司自己的網址打開，會多一塊「這個網址的公司」 |

通知送到哪：

- `ALERT_WEBHOOK_URL`（膠水的 secret，要 https）：Slack、Discord、Google Chat 的 incoming webhook 直接貼；其他服務收到的是 `text`、`content`、`message` 和 `events`。要 Bearer token 的加設 `ALERT_WEBHOOK_TOKEN`。
- `PLATFORM_NOTIFY`＋`PLATFORM_MAIL_FROM`：經 Cloudflare Email 寄到營運信箱（要先在 Email Routing 驗證）。
- 兩個都沒設：只記在公司歷史和 Workers Logs（`alert.not_sent`）。

一個主機壞掉時所有公司會一起連不上，通知會合成一則（最多列 30 家，其餘看營運後台）。

### 每種通知是什麼意思、先做什麼

| 通知 | 意思 | 先做 |
| --- | --- | --- |
| 「N 個連不上」 | 那幾家的 ERPNext 或殼連續 2 次（約 10 分鐘）沒回應 | 照下面「出事時的流程」 |
| 「N 個恢復」 | 同一批又回應了 | 看死信、寫事後檢討 |
| Uptime 執行失敗／「[DropOut OS 外部監看] 有 N 項連不上」 | 從 GitHub 打不到膠水或殼，或膠水 `/status` 說自己的排程沒在跑 | 先看是不是 Cloudflare 全面出事（cloudflarestatus.com）；不是的話 `glue/` 跑 `npx wrangler tail`、看最近一次部署 |
| 「備份：…沒有設定異地備份」 | 那站的 S3 Backup Settings 沒打開 | `dropout-onboard provision --backup-bucket … --apply` 重跑一次（做過的步驟會略過） |
| 「備份：讀不到 R2」 | 那站讀 bucket 失敗（金鑰過期、bucket 改名） | 換 R2 金鑰後在那站的 S3 Backup Settings 更新 |
| 「備份：最新備份沒有上傳到 R2」「R2 裡沒有備份（上傳失敗）」 | 本機有備份，上傳失敗；ERPNext 只寄信不報錯 | 那站 Error Log 與營運信箱找「Backup Upload Failed」；空間不足時清 `private/backups` |
| 「備份：R2 最新備份是 N 小時前」 | 每日備份沒跑，或資料庫超過 1 GB（ERPNext 只在 1 GB 以下每天重做備份） | `bench --site <site> backup --with-files` 後在 S3 Backup Settings 按「Take Backup Now」；大站改用主機 cron 跑 `bench backup` |
| 「N 家解約滿 90 天，等刪除」 | 合約上的資料保留期滿 | 確認客戶已經拿到資料，跑 `fleet purge`（見「解約後刪除」） |
| GitHub「D1 backup」失敗 | 膠水 D1 的每日匯出沒做成 | 看那次執行的紀錄；Time Travel 還在，不急，但當天要補 |

## 出事時的流程

### 1. 確認（收到通知後 15 分鐘內）

1. 打開 `/status` 與營運後台，看是一家、幾家、還是全部。
2. 自己打一次：`curl https://<erpnext 網址>/api/method/ping -H "X-Frappe-Site-Name: <site>"`、`curl https://<殼網址>/api/health`。
3. Workers Logs 篩 `level = "error"`，看最近 30 分鐘。

### 2. 判斷是哪一段壞

| 症狀 | 多半是 | 先做 |
| --- | --- | --- |
| 所有公司的 ERPNext 都連不上 | 主機、Tunnel、MariaDB | 主機上 `docker compose ps`、看 `cloudflared` 的紀錄（Tunnel token 過期或容器停了）；Coolify 重啟該資源 |
| 只有一家的 ERPNext 連不上 | 那個 site 本身 | `bench doctor --site <site>`、看 `sites/<site>/logs`；確認 site 沒有被設成 `maintenance_mode`；資料庫空間 |
| 所有殼網址都連不上 | 殼的 Worker 或網域設定 | Cloudflare 後台看 `dropout-os` 的錯誤；剛部署過就 `npx wrangler rollback`（在 `web/`） |
| 殼打得開，但每頁都「現在拿不到資料」 | 膠水或 ERPNext | 看殼的 `/api/health` 裡 `glue.ok`；膠水剛部署過就在 `glue/` 跑 `npx wrangler rollback` |
| LINE、表單、金流通知沒進 ERPNext | 膠水的佇列或 ERPNext 拒收 | 營運後台看那家的死信，修好原因後重送；Queues 後台看積壓 |
| 資料被誤刪、改壞 | 人或程式 | 先 `bench --site <site> backup` 留現況，再決定從哪一個備份還原（見下面「備份」） |
| 膠水的 D1 壞了或被誤改 | — | 見下面「膠水 D1 還原」 |
| 整台主機壞了 | — | 見下面「整台主機壞掉」 |

### 3. 對外說

- 嚴重事故：2 小時內寫信給受影響公司的聯絡人（營運後台有聯絡信箱）：發生什麼、影響什麼、正在做什麼、下次更新的時間。不知道原因就說還在查，不要猜。
- `/status` 會自動顯示事故；不用手動改。
- 每 2 小時更新一次，直到恢復。

### 4. 恢復之後

1. 確認 `/status` 回到正常、通知收到「恢復」。
2. 營運後台重送這段時間的死信（金流、電子發票先看金額與單號再送）。
3. 5 個工作天內寫事後檢討：時間線、影響了誰多久、根本原因、怎麼修在根源（不是只把症狀遮掉，見 [ARCHITECTURE.md](ARCHITECTURE.md) 選型原則第 3 條）、要改的設定或程式。

## 備份與還原

| 資料 | 怎麼備份 | 多久一次 | 放哪 |
| --- | --- | --- | --- |
| 每家公司的 ERPNext | ERPNext 內建 S3 備份（`dropout-onboard provision --backup-bucket`），含附件；System Settings 打開「Encrypt Backups」就是 gpg 加密 | 每天 | R2 `<site>/<時間>/` |
| Chatwoot、Vexa 的 Postgres | Coolify 排程備份 | 每天 | R2 |
| 膠水的 D1（公司、合約、網址、監看） | D1 Time Travel 自動保留 30 天（Workers Paid；免費方案 7 天）；另外每天 `glue/scripts/d1-backup.sh export`（GitHub Actions `d1-backup.yml`，台灣 05:30） | 自動／每天 | Cloudflare／R2 `d1/dropout-glue/<時間>.sql.gz` |
| 解約公司的最後一份 | `fleet purge` 刪站前做 | 一次 | R2 `purged/<site>/<時間>/`，30 天後刪 |

**R2 bucket 的規則**（建 bucket 時設一次）：

```bash
npx wrangler r2 bucket lifecycle add <bucket> purged-final purged/ --expire-days 30   # 最後備份保留 30 天
npx wrangler r2 bucket lifecycle add <bucket> d1-exports d1/ --expire-days 90         # D1 匯出保留 90 天
```

每站的每日備份 ERPNext 不會自己刪，數量會一直長；要限制就對整個 bucket 加一條 `--expire-days 30`（**不要**低於 `/legal` 寫的保存天數），或依站加前綴規則。

**加密備份的金鑰**：Encrypt Backups 打開後，金鑰是那站 `site_config.json` 的 `backup_encryption_key`。ERPNext 每次會把 `site_config_backup.json`（含這把金鑰與 `encryption_key`）**不加密**一起上傳，所以還原不用另外找金鑰，但也代表拿到 bucket 就能解開備份：R2 金鑰只給備份用、bucket 不公開。另外在密碼管理器存一份每站的 `backup_encryption_key`，`site_config_backup` 不見時用 `--encryption-key` 或 `BACKUP_ENCRYPTION_KEY` 帶進去。

### 每月還原演練

| 什麼時候 | 做什麼 |
| --- | --- |
| 第一家公司上線前 | `backup verify <site> --from-r2 --with-files --apply`，報告存起來 |
| 每月第一個週三 | 輪流一家（依營運後台的順序），從 R2 還原，含附件 |
| 每季第一個月 | 另外在一台空主機跑 `fleet restore-all --from-r2 --site <兩家> --apply`，量整台重建的時間 |
| 每季 | `glue/scripts/d1-backup.sh fetch` 下載最新一份，`wrangler d1 execute <空的測試資料庫> --remote --file=<sql>` 載得進去 |

```bash
# 在 backend 容器裡（docker compose exec backend bash）
export BACKUP_ACCESS_KEY_ID=… BACKUP_SECRET_ACCESS_KEY=… BACKUP_BUCKET=… BACKUP_ENDPOINT=https://<account>.r2.cloudflarestorage.com
dropout-onboard backup verify <site> --from-r2 --with-files                       # 預演：列出 R2 最新的一份與每一步
DB_ROOT_PASSWORD=… dropout-onboard backup verify <site> --from-r2 --with-files --apply
```

它從 R2 下載最新的一份到 `~/.dropout-onboard/r2-downloads/`（權限 700，做完刪掉），還原到暫存站 `restore-drill.<site>`（排程暫停、不寄信），比對單據筆數與資料檢查，刪掉暫存站（連 `archived/sites` 的封存都不留），報告寫在 `~/.dropout-onboard/restore-drills/`。備份超過 24 小時、加密卻找不到金鑰、還原失敗、單據變 0 筆都算沒通過。報告裡的「下載加還原花了幾分鐘」拿來估 RTO。

想排程的話，主機上的 cron（每月 1 日 03:00，台灣時間；金鑰放在只有 root 能讀的檔）：

```cron
0 3 1 * * set -a; . /root/dropout-backup.env; docker compose -f <repo>/deploy/erpnext/compose.yml exec -T -e BACKUP_ACCESS_KEY_ID -e BACKUP_SECRET_ACCESS_KEY -e BACKUP_BUCKET -e BACKUP_ENDPOINT -e DB_ROOT_PASSWORD backend dropout-onboard backup verify <site> --from-r2 --with-files --apply >> /var/log/dropout-drill.log 2>&1
```

`/root/dropout-backup.env`（權限 600）一行一個 `KEY=值`；`-e KEY` 不帶值，從 cron 的環境帶進容器，不會出現在 `ps` 或紀錄裡。容器重建後 toolkit 要重新 `pip install`，或裝進 ERPNext 映像。

沒通過時 exit code 是 1，配合 cron 的 `MAILTO` 或主機監看就會有人知道。

### 膠水 D1 還原

先決定要回到哪個時間點（出事前一刻），再：

```bash
cd glue
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
scripts/d1-backup.sh info 2026-10-11T01:00:00+08:00      # 那個時間點的 bookmark
scripts/d1-backup.sh restore 2026-10-11T01:00:00+08:00   # 要打資料庫名稱確認；會印出還原前的 bookmark
```

Time Travel 是原地還原：之後的變更（新公司、續約、監看紀錄）都會消失，寫下印出的「還原前 bookmark」，回錯時間就 `npx wrangler d1 time-travel restore dropout-glue --bookmark=<它>` 再回來。超過 30 天、或整個資料庫被刪掉時，用每日匯出：

```bash
npx wrangler d1 create dropout-glue-restore
D1_BACKUP_BUCKET=… scripts/d1-backup.sh fetch d1/dropout-glue/<時間>.sql.gz /tmp/glue.sql.gz && gunzip /tmp/glue.sql.gz
npx wrangler d1 execute dropout-glue-restore --remote --file=/tmp/glue.sql
```

再把 `wrangler.jsonc` 的 `database_id` 換成新的、`npm run deploy`。匯出時資料庫會暫停接其他查詢，所以排程避開 02:00 的每日工作。

### 整台主機壞掉（RTO 8 小時）

| 時間 | 做什麼 |
| --- | --- |
| 0:00–0:30 | 確認是主機（不是 Tunnel 或 Cloudflare）；`/status` 已自動顯示事故；寫信給所有公司（2 小時內） |
| 0:30–2:00 | 新主機照 [deploy/README.md](../deploy/README.md) 裝好 Coolify、MariaDB、ERPNext 映像（同一個 `TUNNEL_TOKEN`，網址不用改，**先不要**啟動 cloudflared） |
| 2:00– | `fleet restore-all --from-r2` 預演、再 `--apply`（見下面） |
| 完成後 | 啟動 cloudflared；`/status` 全部正常；營運後台重送死信；抽一家 `backup verify` |

```bash
# 新主機的 backend 容器裡
export BACKUP_ACCESS_KEY_ID=… BACKUP_SECRET_ACCESS_KEY=… BACKUP_BUCKET=… BACKUP_ENDPOINT=… GLUE_URL=https://<glue> GLUE_ADMIN_TOKEN=…
dropout-onboard fleet restore-all --from-r2                                         # 預演：每家用哪一份、多大
DB_ROOT_PASSWORD=… dropout-onboard fleet restore-all --from-r2 --mariadb-user-host-login-scope='%' --apply
```

- 要還原哪些：有給膠水就是膠水裡所有沒刪除的公司，**付費的先、解約的最後**；沒有膠水就是 bucket 裡每個資料夾；`--site` 可以只做幾家（多台主機分著跑）。
- 每一家：下載 → `bench new-site` → 把舊的 `site_config` 帶回來（`encryption_key` 一定要，不然存過的密碼都解不開；資料庫帳密用新的）→ `bench restore` 含附件與加密金鑰 → `bench migrate` → 刪下載檔。
- 一家失敗會把做一半的站刪掉、繼續下一家；最後列出沒還原的。修好再跑一次，已經在這台的會略過。
- 進度同時寫在畫面與 `~/.dropout-onboard/restore-all/<時間>.log`，每家做完更新 `state.json`，並估計還要多久；估計會超過 8 小時就再開一台，用 `--site` 分掉一部分。
- Docker 上 MariaDB 在另一個容器，要 `--mariadb-user-host-login-scope='%'`（和 `bench new-site` 同一個參數）。

膠水在這段時間會把 webhook 留在佇列與死信，恢復後重送。

### 解約後刪除

合約：解約後 90 天內只能看、能匯出（設定 →「下載全部資料」）；第 91 天起刪除。膠水每天列出到期的公司、通知一次，**不會自動刪**。

```bash
dropout-onboard fleet purge <site>                       # 預演：確認膠水說已滿 90 天，列出會刪的東西
DB_ROOT_PASSWORD=… dropout-onboard fleet purge <site> --apply   # 會要你打站台名稱確認（排程用 --yes）
dropout-onboard fleet purge-sweep                        # 預演：purged/ 裡超過 30 天的最後備份
dropout-onboard fleet purge-sweep --apply                # 要打 delete 確認
```

`fleet purge --apply` 依序：最後備份上傳到 `purged/<site>/<時間>/` 並核對大小 → `bench drop-site`（不留封存）→ 刪 R2 `<site>/` 的每日備份 → 膠水標記已刪除（清掉網址、設定與用量，帳戶與紀錄留著）。每一步都記在那家公司的歷史，操作的人是 `USER`；紀錄也寫在 `~/.dropout-onboard/purges/`。中間失敗就停，修好再跑一次會從停的地方接著做。最後備份 30 天後由 `purge-sweep` 或 bucket 規則刪掉，`purge-sweep` 會在歷史記「刪除最後備份」。

Chatwoot、Vexa 裡這家的資料不在這個指令裡，要在那兩邊的後台刪。全部刪完後寫信告訴客戶的聯絡人（合約寫了會通知）。

## 正式上線檢查清單

照順序做；每一項做完打勾，卡住就停在那一項，不要跳過。

**Cloudflare 帳號**

- [ ] Workers Paid 方案（膠水用 Queues 就要）
- [ ] API token（Workers、D1、Queues、R2 權限），放在 CI 或 Cursor Secrets，不進 git

**膠水（先部署，殼要用它）**

- [ ] `npx wrangler d1 create dropout-glue`，把 `database_id` 填進 `glue/wrangler.jsonc`
- [ ] `npx wrangler queues create dropout-jobs`、`npx wrangler queues create dropout-jobs-dlq`
- [ ] `npm run db:migrate`（`0001`–`0008` 都要是 ✅）
- [ ] 殼設定 `PORTAL_SECRET`（至少 32 個字元，客戶入口連結簽章用；換掉會讓已寄出的連結全部失效）
- [ ] secrets：`TENANT_KEY`（`openssl rand -base64 32`，另外存一份在密碼管理器，掉了所有公司的金鑰都解不開）、`ADMIN_TOKEN`、`SHELL_TOKEN`、`ALERT_WEBHOOK_URL`；選用 `RESEND_API_KEY`、`TURNSTILE_SECRET`、`ALERT_WEBHOOK_TOKEN`
- [ ] vars：`PLATFORM_MAIL_FROM`、`PLATFORM_NOTIFY`（在 Email Routing 驗證過）
- [ ] `npm run deploy`，`curl https://<glue>/health` 回 `ok: true`

**主機**

- [ ] Coolify 裝好，介面放在 Cloudflare Access 後面
- [ ] `docker network create dropout`；ERPNext 映像 build 好；`DB_ROOT_PASSWORD` 設在 Coolify
- [ ] `deploy/erpnext`、`deploy/chatwoot` 跑起來
- [ ] Tunnel：建 Tunnel、`TUNNEL_TOKEN` 設在 `deploy/cloudflared`；Public Hostname 指到 ERPNext frontend 與 Chatwoot；主機不開對外埠
- [ ] R2 bucket 建好，金鑰只給備份用；加上 `purged/`、`d1/` 的 lifecycle 規則（見「備份與還原」）

**殼**

- [ ] secrets：`GLUE_URL`、`SHELL_TOKEN`、`SESSION_SECRET`（32 字元以上）；有 Chatwoot 再加 `CHATWOOT_PLATFORM_TOKEN`
- [ ] `npm run deploy`；網域 `*.os.dropout.tw` 指到 Worker `dropout-os`
- [ ] `curl https://<任一殼網址>/api/health` 回 `ok: true` 且 `glue.ok: true`
- [ ] `/status` 不再顯示「示範資料」

**營運後台**

- [ ] 另一份殼部署，只設 `GLUE_URL`、`GLUE_ADMIN_TOKEN`、`PLATFORM_ADMINS`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`
- [ ] Cloudflare Access 應用程式擋在前面；名單外的 Email 進不來

**第一家公司**

- [ ] `dropout-onboard bootstrap`（或 `provision`）先預演再 `--apply`，加 `--backup-bucket`、`--backup-endpoint`
- [ ] 營運後台看得到這家，合約階段正確
- [ ] 10 分鐘後 `/status` 的 ERPNext、畫面都是「正常」
- [ ] 第二天確認 R2 裡有這站的第一份備份

**還原演練**

- [ ] `dropout-onboard backup verify <site> --from-r2 --with-files --apply` 通過，報告存起來
- [ ] 記下還原花的時間，確認全部站加起來在 8 小時內

**通知測試**

- [ ] 用管理 API 登記一家測試公司，網址指到不存在的地方：
  `curl -X PUT https://<glue>/admin/accounts/alert-test.local -H "authorization: Bearer $ADMIN_TOKEN" -d '{"company":"通知測試","hosts":["alert-test.invalid"]}'`
- [ ] 約 10 分鐘內收到「1 個連不上」（webhook 與信箱都要收到）
- [ ] 把網址改成殼的萬用網域下一個沒人用的名字（同一個 PUT，`"hosts":["alert-test.os.dropout.tw"]`；已經屬於別家的網址會被拒絕），下一輪收到「1 個恢復」
- [ ] 解約這家測試公司：`POST /admin/accounts/alert-test.local/state`，`{"state":"cancelled","reason":"通知測試"}`（解約後不再檢查，事故自動關閉）
- [ ] 這段時間 `/status` 會顯示「部分受影響」，所以在上線前做

**外部監看與每日備份**

- [ ] GitHub repo 的 Variables 設 `UPTIME_GLUE_URL`、`UPTIME_SHELL_URL`，Secrets 設 `ALERT_WEBHOOK_URL`（可以和膠水的同一個頻道）
- [ ] Actions → Uptime → Run workflow，勾 `test_alert`，頻道收到測試訊息
- [ ] repo 60 天沒有任何 commit 時 GitHub 會停掉排程；每月到 GitHub 的 Actions 頁看一次，被停就按 Enable workflow
- [ ] Secrets 設 `CLOUDFLARE_API_TOKEN`（D1 Edit、R2 Edit）、`CLOUDFLARE_ACCOUNT_ID`，Variables 設 `D1_BACKUP_BUCKET`；手動跑一次 D1 backup，R2 裡出現 `d1/dropout-glue/…`
- [ ] 第二天營運後台「最近備份」欄每家都有時間、沒有橘字
- [ ] 照「出事時的流程」實際走一次：誰收通知、誰判斷、誰寫信給客戶
