# DropOut Pay TW

把綠界（ECPay）與藍新（NewebPay）接進 Frappe Payments，做法與 Payments 內建的 Stripe、PayPal 相同（`<Gateway> Settings` 單例）。不改 Payments、ERPNext 原始碼。

- 付款請求（Payment Request）選 ECPay／NewebPay → 產生 `/tw_pay` 連結 → 自動送出到金流頁
- 金流的伺服器通知打到 DropOut 膠水（`glue/`，G9），驗簽、去重後呼叫 `dropout_core.api.record_payment`；金額不符不自動沖帳
- 只收新台幣
