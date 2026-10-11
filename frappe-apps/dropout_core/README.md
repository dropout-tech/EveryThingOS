# DropOut Core

ERPNext v15 的 DropOut OS 核心 app。不改 ERPNext 原始碼，只加：

- DocType：`DropOut Identity`（通道身分）、`DropOut Consent`（同意）、`DropOut Event`（事件，冪等鍵唯一）、`DropOut Settings`
- 統一編號檢查碼驗證（系統國家為 Taiwan 時）
- 報價、訂單、出貨、發票、收款送出時自動寫事件
- `dropout_core.api.*`：給 Cloudflare 膠水（G1–G10）與產品殼呼叫
- `dropout_core.actions.*`：殼的寫入動作（開報價、單據下一步、新增客人並去重、電子報草稿與寄出），全部走 ERPNext 原本的 mapper 與權限
- `dropout_core.shell.*`：殼的讀取 API（生意、客人、商品目錄、官網、會議、名單健康）
- `DropOut Import Check` 報表與 `setup_status` 導入進度；`provisioning.import_defaults` 給導入工具讀站台預設值
- 電子報分群「新朋友」「老客人」（ERPNext 內建 Email Group）

安裝方式見 [`frappe-apps/README.md`](../README.md)。裝好之後接上膠水：

```bash
bench --site <site> execute dropout_core.install.configure_glue --kwargs '{"url":"https://glue.example.com","secret":"..."}'
```
