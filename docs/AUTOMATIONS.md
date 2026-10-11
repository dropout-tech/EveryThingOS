# 自動化與通知中心

狀態：第一版。頁面 `/workspace/automations`（FeatureId `automations`），頂列右上角的通知鈴在每一頁都有。展示模式全部在瀏覽器裡跑；正式模式由膠水 Worker（`glue/`）每 5 分鐘檢查一次，真的在 ERPNext 動手。

---

## 1. 六條「當…就…」

每條都有預設值，打開前可以改參數。參數在殼（`web/lib/automations.ts`）和膠水（`glue/src/automations.ts`）用同一套規則檢查，膠水那邊才算數。

| 規則 | 當… | 就… | 在 ERPNext 動到什麼 | 參數 | 多久看一次 |
| --- | --- | --- | --- | --- | --- |
| `invoice_overdue` 發票逾期提醒 | 銷貨發票過了到期日 N 天還沒收齊 | 寄提醒信給客人＋給開單的人一個待辦 | ToDo（`frappe.desk.form.assign_to.add`）、Email（既有寄信路徑，需要 `mail_from`） | 天數 1–365（預設 7）、要不要寄信 | 每天 |
| `quote_followup` 報價沒回要跟進 | 報價送出 N 天客人沒回 | 給報價的人一個待辦 | ToDo | 天數 1–90（預設 5） | 每天 |
| `lead_idle` 新客人沒人跟 | Lead N 天沒有任何進度 | 給負責人一個待辦 | ToDo（指派給 `lead_owner`） | 天數 1–90（預設 3） | 每天 |
| `low_stock` 低於安全庫存就請購 | 倉庫數量低於 Item Reorder 的安全量 | 開請購單草稿，補到安全量的 X% | Material Request（草稿，`docstatus=0`，採購確認後才送出） | 補到 100–500%（預設 150%） | 每天 |
| `contract_renewal` 合約快到期要續約 | Contract N 天內到期 | 給建立者一個續約待辦 | ToDo | 天數 1–180（預設 30） | 每天 |
| `big_order` 大訂單通知老闆 | 一筆已送出的訂單超過金額 | 指派待辦給指定的人，對方的鈴會響 | ToDo＋Notification Log | 金額 1,000–100,000,000（預設 100,000）、通知誰（Email，打開時必填） | 每小時 |

每一次觸發都會送出一個 `automation.fired` webhook 事件（見 `docs/PUBLIC-API.md`）。

## 2. 不會重複做

- 每筆觸發的唯一鍵是「公司＋規則＋單號＋觸發日」（`automation_runs` 的 UNIQUE）。觸發日從資料算出來，例如「到期日＋N 天」，所以同一張發票不會每天再提醒一次。
- 寄信和開請購單之前先佔用（`seen` 表），失敗才釋放，重試不會重寄。
- 指派待辦交給 Frappe 的 `assign_to.add`，同一張單已有未完成的待辦就不會再開。
- 低庫存規則看到已有未完成的請購單就跳過。
- 失敗的動作走既有佇列：最多 4 次、間隔 30 秒起倍增；還是不行就標成「沒做成」並進 dead letter，通知鈴會顯示。

## 3. 怎麼關

- 頁面上每張卡片按「關掉」，下一次檢查起就不再動作；已經做過的事不會撤回。
- 合約變成唯讀（`writeBlocked`）時，膠水整家公司跳過，殼這邊也不能改設定。
- 緊急時可以在 D1 直接執行 `UPDATE automation_rules SET enabled = 0 WHERE site = ?`。

## 4. 誰能用

- 看、改設定、試跑：System Manager、Sales Manager、Accounts Manager。殼的 `/api/automations/*` 先檢查登入與角色，再轉給膠水的 `/admin/tenants/:site/automations`。
- 每次開、關、調整都會寫一筆帳號事件，記下是誰改的。
- 「試跑」只讀資料、列出現在會做的事，不會真的動手。

## 5. 通知鈴

- 來源：目前使用者自己的 Frappe Notification Log（`get_notification_logs`）、最近 24 小時的自動化觸發（有權限的人才看到）、dead letter（只有 System Manager 看到）。
- 任一個來源連不上，鈴還是會顯示其他來源，並說明哪裡沒讀到。
- 「標為已讀」：ERPNext 的通知寫回 ERPNext（`mark_as_read`／`mark_all_as_read`），其他項目記在這台瀏覽器。
- 展示模式顯示從展示帳本算出來的範例通知。

## 6. 檔案

| 位置 | 內容 |
| --- | --- |
| `glue/migrations/0007_automations.sql` | `automation_rules`、`automation_runs` |
| `glue/src/automations.ts`、`automation-store.ts` | 規則、讀資料、排程、動作、管理路由 |
| `glue/test/automations.test.ts` | vitest |
| `web/lib/automations.ts` | 純函式：範本、參數檢查、今日預覽、展示模擬 |
| `web/lib/automations-server.ts`、`web/app/api/automations/*` | 權限、轉送膠水 |
| `web/components/AutomationsBoard.tsx`、`web/app/workspace/automations/page.tsx` | 頁面 |
| `web/lib/notifications.ts`、`web/app/api/notifications/*`、`web/components/NotificationBell.tsx` | 通知鈴 |

## 7. 已知限制

- 正式模式的預覽和試跑都要膠水；沒有膠水時頁面停在展示模式。
- 低庫存規則假設 ERPNext 的 Item Reorder 已設定，合約規則假設有在用 Contract。
- 非 ERPNext 通知的已讀狀態只存在這台瀏覽器。
