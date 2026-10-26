# DropOut OS（EveryThingOS）

琢奧科技的中小企業作業系統。**CRM、ERP、人事薪資、老闆報表、對外 API、魅力圈、清庫、短網址、官網、社群回覆**同一登入、同一主檔、同一套 DropOut 皮。

進銷存與財務對齊**鼎新 A1／億看 ECOUNT** 的範圍（報價到收款、採購、庫存、帳齡、傳票、營業稅、電子發票適配），畫面改成「下一步是什麼」，而不是先背程式名稱。

- **現場＋功能＋規模** 組出要開的模組，不是硬切一百種行業
- **每年 NT$100,000（未稅）**，含系統、不含模組加購
- **免費顧問導入**：打開對的功能、搬資料、帶你們跑完一筆真實生意

## 現在就可以看的畫面

產品外殼在 `web/`（Next.js）。背景是一條從海面到海底的連續風景。主卡片是邊緣會折射的玻璃（位移圖 + 色散 + 滑鼠彈性），參考 [liquid-glass-react](https://github.com/rdev/liquid-glass-react)。識別是玻璃水滴加漣漪。

打開先問三件事：現場像什麼、幾個人、要開哪些功能。不是硬選一百種行業。選完進「今天」：一件事、一個人、一個按鈕。

```bash
cd web && npm install && npm run dev
```

Cloudflare Workers（OpenNext）：

```bash
cd web && npm run preview   # 本機用 Workers 執行環境跑一次
cd web && npm run deploy    # 部署成 Worker `dropout-os`，需要 CLOUDFLARE_API_TOKEN 與 CLOUDFLARE_ACCOUNT_ID
```

- `/` 現場 → 規模 → 功能。選過的人會直接進今天（`/?setup=1` 重設）
- `/pricing` 一年十萬
- `/consulting` 免費導入
- `/industries` 一百個產業包（給想對照的人，不是進站必經）
- `/workspace` 今天這一件
- `/workspace/erp/sales` 生意：同一張單往下走

不設環境變數時是示範模式，每頁都標「示範資料」，點「下一步」只在這個瀏覽器走動。接上 ERPNext 後畫面讀真的單據，動作打開 ERPNext 裡那張單（設定方式見 [web/README.md](web/README.md)）。

## 各部分在哪、做到哪

| 部分 | 位置 | 狀態 |
| --- | --- | --- |
| 產品殼：onboarding、今天一件事、生意、客人、對話、電子報、會議、官網、名單健康、團隊、設定 | `web/` | 示範與真實資料都可用；客人頁練習的十步依台灣那一行的真實做法（`web/lib/tw-real/`）；生意、客人、倉庫、進貨、收錢、電子報、對話、人事、會議、報表、擋假信最上面各是一件「現在這件」（沒卡住就不硬補）；ERPNext 登入（OAuth2 + PKCE）、Chatwoot 單一登入；Open Chat 把 LINE、IG、FB、官網收成一個收件匣，ManyChat 只留關鍵字轉私訊（[docs/OPEN-CHAT.md](docs/OPEN-CHAT.md)）；殼裡直接開報價、單據下一步、收款、新增客人、寄電子報、關掉某場會議機器人；**一個部署服務所有公司**（依網址分公司）；團隊與權限、試用與續約提醒 |
| 營運後台：所有公司的合約、用量、續約、暫停、解約 | `web/app/platform` | Cloudflare Access 保護，另外部署 |
| ERPNext 自訂 app：統編、Identity／Consent／Event、膠水 API、檢查報表、導入進度、殼的讀寫 API | `frappe-apps/dropout_core` | 本機 ERPNext v15 測過（27 項測試）；含職務、邀請、兩步驟驗證、稽核紀錄、每日備份 |
| 產業包：製造、顧問、教育 | `frappe-apps/dropout_pack_*` | 設定精靈完成後自動套用 |
| 台灣金流：綠界、藍新 | `frappe-apps/dropout_pay_tw` | Frappe Payments 擴充；正式啟用前要跑一次金流商測試環境 |
| 系統間同步 G1–G10、會議機器人排程、電子發票（綠界 B2C）、公司合約與網址目錄 | `glue/` | Worker 本機測過；尚未建 D1、Queues、部署 |
| 導入工具：plan、provision、convert、check、import、**bootstrap（一行開站加搬家）**、**fleet（一次很多家、續約、暫停）** | `toolkit/` | 三家示範公司（製造、顧問、教育）本機一行開站搬家跑過，重跑會略過 |
| CI：殼、膠水、導入工具、ERPNext 上的 app 測試 | `.github/workflows/ci.yml` | 每個 PR 跑。殼的 `npm test` 鎖住十一個現場的十步與 Open Chat |
| 人事薪資：請假、核准、打卡、薪資（勞健保、勞退、職災、獎金補充保費、扣繳費率可改；月中到離職勞保按 30 日；雇主負擔可入帳；特休、婚假 14 日、加班倍數與免稅時數依條文） | `frappe-apps/dropout_hr_tw`、`web/app/workspace/hr` | 用 Frappe HRMS v15；每年改的費率要對勞保局、健保署公告，不寫死（[docs/HR.md](docs/HR.md)） |
| 老闆儀表板：營收、毛利、帳齡、前十大客人、成交漏斗、缺貨，卡片可自己挑、排順序；手機可安裝（PWA） | `web/app/workspace/reports`、`dropout_core/reports.py` | 數字直接用 ERPNext 原生報表（[docs/REPORTS.md](docs/REPORTS.md)） |
| 年費自動帳單：到期前 60 天開帳單、綠界線上付款、付款即續約、開電子發票；客戶健康度 | `glue/src/billing.ts`、`glue/src/health.ts`、`/platform` | 要設綠界金鑰並跑測試環境（[docs/BILLING.md](docs/BILLING.md)） |
| 對外 API 與 Webhook：每家公司自己的金鑰、`/v1` 客人／商品／訂單／發票、事件推播 | `glue/src/publicApi.ts`、`glue/src/webhooks.ts`、`/workspace/settings/api` | [docs/PUBLIC-API.md](docs/PUBLIC-API.md)、[docs/openapi.yaml](docs/openapi.yaml) |
| 可靠性：`/health`、每 5 分鐘監看各家站台、事故通知、公開 `/status`、GitHub Actions 外部監看（`uptime.yml`）、備份新鮮度警示、從 R2 還原演練 `backup verify --from-r2`、整台主機重建 `fleet restore-all`、解約 90 天後刪除 `fleet purge`、膠水 D1 每日匯出 | `glue/src/monitor.ts`、`glue/src/backups.ts`、`web/app/status`、`toolkit`、`.github/workflows/uptime.yml` | 目標、演練排程與各種警示的處理見 [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| 導入教學：開站清單（讀真實進度）、第一筆生意練習、各職務第一天指南、頁面提示、空白頁下一步、說明中心 `/help` | `web/app/workspace`、`web/app/help`、`web/lib/help.ts`、`dropout_core.api.setup_checklist` | 顧問導入腳本見 [docs/ONBOARDING-GUIDE.md](docs/ONBOARDING-GUIDE.md) |
| 介面：設計 token 與共用元件、手機底部選單、載入與錯誤畫面、確認對話框、WCAG AA 對比、減少動態；官網價值主張、免費導入預約表單、SEO（sitemap、OG 圖） | `web/components/ui`、`web/app/globals.css`、`web/app/consulting` | [docs/UI-GUIDE.md](docs/UI-GUIDE.md) |
| 信任文件：服務條款、隱私權政策、資料處理附約、SLA、資安說明 | `web/app/{terms,privacy,dpa,sla,security}` | **草稿**，公司資料待填、簽約前請律師審閱（[docs/TRUST.md](docs/TRUST.md)） |
| 部署：ERPNext 映像、Chatwoot、Cloudflare Tunnel、Vexa | `deploy/` | 設定檔已寫，**尚未在真主機跑過** |
| 公開預覽網址 | https://dropout-os.vercel.app | production 追 GitHub `main` |

下一動：照 [docs/RELIABILITY.md](docs/RELIABILITY.md) 的上線清單，在 Cloudflare 帳號建 D1 與 Queues、套用 `glue/migrations` 0001–0006、部署膠水與殼；主機用 `deploy/` 開第一個 ERPNext site，再用 `dropout-onboard bootstrap toolkit/examples/{make,service,edu}` 開三家示範公司。需要在 Cursor Dashboard → Cloud Agents → Secrets 加上 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。

## 開源組裝與套皮

第二版架構：Cloudflare（殼、同步、檔案、交易信、AI）＋ 一台主機（ERPNext、Chatwoot、Vexa，Coolify 管理）。Mautic、OpenReply、Shlink、Keycloak 為選配。員工看不到原廠皮。

- 架構：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 開源盤點：[docs/OPEN-SOURCE-CATALOG.md](docs/OPEN-SOURCE-CATALOG.md)
- 對話、電子報、客人、生意四系統規劃：[docs/FOUR-SYSTEMS-PLAN.md](docs/FOUR-SYSTEMS-PLAN.md)
- 大整合（重複造輪子檢查、會議紀錄機器人、Cloudflare 部署）：[docs/PLATFORM-INTEGRATION.md](docs/PLATFORM-INTEGRATION.md)
- 官網商店與導入工具：[docs/ONBOARDING-TOOLKIT.md](docs/ONBOARDING-TOOLKIT.md)
- 很多家公司一起用（容量、費用、權限、續約）：[docs/SAAS-OPERATIONS.md](docs/SAAS-OPERATIONS.md)
- 可靠性與上線清單：[docs/RELIABILITY.md](docs/RELIABILITY.md)
- 年費帳單與客戶健康度：[docs/BILLING.md](docs/BILLING.md)
- 對外 API 與 Webhook：[docs/PUBLIC-API.md](docs/PUBLIC-API.md)
- 人事薪資：[docs/HR.md](docs/HR.md)
- 老闆儀表板與手機安裝：[docs/REPORTS.md](docs/REPORTS.md)
- 信任文件（條款、隱私、SLA）：[docs/TRUST.md](docs/TRUST.md)
- 顧問導入腳本：[docs/ONBOARDING-GUIDE.md](docs/ONBOARDING-GUIDE.md)
- 介面規範：[docs/UI-GUIDE.md](docs/UI-GUIDE.md)
- 八角框架（畫面為什麼這樣排）：[docs/OCTALYSIS.md](docs/OCTALYSIS.md)
- 主題檔：[branding/README.md](branding/README.md)

## 商業條款（寫進產品裡的那一版）

| 項目 | 內容 |
| --- | --- |
| 年費 | NT$100,000 未稅／公司／年 |
| 導入 | 免費顧問，含在年費 |
| 帳號 | 不收人頭費 |
| 產業包 | 100 包可切換，不另收費 |
| 金流／簡訊／LINE／電子發票 | 外部供應商原價，我們做適配 |
