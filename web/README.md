# DropOut OS 外殼

琢奧識別的產品與作業系統介面。一百個產業包、一年 NT$100,000、免費顧問導入。

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

## 畫面

| 路徑 | 內容 |
| --- | --- |
| `/` | 現場 → 規模 → 功能（`/?setup=1` 重設） |
| `/industries` | 100 個產業包 |
| `/pricing` | 年費 |
| `/consulting` | 免費導入步驟 |
| `/saas` | 取代哪些雲端工具 |
| `/login` | 用 ERPNext 帳號登入（只有開了登入才會用到） |
| `/workspace` | 今天這一件；接上 ERPNext 時顯示導入進度 |
| `/workspace/erp/{sales,purchase,stock,finance}` | 生意：同一張單往下走 |
| `/workspace/crm` | 客人（ERPNext Lead／Customer 與通道身分） |
| `/workspace/chat` | 對話（Chatwoot：LINE、IG、FB、官網） |
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
| `GET /api/auth/login` → `GET /api/auth/callback` | ERPNext OAuth2（Authorization Code + PKCE S256） |
| `POST /api/auth/logout` | 撤銷 token、清 session |
| `GET /api/chat/open` | 以登入者對應的 Chatwoot 使用者單一登入，沒有對應就說明原因 |
| `GET /api/shop/profile` | 下載 ShopProfile（導入工具 `plan`／`provision` 的輸入） |
| `POST /api/sync/replay` | 重送同步失敗的事件（限 System Manager） |
| `POST /api/erp/quotation` | 開報價單（`dropout_core.actions.create_quotation`） |
| `POST /api/erp/advance` | 這張單的下一步：報價→訂單→出貨→發票→收款；採購→收貨→帳單→付款 |
| `POST /api/crm/lead` | 新增客人；同 Email／電話會對到原本那位，不重建 |
| `POST /api/letter/newsletter`、`POST /api/letter/send` | 電子報草稿、寄出（Frappe Newsletter 的佇列與退訂連結） |
| `POST /api/meetings/skip` | 這場會議不派機器人／恢復 |
| `POST /api/team/{invite,profile,enabled,security}` | 邀請、換職務、停用／恢復、登入安全（`dropout_core.team.*`，限 System Manager） |
| `POST /api/platform/accounts/[site]` | 營運：續約、暫停／恢復／解約、改公司資料 |

寫入的 API 只收同網域送來的 JSON（檢查 `Origin`）；公司在只能看、暫停、解約時回 423 並說明原因（團隊管理除外）；權限照 ERPNext：登入模式是那個人自己的權限，固定金鑰模式是整合帳號的權限（例如要寄電子報，整合帳號要有 Newsletter Manager）。ERPNext 拒絕時畫面顯示原因，不會假裝成功。

## 資料來源：每個系統各自示範或真實

不設任何環境變數就是示範模式，每一頁都標「示範資料」。設了哪個系統，那個系統就讀真的；**讀不到時顯示錯誤，不會偷偷退回示範**。沒有權限的區塊會寫出名字，而不是空白。

| 變數 | 系統 | 說明 |
| --- | --- | --- |
| `ERPNEXT_URL`、`ERPNEXT_SITE` | ERPNext | 站台網址；多站同機時用 `X-Frappe-Site-Name` 指定 |
| `ERPNEXT_API_KEY`、`ERPNEXT_API_SECRET` | ERPNext | 固定金鑰模式（見下） |
| `ERPNEXT_OAUTH_CLIENT_ID`、`ERPNEXT_OAUTH_CLIENT_SECRET` | ERPNext | 登入模式 |
| `SESSION_SECRET` | 殼 | 32 字元以上；封裝 session cookie（AES-GCM） |
| `SHELL_URL` | 殼 | 對外網址，用來組 OAuth 回呼 |
| `GLUE_URL`、`GLUE_ADMIN_TOKEN`、`GLUE_SITE` | 膠水 | 導入進度、同步失敗清單與重送 |
| `CHATWOOT_URL`、`CHATWOOT_PLATFORM_TOKEN`、`CHATWOOT_ACCOUNT_ID` | Chatwoot | 對話單一登入 |

三種模式：

1. **示範**：什麼都不設。
2. **固定金鑰**：設 `ERPNEXT_API_KEY`／`SECRET`，所有人用同一個整合帳號讀。**只用在本機或放在 Cloudflare Access 後面**，不要直接公開。
3. **登入**：設 OAuth 兩個值加 `SESSION_SECRET`。每個人用自己的 ERPNext 帳號登入，權限照 ERPNext 走。OAuth client 用導入工具建立：

```bash
dropout-onboard provision shop.json --site acme.erp.dropout.tw --company 安安顧問 \
  --admin-email boss@acme.tw --shell-url https://os.acme.tw --apply
```

它會呼叫 `dropout_core.provisioning.create_oauth_client`，最後印出要貼進殼的環境變數。

## 多公司模式

設 `GLUE_URL`、`SHELL_TOKEN`、`SESSION_SECRET`（Chatwoot 單一登入再加 `CHATWOOT_PLATFORM_TOKEN`）就是一個部署服務所有公司：打開的網址（`Host`／`X-Forwarded-Host`）向膠水 `GET /shell/tenant` 查是哪一家，拿到那家的 ERPNext 網址、OAuth client、Chatwoot 帳戶與合約狀態。不需要也不接受共用的 ERPNext API key；每個人用自己的 ERPNext 帳號登入，session 綁那一家。這時 `ERPNEXT_*`、`SHELL_URL`、`GLUE_SITE` 不用設。公司用 `dropout-onboard provision --shell-url https://<slug>.os.dropout.tw` 登記網址。

## 營運後台

另外部署一份，只設 `GLUE_URL`、`GLUE_ADMIN_TOKEN`、`PLATFORM_ADMINS`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`，網址放在 Cloudflare Access 後面。說明見 [docs/SAAS-OPERATIONS.md](../docs/SAAS-OPERATIONS.md)。

## 部署

```bash
npm run preview   # 本機用 Workers 執行環境跑一次
npm run deploy    # 部署成 Worker `dropout-os`，需要 CLOUDFLARE_API_TOKEN 與 CLOUDFLARE_ACCOUNT_ID
```
