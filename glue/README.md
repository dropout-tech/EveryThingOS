# DropOut Glue（Cloudflare Worker）

系統之間只走這裡：Chatwoot、官網表單、寄信服務、金流、會議機器人 → 驗簽 → 佇列 → ERPNext（`dropout_core.api`）。對應 `docs/FOUR-SYSTEMS-PLAN.md` 第 4 節 G1–G10。

| 路徑 | 做什麼 | 驗證 |
| --- | --- | --- |
| `POST /chatwoot/:site/:token` | G1 新對話 → 找或建客人與身分 → `message_received` | 每家公司一個私密路徑 token |
| `POST /forms/:site` | G3 官網表單 → 潛在客人；勾行銷同意就寄確認信 | 誘餌欄位、可選 Turnstile |
| `GET /confirm/:site?token=` | G4 點確認信 → 同意生效、加進「新朋友」 | 一次性 token |
| `GET/POST /unsubscribe/:site` | G6 退訂（含 RFC 8058 一鍵退訂）→ 關所有行銷通道、Chatwoot 標「勿推播」 | HMAC 簽名連結 |
| `POST /erpnext/events?site=` | ERPNext 每個 DropOut Event：`won`/`paid` → G5 分群；`invoiced` → G10 開電子發票 | Frappe Webhook 簽名 |
| `POST /mail/:site` | G7 開信／點擊、G8 退信、客訴 | Resend（Svix）或通用 HMAC |
| `POST /pay/ecpay?site=`、`/pay/newebpay?site=` | G9 金流通知 → 收款（金額不符進人工） | CheckMacValue／TradeSha |
| `POST /vexa/:site/:token` | 會議結束 → 逐字稿 → Workers AI 摘要 → 客人時間軸 | 私密路徑 token |
| `GET /health` | D1 是否回應、部署版本；壞了回 503 | 不用 |
| `GET /status` | 公開狀態頁用：殼、膠水、ERPNext 整體是否正常、近 30 天可用率、近 14 天事故時間；不含公司名稱與網址 | 不用；加 `?site=` 看單一公司要 `SHELL_TOKEN` |
| 排程每 5 分鐘（監看） | 每家沒解約的公司：ERPNext `/api/method/ping`、殼網址 `/api/health`；連續 2 次失敗算連不上、開事故，恢復就關；有變化時一次通知營運（`ALERT_WEBHOOK_URL`、`PLATFORM_NOTIFY`），也記在公司歷史 | |
| 排程每 5 分鐘 | 讀公司行事曆（ICS），十分鐘內開始的 Meet／Zoom／Teams 派機器人；10 家一批，只能看／暫停的公司不派 | |
| `GET /shell/tenant?host=` | 殼依網址查公司：ERPNext 網址與 OAuth client、Chatwoot 帳戶、合約狀態（不回 ERPNext 金鑰） | `SHELL_TOKEN` |
| `/admin/accounts`、`/admin/accounts/:site`（`PUT`、`/renew`、`/state`） | 公司合約：試用、續約、暫停、解約、網址；每次變更記進歷史（`x-actor`） | `ADMIN_TOKEN` |
| `GET /billing/pay/:id?sig=` | 續約帳單的付款連結 → 綠界付款頁（金額只看帳單） | HMAC 簽名連結 |
| `POST /billing/ecpay` | 綠界付款通知 → 帳單標已付、續約一年、開電子發票 | CheckMacValue、MerchantID、金額、交易編號 |
| `/admin/billing`、`/admin/accounts/:site/invoices`、`/admin/invoices/:id/(paid\|void\|resend\|einvoice)` | 營運後台：健康度、帳單、線下收款、作廢、重寄連結、重開發票 | `ADMIN_TOKEN` |
| `GET /admin/tenants/:site/billing` | 殼拿自己那家未付的帳單與付款連結 | `SHELL_TOKEN` 也可以 |
| `/admin/*` | 登記公司、看死信、重送 | `ADMIN_TOKEN`，前面再加 Cloudflare Access；`SHELL_TOKEN` 只能看自己那家的死信與會議、關掉某場會議的機器人、重送自己那家的死信 |
| 排程每天 02:00（台灣） | 到期前 60 天開續約帳單、重開沒開成的電子發票（`docs/BILLING.md`）、把合約狀態推給各家 ERPNext（`dropout_core.account.set_status`，只能看時 ERPNext 後台也擋寫入）、寄續約提醒（附付款連結）、收各家用量（`dropout_core.team.usage`）、清 180 天前的去重紀錄 | |

失敗規則：5xx／網路錯誤依 30、60、120 秒重試；4xx 或第 4 次仍失敗 → 寫進死信（D1）並在 ERPNext 標示（例：電子發票「失敗」）。Worker 本身崩潰的訊息由 Queues 內建死信佇列接住。

續約提醒：試用到期前 7、3、1、0 天；年約到期前 59、30、14、7、1、0 天；到期後第 1、7、14 天；改成只能看那天。每則只寄一次，續約後到期日變了就重新算。寄給公司的聯絡人（Resend），副本經 Cloudflare EMAIL 寄到 `PLATFORM_NOTIFY`；沒設寄信也會記在營運後台的公司歷史。

監看：每次排程最多 5 個同時、整輪 90 秒內；沒輪到的公司下一輪先做。通知格式依網址自動選：Slack、Google Chat 用 `text`，Discord 用 `content`，其他網址收 `text`、`content`、`message` 和 `events`（每筆變化的公司、站台、項目、時間）。紀錄寫成一行一個 JSON（`level`、`event`、`site`），在 Workers Logs 篩。目標與事故處理見 [docs/RELIABILITY.md](../docs/RELIABILITY.md)。

每家公司的金鑰（ERPNext API key、金流 HashKey…）用 `TENANT_KEY`（AES-256-GCM）加密後才存進 D1。

## 開發

```bash
npm install
npm test            # 單元測試
npm run typecheck
cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev
```

## 部署

```bash
npx wrangler d1 create dropout-glue        # 把 database_id 填進 wrangler.jsonc
npx wrangler queues create dropout-jobs
npx wrangler queues create dropout-jobs-dlq
npm run db:migrate
npx wrangler secret put TENANT_KEY         # openssl rand -base64 32
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put SHELL_TOKEN        # 給多公司模式的殼
npx wrangler secret put RESEND_API_KEY     # 選用：續約提醒寄給客戶；另設 vars PLATFORM_MAIL_FROM、PLATFORM_NOTIFY
npx wrangler secret put ALERT_WEBHOOK_URL  # 選用：監看通知（Slack、Discord、Google Chat 或任何收 JSON 的網址，要 https）
npx wrangler secret put ALERT_WEBHOOK_TOKEN  # 選用：通知網址要 Bearer token 時才設
npx wrangler secret put BILLING_ECPAY_HASH_KEY   # 選用：DropOut 自己收年費，其他變數見 docs/BILLING.md
npm run deploy
```

登記一家公司（導入工具 `dropout-onboard provision` 會自動做）：

```bash
curl -X PUT https://<glue>/admin/tenants/<site> -H "authorization: Bearer $ADMIN_TOKEN" -d @tenant.json
bench --site <site> execute dropout_core.install.configure_glue --kwargs '{"url":"https://<glue>","secret":"<erpnext_webhook_secret>"}'
```

電子發票目前接綠界 B2C（`src/einvoice.ts`），其他加值中心只要實作同一個 `EInvoiceProvider`（開立、作廢、折讓）。正式啟用前先在綠界測試環境各跑一次。
