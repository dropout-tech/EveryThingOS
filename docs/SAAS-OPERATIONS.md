# 很多家公司一起用：容量、費用、權限、續約

這份寫的是「同時有 20 家、100 家公司上線」時怎麼運作、要付什麼錢、每個模組現在能不能用。價格是 2026 年 10 月查到的公開牌價，**簽約前請到各家官網再確認一次**。

## 一張圖

```
            *.os.dropout.tw（每家一個網址，或客戶自己的網域）
                         │
        ┌────────────────┴────────────────┐
        │  殼（一個部署，所有公司共用）       │  營運後台 /platform（另一個部署，Cloudflare Access）
        │  依網址問膠水「這是哪一家」          │
        └────────────────┬────────────────┘
                         │ SHELL_TOKEN（只能查公司、看死信、會議）
                  膠水 Worker（D1：公司、網址、合約、事件）
                         │
        ERPNext bench（多站）   Chatwoot（多帳戶）   Vexa（會議機器人）
```

- **殼**：設了 `GLUE_URL` 與 `SHELL_TOKEN` 就是多公司模式。打開的網址決定是哪一家（快取 60 秒），沒登記的網址顯示「這個網址還沒開通」。登入只走 ERPNext OAuth，session 綁那一家的 site，拿 A 公司的 cookie 開 B 公司會被要求重新登入。
- **膠水**：一個 Worker 服務所有公司。排程每次最多 10 家一批派會議機器人，每天台灣時間 02:00 收各家用量、清 180 天前的去重紀錄。
- **營運後台**：DropOut 員工看所有公司的合約狀態、用量、續約、暫停、解約。跟客戶的殼分開部署，前面放 Cloudflare Access。

## 容量：20 家、100 家

| 部分 | 20 家 | 100 家 | 說明 |
| --- | --- | --- | --- |
| 殼、膠水（Cloudflare Workers） | 夠 | 夠 | 依請求自動擴充，不用加機器 |
| ERPNext | 1 台 bench | 2–3 台 bench | 一台 8 vCPU／32 GB 先抓 35–50 個小公司站；MariaDB 調 `innodb_buffer_pool_size` 或拆到獨立主機。這是規劃起點，上線後依實際 CPU／記憶體調整 |
| Chatwoot | 1 套 | 1 套（加 Sidekiq） | 原生多帳戶，每家一個 account |
| Vexa 會議機器人 | 看同時段會議數 | 同左 | 每個同時進行的機器人約 1–1.5 GB 記憶體；轉文字要 GPU（Whisper）或付費語音轉文字 API |
| 備份 | 每站每日 | 同左 | `--backup-bucket` 設定 ERPNext 內建 S3 備份，每站一個資料夾 |

開站一家要幾分鐘（建站與設定精靈很吃 CPU），所以 `fleet bootstrap` 預設一次開 2 家。

## 要付費的項目

開源軟體本身不收授權費：ERPNext（GPLv3）、Frappe（MIT）、Chatwoot 社群版（MIT，部分企業功能另授權）、Vexa（Apache-2.0）。要付錢的是主機與外部服務：

| 項目 | 什麼時候要付 | 大約 |
| --- | --- | --- |
| Cloudflare Workers Paid | 膠水用 Queues 就要 | 每月 US$5 起，超過額度按用量 |
| Workers AI | 會議摘要 | 按用量 |
| Cloudflare for SaaS | 客戶用自己的網域 | 前 100 個網域免費，之後每個每月約 US$0.10 |
| Cloudflare Access | 營運後台 | 50 人內免費 |
| 寄信服務（例：Resend） | 電子報、確認信 | 有免費額度，正式量要付費方案；Cloudflare 的 send_email 只能寄到驗證過的信箱，不能拿來寄電子報 |
| 主機 | ERPNext、Chatwoot、Vexa | 依規格 |
| GPU 或語音轉文字 API | 會議機器人 | 依用量 |
| LINE 官方帳號、WhatsApp | 對話 | LINE 超過免費則數要升級方案；WhatsApp 依對話計費 |
| 綠界、藍新 | 官網收款 | 交易手續費 |
| 電子發票加值中心、簡訊 | 開發票、簡訊 | 依合約 |
| Vercel | 目前的預覽網址 `dropout-os.vercel.app` | Hobby 方案不能商用，正式要 Pro 或把殼移到 Cloudflare（`npm run deploy`） |

## 模組現在能不能用

| 模組 | 狀態 |
| --- | --- |
| 生意（ERPNext 報價到收款、採購、庫存、財務） | 可以用 |
| 客人（CRM） | 可以用 |
| 電子報 | 可以用，要接寄信服務 |
| 導入工具（單家、多家） | 可以用 |
| 官網商店（Webshop） | 可以用；收款要先跑綠界／藍新測試環境 |
| 團隊與權限 | 可以用 |
| 合約、試用、續約、暫停 | 可以用 |
| 對話（Chatwoot：LINE、IG、FB） | 程式完成，要部署 Chatwoot 並申請 LINE／Meta 帳號 |
| 會議機器人（Vexa） | 程式完成，要部署 Vexa 與轉文字 |
| 電子發票 | 綠界 B2C 寫好，要跑測試環境 |
| Mautic、OpenReply、Shlink、Keycloak | 選配，還沒接 |

## 一家公司的一輩子

| 階段 | 什麼時候 | 殼裡看到什麼 | 能不能改資料 | 會議機器人 |
| --- | --- | --- | --- | --- |
| 試用 `trial` | 開站後 `--trial-days`（預設 30 天） | 「試用還有 N 天」 | 可以 | 會派 |
| 使用中 `active` | 續約後 | — | 可以 | 會派 |
| 快到期 `due_soon` | 到期前 60 天內 | 「還有 N 天到期」 | 可以 | 會派 |
| 寬限 `past_due` | 到期後 14 天內 | 紅色提醒 | 可以 | 會派 |
| 只能看 `read_only` | 寬限過了 | 「資料都在，可以看和匯出」 | 不行（423） | 不派 |
| 暫停 `suspended` | 營運手動 | 同上，加原因 | 不行 | 不派 |
| 解約 `cancelled` | 營運手動 | 同上 | 不行 | 不派 |

日期都用台灣時間，到期日當天 23:59:59 才算過期。每次續約、暫停、改資料都記在公司的歷史，記下是誰做的。

**三個地方一起擋**：殼（最晚 60 秒，殼的快取）、膠水（立刻）、ERPNext 後台（膠水在每次變更與每天 02:00 推送狀態，`dropout_core.account`）。ERPNext 只能看時：

- 業務單據、客人、商品、官網都不能新增、修改、送出、取消、刪除，Desk 最上面出現提醒條。
- 登入、改密碼、管人、下載備份照常（Core、Desk、Email、Integrations 等框架模組不擋）。
- 膠水的整合帳號照常寫入，LINE 訊息、表單名單、金流通知不會遺失。
- 官網商店不收新訂單。
- Administrator 不擋，留給 DropOut 處理問題。
- 公司自己的 System Manager 在表單上改不掉這個狀態；但刻意給自己整合角色就能繞過。這是合約提醒，不是防破解。

**續約提醒**（每天 02:00）：試用到期前 7、3、1、0 天；年約到期前 59、30、14、7、1、0 天；到期後第 1、7、14 天；改成只能看那天。每則只寄一次，寄給公司聯絡人（膠水設 `RESEND_API_KEY`、`PLATFORM_MAIL_FROM`），副本寄到 `PLATFORM_NOTIFY`。沒設寄信也會記在營運後台的公司歷史。

## 權限：團隊頁

`/workspace/team`，只有「老闆」（ERPNext System Manager）看得到。

- **職務**是 ERPNext 內建的 Role Profile：老闆、主管、業務、倉管、採購、會計、客服、行銷。開站與每次 `bench migrate` 會補上缺的職務，不會改已經存在的。公司要調某個職務能做什麼，就在 ERPNext 改那個 Role Profile。
- **邀請**：填 Email、名字、職務，對方收到 ERPNext 的設定密碼信。
- **換職務、停用、恢復**：不能把自己的老闆權限拿掉，也不能讓公司沒有老闆。停用會一併撤銷那個人的 OAuth token。
- **選單照職務**：例如業務只看到對話、客人、銷售、設定；權限最後還是由 ERPNext 判斷。
- **登入安全**：全員兩步驟驗證（驗證器 App 或 Email）、密碼強度、連續輸錯 5 次鎖住、閒置自動登出。都是 ERPNext 內建設定。
- **最近紀錄**：誰登入、誰改了什麼（ERPNext Activity Log、Version）。
- **匯出全部資料**：設定頁連到 ERPNext 的備份下載。

## 一次開很多家

```bash
# 預演
dropout-onboard fleet bootstrap toolkit/examples/fleet.csv --shell-url-template "https://{slug}.os.dropout.tw"

# 真的做；金鑰只走環境變數
export GLUE_ADMIN_TOKEN=... CHATWOOT_PLATFORM_TOKEN=... VEXA_ADMIN_TOKEN=...
dropout-onboard fleet bootstrap toolkit/examples/fleet.csv --bench-dir ~/frappe-bench \
  --glue-url https://glue.dropout.tw --shell-url-template "https://{slug}.os.dropout.tw" --apply

dropout-onboard fleet list --glue-url https://glue.dropout.tw
dropout-onboard fleet renew demo-make.local --years 1 --reference INV-2026-001 --glue-url https://glue.dropout.tw
dropout-onboard fleet suspend demo-make.local --reason 未付款 --glue-url https://glue.dropout.tw
dropout-onboard fleet resume demo-make.local --glue-url https://glue.dropout.tw
```

CSV 欄位：`folder`、`site`、`admin_email` 必填；`company`、`abbr`、`shell_url`、`renews_on`（已簽約的到期日）、`trial_days`、`calendar` 選填。每家的紀錄在 `<state_dir>/fleet-logs/<site>.log`（權限 600）。

## 營運後台

另外部署一份 `web/`，只設這些環境變數，網址放在 Cloudflare Access 後面：

| 變數 | 說明 |
| --- | --- |
| `GLUE_URL`、`GLUE_ADMIN_TOKEN` | 膠水的管理 API |
| `PLATFORM_ADMINS` | 可以進來的 Email，逗號分隔 |
| `CF_ACCESS_TEAM_DOMAIN` | 例：`dropout.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Access 應用程式的 AUD |

每個請求都驗 Access 的 JWT（RS256、aud、iss、到期時間），而且 Email 要在名單上。客戶用的殼不要設 `GLUE_ADMIN_TOKEN`，它只拿 `SHELL_TOKEN`。
