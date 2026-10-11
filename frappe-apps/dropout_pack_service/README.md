# DropOut Pack Service

顧問業產業包。只有 `dropout_pack_service/pack.json`，由 `dropout_core.packs` 轉成 ERPNext 標準紀錄（商品群組、客群、單位、銷售階段、名單來源、專案範本、信件範本、Webshop 設定）。

- 裝：`bench --site <site> install-app dropout_pack_service`
- 重新套用：`bench --site <site> migrate`（只補缺的，不覆蓋公司改過的）
- 移除 app 不會刪掉已建立的業務資料
