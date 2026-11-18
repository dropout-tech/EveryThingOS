# EveryThingOS 外殼

琢奧識別的產品與作業系統介面。一百個產業包。月費版每月含稅 NT$1,000；AI 版每年含稅 NT$69,000。AI 現在用量不限，以後會限量並先說。免費顧問導入。

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

報價到收款的瀏覽器測試只打本機示範殼。它會自己開開發伺服器，並把 ERPNext、膠水、寄信、工作階段這些變數設成空字串。空字串才擋得住 `.env.local`：變數若是被拿掉，Next 會把檔案裡的網址填回來。登入表單不會送出，單據只寫在這個瀏覽器的 sessionStorage。`E2E_BASE_URL` 不是 `127.0.0.1` 或 `localhost` 時，設定檔會在開瀏覽器前拒絕。

```bash
npm run test:e2e
```

## 畫面

| 路徑 | 內容 |
| --- | --- |
| `/` | 現場 → 規模 → 功能（`/?setup=1` 重設） |
| `/industries` | 100 個產業包 |
| `/pricing` | 月費與 AI 版年費 |
| `/consulting` | 免費導入步驟 |
| `/saas` | 取代哪些雲端工具 |
| `/status` | 服務狀態：畫面、系統同步、ERPNext 整體是否正常、近 30 天可用率、近 14 天事故；不顯示任何公司名稱或網址。多公司模式在公司自己的網址打開時，多一塊「這個網址的公司」 |
| `/login` | 用 Google 登入。還沒設定 Google 用戶端時，按鈕不會改走密碼或 ERPNext |
| `/workspace` | 今天這一件；接上 ERPNext 時顯示導入進度 |
| `/workspace/erp/{sales,purchase,stock,finance}` | 生意：同一張單往下走 |
| `/workspace/crm` | 客人（ERPNext Lead／Customer 與通道身分） |
| `/workspace/chat` | 對話（Chatwoot：LINE、IG、FB、官網）；接上膠水時列出等最久的客人 |
| `/workspace/letter` | 電子報（ERPNext Email Group、Newsletter、同意紀錄）；寫草稿、寄出 |
| `/workspace/meetings` | 會議紀錄：接下來的會議（可逐場關掉機器人）與摘要 |
| `/workspace/website` | 官網：上架商品、網路訂單、表單名單、可貼的詢問表單 |
| `/workspace/hygiene` | 退信與待確認的行銷同意 |
| `/workspace/team` | 團隊：邀請、職務、停用、登入安全（兩步驟驗證、密碼強度、鎖帳號、閒置登出）、最近紀錄；只有老闆看得到 |
| `/workspace/settings` | 連線狀態、登入的人、方案與續約、匯出全部資料、匯出設定檔、導入進度、同步失敗重送 |
| `/platform`、`/platform/[site]` | 營運後台（另外部署，見下） |

舊路徑 `/workspace/reply`、`/workspace/funnel` 永久轉址到 `chat`、`letter`；舊瀏覽器裡存的功能代號會自動對上新名字。

| API | 用途 |
| --- | --- |
| `GET /api/health` | 殼活著就回 `ok: true`；設了 `GLUE_URL` 時一併回報膠水 `/health` 連不連得到（膠水的監看與外部監看都打這裡） |
| `GET /api/auth/login` → `GET /api/auth/callback` | Google 登入（授權碼 + PKCE）。沒有 `GOOGLE_CLIENT_ID` 時停在登入頁 |
| `POST /api/auth/logout` | 清掉平台 session |
| `GET /api/chat/open` | 以登入者對應的 Chatwoot 使用者單一登入，沒有對應就說明原因 |
| `GET /api/shop/profile` | 下載 ShopProfile（導入工具 `plan`／`provision` 的輸入） |
| `POST /api/sync/replay` | 重送同步失敗的事件（限 System Manager） |
| `POST /api/erp/quotation` | 開報價單（`dropout_core.actions.create_quotation`） |
| `POST /api/erp/course-bom` | 新增／更新課程 BOM（`dropout_core.actions.upsert_course_bom`，對應 ERPNext `Product Bundle`） |
| `POST /api/booking` | 客人預約課程（公開頁 `/book?from=line|ig|fb|counter`）。ERPNext 用 API key 接上時呼叫 `dropout_core.actions.book_course`：材料夠就送出課程訂單、ERPNext 隨單保留材料包；不夠就留草稿當候補。只能員工登入時改走系統同步表單成待確認名單；都沒接是練習模式 |
| `POST /api/erp/stock-movement` | 登記 WMS 上課領用耗用、教學損耗／報廢與跨店調撥（`dropout_core.actions.record_stock_movement`，對應 ERPNext `Stock Entry`） |
| `POST /api/erp/advance` | 這張單的下一步：報價→訂單→出貨→發票→收款；採購→收貨→帳單→付款 |
| `POST /api/crm/lead` | 新增客人；同 Email／電話會對到原本那位，不重建 |
| `POST /api/letter/newsletter`、`POST /api/letter/send` | 電子報草稿、寄出（Frappe Newsletter 的佇列與退訂連結） |
| `POST /api/meetings/skip` | 這場會議不派機器人／恢復 |
| `POST /api/hr/checkin`、`POST /api/hr/leave` | 替自己打卡；核准或退回假單 |
| `POST /api/hr/overtime` | 人資記加班：依勞基法倍數寫成「加班費」額外薪資，超過每日或每月上限會被擋（`dropout_hr_tw.overtime.record`） |
| `POST /api/hr/schedule` | 師資／人員排班：檢查老師衝堂、教室衝突與請假撞課後，寫入 Frappe HRMS `Shift Assignment`（`dropout_hr_tw.schedule.assign`） |
| `POST /api/team/{invite,profile,enabled,security}` | 邀請、換職務、停用／恢復、閒置時間。寫進平台 D1，不呼叫 ERPNext。老闆才可以。邀請信沒寄出時標成未寄出 |
| `POST /api/platform/accounts/[site]` | 營運：續約、暫停／恢復／解約、改公司資料 |

寫入的 API 只收同網域送來的 JSON（檢查 `Origin`）；公司在只能看、暫停、解約時回 423 並說明原因（團隊管理除外）。誰能管人看平台帳號的職務，不看 ERPNext，也不使用共用整合帳號。

## 資料來源：每個系統各自示範或真實

不設任何環境變數就是示範模式，每一頁都標「示範資料」。設了哪個系統，那個系統就讀真的；**讀不到時顯示錯誤，不會偷偷退回示範**。沒有權限的區塊會寫出名字，而不是空白。

| 變數 | 系統 | 說明 |
| --- | --- | --- |
| `ERPNEXT_URL`、`ERPNEXT_SITE` | ERPNext | 站台網址；多站同機時用 `X-Frappe-Site-Name` 指定 |
| `ERPNEXT_API_KEY`、`ERPNEXT_API_SECRET` | ERPNext | 不再拿來當登入身份。沒有 OAuth client 時，呼叫不會改用這組共用金鑰 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 殼 | Google 登入。兩個都要有，登入才會前往 Google |
| `SESSION_SECRET` | 殼 | 16 字元以上；封裝 session cookie（AES-GCM）。沒設時，本機會在 `web/.data/session-secret` 產生一把，不進 git |
| `ACCOUNT` 庫 | 殼 | 本機 wrangler D1，綁定 `ACCOUNTS`，庫名 `everythingos-accounts`。設定在 `wrangler.accounts.jsonc`，只對本機套 migration：`npx wrangler d1 migrations apply ACCOUNTS --local --config wrangler.accounts.jsonc` |
| `GLUE_URL`、`GLUE_ADMIN_TOKEN`、`GLUE_SITE` | 膠水 | 導入進度、同步失敗清單與重送；`/status` 只要 `GLUE_URL`（沒設就是示範資料） |
| `CHATWOOT_URL`、`CHATWOOT_PLATFORM_TOKEN`、`CHATWOOT_ACCOUNT_ID` | Chatwoot | 對話單一登入 |

登入是 Google。職務在平台自己的 D1。設了 `ERPNEXT_URL` 也不把 ERPNext 當身份；沒有 OAuth client 時，不會改用共用整合帳號。

1. **示範**：沒登入。工作區仍是練習資料。
2. **Google 登入**：設 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。第一位登入的人是老闆，之後由老闆邀請。
3. **帳號庫**：本機 D1 `everythingos-accounts`。不要把這張表寫進 `dropout-glue` 的年費 `invoices`，也不要寫 DoBusiness 的庫。這個設定檔沒有 `os.dropout.tw` 的路由，不要拿它部署。

## 多公司模式

設 `GLUE_URL`、`SHELL_TOKEN`、`SESSION_SECRET` 時，打開的網址仍向膠水查是哪一家。登入是 Google，session 綁那一家的 site。不使用 ERPNext OAuth，也不使用共用的 ERPNext API key。

## 營運後台

另外部署一份，只設 `GLUE_URL`、`GLUE_ADMIN_TOKEN`、`PLATFORM_ADMINS`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`，網址放在 Cloudflare Access 後面。說明見 [docs/SAAS-OPERATIONS.md](../docs/SAAS-OPERATIONS.md)。

## 部署

```bash
npm run preview   # 本機用 Workers 執行環境跑一次
npm run deploy    # 部署成 Worker `dropout-os`，需要 CLOUDFLARE_API_TOKEN 與 CLOUDFLARE_ACCOUNT_ID
```
