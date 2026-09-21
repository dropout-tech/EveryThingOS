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

- `/` 現場 → 規模 → 功能。選過的人會直接進今天（`/?setup=1` 重設）
- `/pricing` 一年十萬
- `/consulting` 免費導入
- `/industries` 一百個產業包（給想對照的人，不是進站必經）
- `/workspace` 今天這一件
- `/workspace/erp/sales` 生意：同一張單往下走

工作區裡點「下一步」會在這個瀏覽器走動，用來證明比 A1／億看直觀。**正式過帳還沒接到 ERPNext**，畫面上有這句說明。

## 還沒完整的

| 項目 | 狀態 |
| --- | --- |
| 產品殼、現場／規模／功能 onboarding、今天一件事、A1 下一步、黑白、海面到海底、邊緣折射玻璃、OpenReply 示範回覆 | 可看 |
| ERPNext 過帳、主檔權威 | 未接 |
| Keycloak 登入 | 未接 |
| Mautic／Postal 魅力圈寄信 | 未接 |
| Reacher 清庫、Shlink 短網址 | 未接 |
| OpenReply Meta webhook | 未接 |
| 電子發票加值中心 | 適配尚未接 |
| 公開預覽網址 | https://dropout-os.vercel.app （production 追 GitHub `main`） |

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
