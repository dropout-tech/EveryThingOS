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
| 錢 | `<Money amount={n} />`（`lib/format.ts` 的 `formatTwd`：`NT$12,345`、負數 `−NT$12,345` 自動紅色）；磚上用 `formatTwdShort`（`NT$15.5 萬`）。不要自己 `toLocaleString` |
| 數字欄 | `<th className="num" data-numeric="">`、`<td className="num" data-numeric="">`：靠右、等寬數字；合計放 `<tfoot>`。寬表格捲動放在玻璃裡面一層 `<div className="glass"><div className="sm:overflow-x-auto">` |
| 頁內區塊 | `<Section id title aside>`：同一種標題大小與間距（`.section-head`、`.section-title`） |
| 一行說明 | `<MoreText>`：超過一行才出現「看更多」。`PageHeader` 的 `hint`、`Hint` 的內文都已經用它 |
| 數字磚 | `<ul className="kpi-grid"><li className="kpi">`：`.kpi-label`、`.kpi-value`、`.kpi-note[data-tone]` |
| 搜尋列表 | `<div className="toolbar"><SearchBox label value onChange /></div>`；Esc 清空 |
| 看一筆的細節 | `<Drawer open title onClose footer>`：桌機右側、手機底部；Esc 關、焦點回原處 |
| 頭像 | `<Avatar name="王美玲" />`（`components/ui/Avatar.tsx`）：取姓或英文縮寫，同一個名字永遠同一個顏色（`data-tone` 1–6）；`size="lg"` 大一號；旁邊沒有名字時給 `label` |
| 小圖示 | `<Icon name="sales" />`（`components/ui/Icon.tsx`）：線條、`currentColor`、讀屏不念；頁面用 `iconForHref(href)` |
| 對話 | 對方說的 `.bubble`，我們回的 `.bubble bubble-out`，名字與時間 `.bubble-meta` |
| 數量 | `.badge-count`（欄位、選單）、`.tabbar-badge`（手機底列）；`NavItem.count` 有值就自動顯示 |
| 跳頁／找事做 | `⌘K`／`Ctrl+K` 或頂列「搜尋」：`CommandPalette`；新的常用動作加在 `lib/nav.ts` 的 `PALETTE_ACTIONS` |
| 麵包屑 | `PageHeader` 自動依 `lib/nav.ts` 的 `TRAIL` 顯示「今天 / 生意 / 收錢」；新頁面要加一行 |
| 選單分組 | `lib/nav.ts` 的 `navSections`：今天／客人／生意／公司／設定；手機底列是今天、客人、生意、對話（或報表） |

## 頁面版型

每個模組照同一個順序：

1. `PageHeader`：麵包屑 → 標題（`h1`）＋狀態 `Badge` → 一行目的（`hint`）→ 右邊一個主按鈕（`action`）。
2. 篩選列：`.toolbar`（分段切換、`SearchBox`、小字說明）。
3. 內容：桌機用 `table-stack` 或欄位看板，手機自動變成卡片；數字靠右。
4. 一筆的細節用 `Drawer`，不要換頁。
5. 沒資料用 `EmptyState`、載入用 `loading.tsx`＋`Skeleton`、出錯用 `error.tsx`＋`ErrorPanel`。

「今天」：一件事（`.next-action`，一個主按鈕）→「等你處理」（`.queue`，依急迫排、有頭像與金額）→ 數字磚 → 開站清單（做完一半後自動收起）→ 第一天三件事。

## 風格掛鉤（style hook contract）

`<html data-theme="black|white" data-style="minimal|fluid|social">`。三種風格各寫在 `web/app/styles/<style>.css`，**每條規則都要以 `html[data-style="<style>"]` 開頭**；畫面結構與文字不因風格改變。

先改變數，變數不夠再改 class。深淺色分開時寫 `html[data-style="x"][data-theme="white"]`。工作區 `.os-shell` 會再宣告 `--glass-fill`、`--glass-blur`、`--cream-dim`，要改這三個請寫 `html[data-style="x"] .os-shell { … }`。

### 變數（預設值在 `web/app/globals.css`）

| 類別 | 變數 | 預設 |
| --- | --- | --- |
| 字體 | `--font-body` `--font-heading` | Noto Sans TC、Outfit（Tailwind 的 `font-sans`／`font-display` 與 `.display`、`.kicker`、`.kpi-value` 都跟著它） |
| 底色與字色 | `--ink` `--ink-2` `--cream` `--cream-dim` `--line` `--grid` | 深：近黑底白字；淺：淺灰底黑字 |
| 狀態色 | `--ok` `--warn` `--danger` `--focus` | 深淺各自過 4.5:1 |
| 強調 | `--accent` `--on-accent`（分段切換選中、進度條）；`--primary-fill` `--primary-fill-hover` `--on-primary`（主按鈕） | 白底黑字／黑底白字 |
| 卡片表面 | `--surface-card` `--surface-card-border` `--surface-hover` | 半透明深／白 |
| 浮層表面 | `--surface-raised`（對話框、Drawer、搜尋）`--surface-scrim`（Toast、底列、徽章底）`--overlay`（遮罩） | |
| 模糊 | `--surface-blur`（底列、浮層、`.site-sheet`）`--glass-blur`（`.glass`） | 14px、2px（工作區 6px） |
| 玻璃 | `--glass-fill` `--glass-fill-strong` `--glass-stroke` `--glass-highlight` `--glass-shadow` `--glass-1/2/3` `--glass-radius` | 32px |
| 凹槽 | `--well-fill` `--well-border` `--well-radius`；工作區另用 `--os-well` `--os-chip` `--os-glass-fill` `--os-veil` | 28px |
| 官網卡 | `--site-sheet-fill` `--site-sheet-border` `--site-sheet-shadow`（沒設時用內建深／淺值） | |
| 輸入框 | `--field-bg` `--field-border` `--control-fill` `--control-fill-hover` | |
| 圓角 | `--card-radius`（卡片、KPI、對話框）`--control-radius`（輸入框）`--btn-radius`（按鈕、搜尋鈕）`--chip-radius`（徽章、分段）`--nav-item-radius` `--avatar-radius`；底層 `--ui-radius-sm/md/lg/xl/pill` | 24／12／999／999／16／999 |
| 陰影 | `--card-shadow`（卡片、KPI、今天的大卡）`--ui-shadow-1/2/3` | none、按鈕／卡片／對話框 |
| 卡片內距 | `--card-padding` | 1.25rem |
| 選單 | `--nav-bg`（手機底列）`--nav-active-bg` `--nav-active-ink` `--nav-indicator`（左側選中條、搜尋選中） | |
| 數字磚 | `--kpi-value-size` | 1.625rem |
| 頭像 | `--avatar-fill`（沒名字時）`--avatar-tone-1…6`（依名字分色） | 主色混進 `--ink`，深淺都過 4.5:1 |
| 動態 | `--motion-fast` `--motion-base` `--motion-ease` | 160ms、240ms；「減少動態效果」時自動變 0 |
| 場景 | `--scene-image` `--scene-veil` `--ocean-y` `--glass-px` `--glass-py` `--type-shadow` | 只有流體藝術用得到 |
| 尺寸（**不要改小**） | `--ui-tap`（44px）`--ui-control` `--ui-tabbar` `--ui-space-*` `--ui-text-*` | |

### 可以改外觀的 class（名字不會改）

- 殼：`.scene-layer` `.page-shell` `.os-shell` `.glass` `.glass-hero` `.glass-nav` `.glass-bar` `.glass-well` `.glass-chip` `.glass-pill` `.glass-cta` `.glass-lift` `.lens` `.lens-film` `.brand-glyph` `.display` `.scene-type` `.scrim`
- 選單：`.nav-group` `.nav-group-title` `.nav-link[aria-current]` `.tabbar` `.tabbar-item` `.tabbar-dot` `.segmented` `.breadcrumbs` `.cmdk-trigger` `.cmdk` `.cmdk-input` `.cmdk-group-title` `.cmdk-item[aria-selected]` `.cmdk-item-hint` `.kbd` `.skip-link` `.site-skip`
- 頁首：`.page-header` `.page-title` `.page-purpose` `.kicker` `.section-head` `.section-title` `.toolbar` `.search-field`
- 內容：`.card` `.card-flush` `.card-interactive` `.kpi-grid` `.kpi` `.kpi-label` `.kpi-value` `.kpi-note[data-tone]` `.next-action` `.next-action-title` `.queue` `.queue-item` `.avatar` `.avatar-lg` `.avatar[data-tone]` `.bubble` `.bubble-out` `.bubble-meta` `.badge-count` `.tabbar-badge` `.icon` `.hint-icon` `.link-card` `.menu-link` `.table-stack`（含 `thead` `tfoot`）`.num` `[data-numeric]` `.money[data-tone]` `.progress` `.empty-state` `.hint` `.disclosure` `.disclosure-mark` `.clamp-1` `.more-toggle`
- 控制項：`.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-danger-solid` `.btn-sm` `.btn-block` `.field` `.field-label` `.field-hint` `.field-error` `.form-actions` `.sticky-submit` `.theme-toggle`（`button[aria-pressed]`）`.style-picker` `.style-card[aria-checked]`（選中時 `::before` 打勾、`::after`「使用中」）`.style-card-swatch`（`[data-style-option]`，各風格自己的檔案畫）
- 狀態：`.badge` `.badge-demo` `.badge-practice` `.badge-readonly` `.badge-ok` `.badge-warn` `.badge-danger` `.site-chip[data-tone=ok|warn|bad|muted]`
- 浮層：`.dialog` `.dialog-sheet` `.drawer` `.drawer-head` `.drawer-body` `.toast` `.toast-error` `.toast-stack` `.skeleton` `.spinner`
- 官網：`.site-scope` `.site-sheet` `.site-field` `.site-chip` `.site-table` `.site-dialog`

瀏覽器頂列顏色（`theme-color`）由 `lib/style.ts` 的 `themeColor(style, theme)` 決定，換風格要一起改那張表。

### 風格不能做的事

- 不能藏掉有資訊的東西（徽章、錯誤、金額、焦點框）或改掉文字。
- 不能把可以按的東西縮到 44px 以下，不能讓字跟底的對比低於 4.5:1（深淺兩色都要看）。
- 動畫要用 `--motion-*` 或放進 `@media (prefers-reduced-motion: no-preference)`；`prefers-reduced-transparency` 時不要再加模糊。
- 新增 class 放 `@layer components`（不然會蓋掉 Tailwind 的 `w-*`、`px-*`）。

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
