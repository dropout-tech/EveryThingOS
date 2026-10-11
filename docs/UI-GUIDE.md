# 工作區介面守則

給改 `/workspace/**` 畫面的人。目標：老闆、業務、倉管、會計、人資拿手機站在現場也看得清、按得到、不會按錯。海面到海底的場景與液態玻璃保留，但字永遠比風景重要。

## 代號（`web/app/globals.css`）

舊名字（`--cream`、`--cream-dim`、`--teal`、`--orange`、`--glass-*`）都還在，官網與後台照用；新增的如下。

| 類別 | 代號 | 用途 |
| --- | --- | --- |
| 狀態色 | `--ok` `--warn` `--danger` `--focus`（Tailwind：`text-ok`、`text-warn`、`text-danger`、`text-focus`） | 成功、要注意（逾期、不夠）、錯誤或刪除、焦點框。深淺兩色各自對過 4.5:1 |
| 主按鈕 | `--primary-fill` `--on-primary` | 實心按鈕，一頁一個 |
| 輸入框 | `--field-bg` `--field-border` | 所有 input／select／textarea |
| 底襯 | `--surface-scrim` | 浮在風景上的字、Toast、底部選單、對話框 |
| 工作區 | `--os-veil` `--os-glass-fill` `--os-well` `--os-chip` `--os-cream-dim` `--control-fill` | 只在 `.os-shell` 裡生效：場景加深、玻璃加厚 |
| 玻璃層級 | `--glass-1` `--glass-2` `--glass-3` | 由淡到濃 |
| 圓角 | `--ui-radius-sm/md/lg/xl/pill`（12／16／24／32／999） | 輸入框 sm、卡片 lg、大卡 xl、按鈕 pill |
| 間距 | `--ui-space-1…8` | 0.25rem 為一格 |
| 字級 | `--ui-text-xs…2xl` | 頁標題用 `.page-title`（手機 xl、桌機 2xl） |
| 陰影 | `--ui-shadow-1/2/3` | 按鈕、卡片、對話框 |
| 尺寸 | `--ui-control`（40px）`--ui-tap`（44px）`--ui-tabbar` | 觸控裝置上所有控制項至少 44px |

## 元件

| 要做什麼 | 用這個 |
| --- | --- |
| 按鈕 | `<Button variant="primary｜secondary｜ghost｜danger" size="sm" pending>`；連結長得像按鈕用 `buttonClass({...})` |
| 輸入框 | `<Field label hint error><input className="field" /></Field>`，自動接好 `id`、`aria-describedby`、`aria-invalid` |
| 狀態標籤 | `<Badge tone="demo｜practice｜readonly｜ok｜warn｜danger" />`；前三種預設字是「示範資料」「練習」「只能看」 |
| 頁首 | `<ModuleFrame kicker title hint badge action>`（或 `<PageHeader>`）。標題是 `h1`，區塊用 `h2` |
| 表格 | `<table className="table-stack">`，每格 `data-label="欄名"`，第一格 `data-primary`；手機自動變成一張張卡 |
| 做完的回饋 | `<ActionNote>` 或 `<ActionOutcomeNote>`：右下 Toast，讀屏會念，可關，不推擠版面 |
| 會刪、會寄、會停用 | `const [confirm, dialog] = useConfirm()`，`if (!(await confirm({ title, body, danger: true }))) return;` |
| 載入／出錯 | 各段落的 `loading.tsx`（`<Skeleton>`）與 `error.tsx`（`<ErrorPanel>`） |
| 分段切換 | `<nav className="segmented">` 加 `aria-current="page"` |

## 要／不要

- 要：一頁只有一個實心主按鈕；其他用 secondary 或 ghost。
- 要：示範、練習、只能看一律用 `Badge`，不要只寫在小字裡。
- 要：連結有底線或長得像按鈕；不要只靠顏色分辨。
- 要：錯誤寫在欄位下面，說要怎麼改（「請填客戶名稱。」）。
- 不要：自己拼 `glass-cta rounded-full px-4 py-2 …`，改用 `Button`／`buttonClass`。
- 不要：`window.confirm`、`alert`。
- 不要：字直接放在亮的海面上；放進玻璃卡，或加 `.scrim`。
- 不要：`text-orange` 表示警告（深色主題它其實是白色），用 `text-warn`／`text-danger`。
- 不要：在 CSS 用沒有 `@layer` 的新元件 class，會蓋掉 Tailwind 的 `w-*`、`px-*`；放進 `@layer components`。

## 無障礙檢查表

- [ ] 手機 390px 寬不會左右捲；表格用 `table-stack`。
- [ ] 觸控裝置每個可以按的東西至少 44×44px。
- [ ] 一般字對比 4.5:1、大字 3:1，深淺兩色都看過（亮的海面最容易出事）。
- [ ] 只用鍵盤可以走完：Tab 看得到焦點框，「跳到內容」可用，對話框 Esc 關掉、焦點回到原本的按鈕。
- [ ] 每個輸入框都有看得到的標籤。
- [ ] 送出後按鈕顯示「處理中…」且不能重複按；結果出現在 Toast。
- [ ] 刪除、停用、退回、寄出前會問一次。
- [ ] 開「減少動態效果」時沒有折射、彈性跟隨、視差、轉圈動畫。
- [ ] 手機與「減少透明度」時不跑位移濾鏡（`Lens` 自動判斷）。
