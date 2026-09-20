# DropOut 套皮

所有開源系統的員工畫面都走琢奧識別：墨色 `#1a1612`、奶油字 `#f4efe4`、青綠 `#65c5bc`、橘色 `#e08a3c`，logo 用 `do` 字標 + DROPOUT 琢奧科技。

| 系統 | 主題位置 | 怎麼掛 |
| --- | --- | --- |
| DropOut OS 外殼 | `web/` | Next.js，已套皮 |
| ERPNext／Frappe | `branding/erpnext/dropout_theme` | `bench get-app` 本目錄後 `bench install-app dropout_theme` |
| Mautic | `branding/mautic/dropout.css` | 放到 Mautic `media/css/`，並把 lockup 圖放到 `media/images/dropout-lockup.png` |
| Keycloak | `branding/keycloak/dropout` | 複製進 Keycloak `themes/dropout`，realm 選 login theme = dropout |
| Shlink Web | `branding/shlink/dropout.css` | 建置前覆蓋 CSS 變數 |
| Activepieces | `branding/activepieces/dropout.css` | 覆蓋 primary color |

原廠名稱（ERPNext、Mautic、Keycloak）不出現在員工導覽。授權與來源仍寫在內部維運文件。
