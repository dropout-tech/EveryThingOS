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
| 外部監看服務 | 膠水 `GET /health`、殼 `GET /api/health` | 膠水自己掛掉時，膠水的排程也不會跑，**一定要有外部的人看膠水**。用任何會打網址的監看服務（例：Cloudflare Health Checks、UptimeRobot），每 1–5 分鐘 |
| Workers Logs | 膠水與殼的紀錄、traces | 膠水的錯誤一行一個 JSON：`level`、`event`、`site`。常用的 `event`：`job.dead_letter`（同步放棄、進死信）、`monitor.failed`（監看本身失敗）、`monitor.budget_exhausted`（一輪沒檢查完）、`alert.not_sent`（通知沒送出去）、`scheduled.failed` |
| 公開狀態頁 `/status` | 平台整體（畫面、系統同步、ERPNext） | 客戶自己可以看；不顯示任何公司名稱或網址。在公司自己的網址打開，會多一塊「這個網址的公司」 |

通知送到哪：

- `ALERT_WEBHOOK_URL`（膠水的 secret，要 https）：Slack、Discord、Google Chat 的 incoming webhook 直接貼；其他服務收到的是 `text`、`content`、`message` 和 `events`。要 Bearer token 的加設 `ALERT_WEBHOOK_TOKEN`。
- `PLATFORM_NOTIFY`＋`PLATFORM_MAIL_FROM`：經 Cloudflare Email 寄到營運信箱（要先在 Email Routing 驗證）。
- 兩個都沒設：只記在公司歷史和 Workers Logs（`alert.not_sent`）。

一個主機壞掉時所有公司會一起連不上，通知會合成一則（最多列 30 家，其餘看營運後台）。

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
| 膠水的 D1 壞了或被誤改 | — | D1 Time Travel：`npx wrangler d1 time-travel restore dropout-glue --timestamp <時間>`（30 天內任一時間點） |

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
| 每家公司的 ERPNext | ERPNext 內建 S3 備份（`dropout-onboard provision --backup-bucket`），含附件 | 每天 | R2，每站一個資料夾 |
| Chatwoot、Vexa 的 Postgres | Coolify 排程備份 | 每天 | R2 |
| 膠水的 D1（公司、合約、網址、監看） | D1 Time Travel 自動保留 30 天；另外每週 `npx wrangler d1 export dropout-glue --remote --output <檔>` 放 R2 | 自動／每週 | Cloudflare／R2 |

**每月還原演練**（每家公司輪流，至少每月一家，第一家上線前一定要做）：

```bash
dropout-onboard backup verify <site> --bench-dir /home/frappe/frappe-bench              # 預演
DB_ROOT_PASSWORD=... dropout-onboard backup verify <site> --bench-dir /home/frappe/frappe-bench --apply
```

它把最新備份還原到暫存站 `restore-drill.<site>`（排程暫停、不寄信），比對單據筆數與資料檢查，刪掉暫存站，報告寫在 `~/.dropout-onboard/restore-drills/`。備份超過 24 小時、還原失敗、單據變 0 筆都算沒通過。報告裡的「還原花了幾分鐘」拿來估 RTO：一台主機全毀時，要在 8 小時內把每一站都還原回來。

**整台主機壞掉**：新主機照 [deploy/README.md](../deploy/README.md) 裝好（同一個 Tunnel token，網址不用改），從 R2 下載每站最新備份，`bench new-site` 後 `bench --site <site> restore <db> --with-public-files <f> --with-private-files <p>`，再 `bench --site <site> migrate`。膠水在這段時間會把 webhook 留在佇列與死信，恢復後重送。

## 正式上線檢查清單

照順序做；每一項做完打勾，卡住就停在那一項，不要跳過。

**Cloudflare 帳號**

- [ ] Workers Paid 方案（膠水用 Queues 就要）
- [ ] API token（Workers、D1、Queues、R2 權限），放在 CI 或 Cursor Secrets，不進 git

**膠水（先部署，殼要用它）**

- [ ] `npx wrangler d1 create dropout-glue`，把 `database_id` 填進 `glue/wrangler.jsonc`
- [ ] `npx wrangler queues create dropout-jobs`、`npx wrangler queues create dropout-jobs-dlq`
- [ ] `npm run db:migrate`（`0001`–`0003` 都要是 ✅）
- [ ] secrets：`TENANT_KEY`（`openssl rand -base64 32`，另外存一份在密碼管理器，掉了所有公司的金鑰都解不開）、`ADMIN_TOKEN`、`SHELL_TOKEN`、`ALERT_WEBHOOK_URL`；選用 `RESEND_API_KEY`、`TURNSTILE_SECRET`、`ALERT_WEBHOOK_TOKEN`
- [ ] vars：`PLATFORM_MAIL_FROM`、`PLATFORM_NOTIFY`（在 Email Routing 驗證過）
- [ ] `npm run deploy`，`curl https://<glue>/health` 回 `ok: true`

**主機**

- [ ] Coolify 裝好，介面放在 Cloudflare Access 後面
- [ ] `docker network create dropout`；ERPNext 映像 build 好；`DB_ROOT_PASSWORD` 設在 Coolify
- [ ] `deploy/erpnext`、`deploy/chatwoot` 跑起來
- [ ] Tunnel：建 Tunnel、`TUNNEL_TOKEN` 設在 `deploy/cloudflared`；Public Hostname 指到 ERPNext frontend 與 Chatwoot；主機不開對外埠
- [ ] R2 bucket 建好，金鑰只給備份用

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

- [ ] `dropout-onboard backup verify <site> --apply` 通過，報告存起來
- [ ] 記下還原花的時間，確認全部站加起來在 8 小時內

**通知測試**

- [ ] 用管理 API 登記一家測試公司，網址指到不存在的地方：
  `curl -X PUT https://<glue>/admin/accounts/alert-test.local -H "authorization: Bearer $ADMIN_TOKEN" -d '{"company":"通知測試","hosts":["alert-test.invalid"]}'`
- [ ] 約 10 分鐘內收到「1 個連不上」（webhook 與信箱都要收到）
- [ ] 把網址改成殼的萬用網域下一個沒人用的名字（同一個 PUT，`"hosts":["alert-test.os.dropout.tw"]`；已經屬於別家的網址會被拒絕），下一輪收到「1 個恢復」
- [ ] 解約這家測試公司：`POST /admin/accounts/alert-test.local/state`，`{"state":"cancelled","reason":"通知測試"}`（解約後不再檢查，事故自動關閉）
- [ ] 這段時間 `/status` 會顯示「部分受影響」，所以在上線前做

**外部監看**

- [ ] 外部監看服務打膠水 `/health` 與一個殼網址的 `/api/health`，通知到同一個營運頻道
- [ ] 照「出事時的流程」實際走一次：誰收通知、誰判斷、誰寫信給客戶
