# DropOut Pack Edu

教育服務業產業包。透過 `dropout_pack_edu/pack.json`，由 `dropout_core.packs` 轉成 ERPNext 標準紀錄：

- **網域**：`Services`、`Distribution`（支援課程服務與教材／材料庫存）
- **商品群組**：`課程`、`期班`、`教材`、`材料包`、`耗材`
- **客群**：`學員`、`家長`、`企業包班`
- **計量單位（UOM）**：`堂`、`期`、`本`、`份`、`組`
- **課程 BOM（`course_boms` → ERPNext `Product Bundle`）**：自動建立非庫存課程父項與庫存教材／材料包，開單出貨時依每位學員用量自動展開並扣減教材庫存；殼層的倉庫頁依現有庫存試算「還能收幾位學員」與「卡在哪項瓶頸材料」
- **銷售階段、名單來源、專案範本（開班）、信件範本（開課通知）、Webshop 設定**

安裝與升級：

- 裝：`bench --site <site> install-app dropout_pack_edu`
- 重新套用：`bench --site <site> migrate`（只補缺的，不覆蓋公司改過的）
- 移除 app 不會刪掉已建立的業務資料
