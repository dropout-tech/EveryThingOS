# DropOut 套皮

產品外殼（`web/`）是黑／白兩套介面，右上角切換；背後是**一條從海面到海底的連續風景**，往下滑玻璃才有東西可折射。底下開源系統之後也走同一組對比，不再用青綠／橘色當主色。

## Logo

DropOut OS 的標是**玻璃水滴 + 海面漣漪**，黑白都能用。

| 檔 | 用途 |
| --- | --- |
| `web/app/icon.svg` | 瀏覽器分頁 |
| `web/app/apple-icon.png` | 加到主畫面 |
| `web/public/brand/dropout-mark.svg` | 簡潔標（深底） |
| `web/public/brand/dropout-app-icon.png` | App 圖示 |
| `web/public/brand/og-dropout-os.png` | 分享圖 |
| `branding/logo/` | 同一套，給套皮與對外 |

頁首用 `BrandMark`：水滴在玻璃方塊裡，旁邊是 DropOut OS。琢奧舊的青綠「do」字標仍留在 `logo-full.png`，那是公司字，不是 OS 產品標。

| 系統 | 主題位置 | 怎麼掛 |
| --- | --- | --- |
| DropOut OS 外殼 | `web/` | Next.js，已套皮 |
| ERPNext／Frappe | `branding/erpnext/dropout_theme` | `bench get-app` 本目錄後 `bench install-app dropout_theme` |
| Mautic | `branding/mautic/dropout.css` | 放到 Mautic `media/css/`，並把 lockup 圖放到 `media/images/dropout-lockup.png` |
| Keycloak | `branding/keycloak/dropout` | 複製進 Keycloak `themes/dropout`，realm 選 login theme = dropout |
| Shlink Web | `branding/shlink/dropout.css` | 建置前覆蓋 CSS 變數 |
| Activepieces | `branding/activepieces/dropout.css` | 覆蓋 primary color |

原廠名稱（ERPNext、Mautic、Keycloak）不出現在員工導覽。授權與來源仍寫在內部維運文件。
