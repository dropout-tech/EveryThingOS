# DropOut OS（EveryThingOS）

琢奧科技的中小企業作業系統。**CRM、ERP、魅力圈、清庫、短網址、官網、社群回覆**同一登入、同一主檔、同一套 DropOut 皮。

進銷存與財務對齊**鼎新 A1／億看 ECOUNT** 的範圍（報價到收款、採購、庫存、帳齡、傳票、營業稅、電子發票適配），畫面改成「下一步是什麼」，而不是先背程式名稱。

- **一百個產業包**可切換，滿足一百種現場情境
- **每年 NT$100,000（未稅）**，含系統、不含模組加購
- **免費顧問導入**：選定產業包、改流程與 Dashboard、帶你們跑完一筆真實生意

## 現在就可以看的畫面

產品外殼在 `web/`（Next.js）。風景當背景，介面是少數幾塊可折射的玻璃，不是滿版方格。進站右下角會出現創業一句，不擋住操作。每天路徑是 **回覆 → 客人 → 生意 → 收錢**。

```bash
cd web && npm install && npm run dev
```

- `/` 產品主張
- `/industries` 100 個產業包
- `/pricing` 一年十萬
- `/consulting` 免費導入步驟
- `/saas` 取代哪些雲端工具
- `/workspace` 今天：先做一件大事，數字一條，四步路徑
- `/workspace/erp` 生意：銷售流水、採購、倉庫（服務業會藏）、帳款與稅
- `/workspace/erp/compare` 與 `/saas`：和鼎新 A1、億看 ECOUNT 一項一項對
- `/workspace/reply` 社群回覆：OpenReply 風格的留言轉私訊（示範配對，Meta 還沒接）

工作區裡點「下一步」會在這個瀏覽器走動，用來證明比 A1／億看直觀。**正式過帳還沒接到 ERPNext**，畫面上有這句說明。

## 還沒完整的

| 項目 | 狀態 |
| --- | --- |
| 產品殼、100 產業包、A1 下一步操作、黑白、海山湖風景、Liquid Glass、激勵句、OpenReply 示範回覆 | 可看 |
| ERPNext 過帳、主檔權威 | 未接 |
| Keycloak 登入 | 未接 |
| Mautic／Postal 魅力圈寄信 | 未接 |
| Reacher 清庫、Shlink 短網址 | 未接 |
| OpenReply Meta webhook | 未接 |
| 電子發票加值中心 | 適配尚未接 |
| 公開預覽網址 | Vercel 專案 `dropout-os` 已建，GitHub 還沒授權 |

下一動仍是把示範站接到可複製的 ERPNext site。

## 開源組裝與套皮

架構仍是 ERPNext + Mautic + Reacher + Shlink + OpenReply + Keycloak + Activepieces。員工看不到原廠皮。

- 架構：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 開源盤點：[docs/OPEN-SOURCE-CATALOG.md](docs/OPEN-SOURCE-CATALOG.md)
- 主題檔：[branding/README.md](branding/README.md)

## 商業條款（寫進產品裡的那一版）

| 項目 | 內容 |
| --- | --- |
| 年費 | NT$100,000 未稅／公司／年 |
| 導入 | 免費顧問，含在年費 |
| 帳號 | 不收人頭費 |
| 產業包 | 100 包可切換，不另收費 |
| 金流／簡訊／LINE／電子發票 | 外部供應商原價，我們做適配 |
