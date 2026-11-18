# 架構

> **2026-11-19（Asia/Taipei）起：** EveryThingOS 改為全程自建。舊的 ERPNext、Chatwoot、glue 整合程式與導入工具已自本分支移除；帳本、客人、任務與文件寫在本機 D1。請不要再依下文去安裝、串接或搬資料進那些外部系統。路徑與 API 仍可使用 CRM／ERP 作為對內名稱。

產品殼在 `web/`，資料在本機 D1（帳本、帳號、客人、任務、文件）。舊文描述的 `frappe-apps/`、`glue/`、`toolkit/`、`deploy/` 已刪除，那些安裝與接線步驟不要再做。
