# DropOut OS（EveryThingOS）

琢奧科技的中小企業作業系統。**CRM、ERP、魅力圈、清庫、短網址、官網、社群回覆**同一登入、同一主檔、同一套 DropOut 皮。

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
| 產品殼：onboarding、今天一件事、生意、客人、對話、電子報、設定 | `web/` | 示範與真實資料都可用；ERPNext 登入（OAuth2 + PKCE）、Chatwoot 單一登入 |
| ERPNext 自訂 app：統編、Identity／Consent／Event、膠水 API、檢查報表、導入進度、殼的讀取 API | `frappe-apps/dropout_core` | 本機 ERPNext v15 測過（19 項測試） |
| 產業包：製造、顧問、教育 | `frappe-apps/dropout_pack_*` | 設定精靈完成後自動套用 |
| 台灣金流：綠界、藍新 | `frappe-apps/dropout_pay_tw` | Frappe Payments 擴充；正式啟用前要跑一次金流商測試環境 |
| 系統間同步 G1–G10、會議機器人排程、電子發票（綠界 B2C） | `glue/` | Worker 本機測過；尚未建 D1、Queues、部署 |
| 導入工具：plan、provision、convert、check、import | `toolkit/` | 本機開站、搬家、期初庫存跑過 |
| 部署：ERPNext 映像、Chatwoot、Cloudflare Tunnel、Vexa | `deploy/` | 設定檔已寫，**尚未在真主機跑過** |
| 公開預覽網址 | https://dropout-os.vercel.app | production 追 GitHub `main` |

下一動：在 Cloudflare 帳號建 D1 與 Queues、部署膠水與殼；主機用 `deploy/` 開第一個 ERPNext site，再用導入工具開三家示範公司。需要在 Cursor Dashboard → Cloud Agents → Secrets 加上 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。

## 開源組裝與套皮

第二版架構：Cloudflare（殼、同步、檔案、交易信、AI）＋ 一台主機（ERPNext、Chatwoot、Vexa，Coolify 管理）。Mautic、OpenReply、Shlink、Keycloak 為選配。員工看不到原廠皮。

- 架構：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 開源盤點：[docs/OPEN-SOURCE-CATALOG.md](docs/OPEN-SOURCE-CATALOG.md)
- 對話、電子報、客人、生意四系統規劃：[docs/FOUR-SYSTEMS-PLAN.md](docs/FOUR-SYSTEMS-PLAN.md)
- 大整合（重複造輪子檢查、會議紀錄機器人、Cloudflare 部署）：[docs/PLATFORM-INTEGRATION.md](docs/PLATFORM-INTEGRATION.md)
- 官網商店與導入工具：[docs/ONBOARDING-TOOLKIT.md](docs/ONBOARDING-TOOLKIT.md)
- 主題檔：[branding/README.md](branding/README.md)

## 商業條款（寫進產品裡的那一版）

| 項目 | 內容 |
| --- | --- |
| 年費 | NT$100,000 未稅／公司／年 |
| 導入 | 免費顧問，含在年費 |
| 帳號 | 不收人頭費 |
| 產業包 | 100 包可切換，不另收費 |
| 金流／簡訊／LINE／電子發票 | 外部供應商原價，我們做適配 |
