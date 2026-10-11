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
| 排程每 5 分鐘 | 讀公司行事曆（ICS），十分鐘內開始的 Meet／Zoom／Teams 派機器人；10 家一批，只能看／暫停的公司不派 | |
| `GET /shell/tenant?host=` | 殼依網址查公司：ERPNext 網址與 OAuth client、Chatwoot 帳戶、合約狀態（不回 ERPNext 金鑰） | `SHELL_TOKEN` |
| `/admin/accounts`、`/admin/accounts/:site`（`PUT`、`/renew`、`/state`） | 公司合約：試用、續約、暫停、解約、網址；每次變更記進歷史（`x-actor`） | `ADMIN_TOKEN` |
| `/admin/*` | 登記公司、看死信、重送 | `ADMIN_TOKEN`，前面再加 Cloudflare Access；`SHELL_TOKEN` 只能看自己那家的死信與會議、關掉某場會議的機器人、重送自己那家的死信 |
| `GET /v1/customers`、`/v1/items`、`/v1/sales-orders`、`/v1/invoices`；`POST /v1/customers`、`/v1/leads` | 對外 API：公司從金鑰判斷，欄位與篩選是固定清單，合約只能看時寫入回 423；每把金鑰每分鐘 120 次（`API_LIMIT`）。見 `docs/PUBLIC-API.md` | `Authorization: Bearer dok_live_…`（D1 只存 SHA-256） |
| `/admin/tenants/:site/api-keys`、`/admin/tenants/:site/webhooks` | 開／停用 API 金鑰；Webhook 新增、停用、刪除、送測試、送出紀錄 | `ADMIN_TOKEN`；`SHELL_TOKEN` 只能管殼代表的那一家 |
| 佇列 `webhook` 工作 | 每筆 ERPNext 事件順便發給有訂的 Webhook：`X-DropOut-Signature` 簽章、10 秒逾時、不跟轉址、送前再查 DNS；失敗照下面規則重試，連續 20 次失敗自動停用 | |
| 排程每天 02:00（台灣） | 把合約狀態推給各家 ERPNext（`dropout_core.account.set_status`，只能看時 ERPNext 後台也擋寫入）、寄續約提醒、收各家用量（`dropout_core.team.usage`）、清 180 天前的去重紀錄 | |

失敗規則：5xx／網路錯誤依 30、60、120 秒重試；4xx 或第 4 次仍失敗 → 寫進死信（D1）並在 ERPNext 標示（例：電子發票「失敗」）。Worker 本身崩潰的訊息由 Queues 內建死信佇列接住。

續約提醒：試用到期前 7、3、1、0 天；年約到期前 59、30、14、7、1、0 天；到期後第 1、7、14 天；改成只能看那天。每則只寄一次，續約後到期日變了就重新算。寄給公司的聯絡人（Resend），副本經 Cloudflare EMAIL 寄到 `PLATFORM_NOTIFY`；沒設寄信也會記在營運後台的公司歷史。

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
npm run db:migrate                         # 含 0005：API 金鑰、Webhook
npx wrangler secret put TENANT_KEY         # openssl rand -base64 32
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put SHELL_TOKEN        # 給多公司模式的殼
npx wrangler secret put RESEND_API_KEY     # 選用：續約提醒寄給客戶；另設 vars PLATFORM_MAIL_FROM、PLATFORM_NOTIFY
npm run deploy
```

對外 API 的速率限制用 Workers Rate Limiting binding（`wrangler.jsonc` 的 `ratelimits`，`namespace_id` 在同一個 Cloudflare 帳號內不重複即可），不用另外建資源。

登記一家公司（導入工具 `dropout-onboard provision` 會自動做）：

```bash
curl -X PUT https://<glue>/admin/tenants/<site> -H "authorization: Bearer $ADMIN_TOKEN" -d @tenant.json
bench --site <site> execute dropout_core.install.configure_glue --kwargs '{"url":"https://<glue>","secret":"<erpnext_webhook_secret>"}'
```

電子發票目前接綠界 B2C（`src/einvoice.ts`），其他加值中心只要實作同一個 `EInvoiceProvider`（開立、作廢、折讓）。正式啟用前先在綠界測試環境各跑一次。
