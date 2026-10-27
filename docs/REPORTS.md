# 老闆儀表板與手機 App

儀表板在 `/workspace/reports`，選單叫「儀表板」。給老闆、主管、會計看整體生意，不是用來改資料：每一張卡片右上角都有「在 ERPNext 打開」，要看明細、換篩選、匯出 Excel，都到 ERPNext 原本的報表做。

## 自訂儀表板

按「自訂儀表板」可以拿掉卡片、從「加入」補回來、用 ↑ ↓ 排順序，「恢復預設」回到原本的樣子。可以選的卡片：本月營收、期間營收、本月毛利率、還沒收到的錢、每月營收、毛利率走勢、帳齡、前十大客人、從詢問到成交、快不夠的貨。預設不放毛利率走勢和成交漏斗。

設定記在這台電腦的瀏覽器，依登入的人分開（`dropout:guide:<人>:dashboard-layout`），不影響同事，也不寫進 ERPNext。換電腦會回到預設。卡片只會重排既有的數字，不新增資料來源，權限照下面的表。

## 誰看得到

| 職務 | ERPNext 角色 | 看得到 |
| --- | --- | --- |
| 老闆 | System Manager | 全部 |
| 主管 | Accounts Manager、Sales Manager | 全部 |
| 會計 | Accounts Manager | 全部 |
| 只有 Sales Manager | Sales Manager | 成交漏斗一定看得到；營收、客人、庫存照他在 ERPNext 能不能讀發票、品項；毛利與帳齡要有會計角色 |
| 其他人 | — | 選單沒有「儀表板」；直接打網址也只會看到「儀表板只有老闆、主管、會計看得到」 |

真正擋人的是 ERPNext：`dropout_core.reports.overview` 先檢查角色，每一段再照 ERPNext 自己的權限讀。毛利和帳齡用的是 ERPNext 的「Gross Profit」「Accounts Receivable」報表，只有在這個人能在 ERPNext 打開那張報表時才算。看不到的段落會寫「你的 ERPNext 角色看不到這一段」，其他段落照常顯示。

## 每個數字是什麼

全部只算登入者的預設公司（ERPNext 的 Company），金額是公司本位幣、未稅。期間可以選近 6、12、24 個月；「本月」是這個月 1 號到今天。

| 畫面上 | 意思 | ERPNext 從哪裡來 | 在 ERPNext 打開 |
| --- | --- | --- | --- |
| 本月營收、每月營收、近 N 個月營收 | 每個月已送出的銷項發票，未稅金額加總。退貨（折讓單）是負數，已經扣掉；期初發票不算 | Sales Invoice，`docstatus = 1`、`is_opening = No`，加總 `base_net_total` | Sales Invoice Trends |
| 毛利、本月毛利率 | 營收減掉出貨當下的成本 | ERPNext「Gross Profit」報表的算法（每月跑一次，依客人分組再加總）。成本用出貨時的庫存成本；服務或非庫存品沒有成本，毛利等於營收 | Gross Profit |
| 還沒收到的錢、帳齡 | 客人還欠的錢，依「付款到期日」到今天幾天分四段：未到期與 30 天內、31–60 天、61–90 天、超過 90 天 | ERPNext「Accounts Receivable」報表，`ageing_based_on = Due Date`，區間 30／60／90／120（120 以上併進「超過 90 天」） | Accounts Receivable |
| 前十大客人 | 選定期間內銷項發票未稅金額最多的十位，已扣退貨；旁邊的百分比是占同期營收多少 | Sales Invoice 依客人加總 `base_net_total` | Sales Analytics |
| 從詢問到成交 | 近 90 天各自新開了幾筆：詢問（Lead）、商機（Opportunity）、送出的報價、送出的訂單。「前一步的 %」是這一步除以上一步 | Lead 用建立日期；Opportunity、Quotation、Sales Order 用單據日期，報價與訂單只算已送出 | Sales Funnel |
| 快不夠的貨 | 預計數量低於再訂購點的品項，跟 ERPNext 自動補貨的判斷一樣。預計數量＝現有＋已訂未到－已接單未出 | 品項的「Reorder Level」（Item Reorder）對 Bin 的 `projected_qty`；沒有設再訂購點的品項不會列進來 | Stock Projected Qty |

注意：

- 成交漏斗每一步各自計數，不是追同一批人。近 90 天的訂單可能來自更早的報價，所以百分比是「大概的比例」，不是精準轉換率。
- 一家公司一個 ERPNext 站。Lead 沒有分公司，一站多公司時詢問數會包含其他公司。
- 某一段出錯時只有那一段顯示「現在拿不到」，原因記在 ERPNext 的錯誤紀錄（Error Log），其他段落照常。整個 ERPNext 連不上時，整頁顯示連線錯誤，不會改用示範數字。
- 沒接 ERPNext 時是示範資料，頁面標「示範資料」，數字跟「收錢」「倉庫」頁的示範帳本是同一套。

## 裝到手機

EveryThingOS 可以像 App 一樣放在手機桌面，打開時沒有瀏覽器網址列。

**iPhone（Safari）**

1. 用 Safari 打開公司的 EveryThingOS 網址，先登入
2. 點下方的「分享」按鈕
3. 選「加入主畫面」，名稱會是 EveryThingOS，按「新增」

**Android（Chrome）**

1. 用 Chrome 打開公司的 EveryThingOS 網址，先登入
2. 點右上角「⋮」
3. 選「安裝應用程式」或「加到主畫面」

裝好後從桌面打開，會直接進「今天」。

### 沒網路時

沒網路時打開，會看到「現在沒有網路」，連上後再點「再試一次」。

手機上只存這一頁和 logo。客人、帳、報表、登入後的任何畫面都**不會**存在手機裡，每次都向伺服器拿最新的；沒送出的單也不會在背景自己送。手機遺失時，到「團隊」停用那個人，或在 ERPNext 登出他的所有裝置即可。
