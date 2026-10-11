# 簽核與報帳

`/workspace/approvals` 是主管每天清的收件匣：報帳、假單、超過門檻的採購單、大折扣報價都排在「等我簽」。同事也在這裡拍收據報帳，在「我送出的」看自己的單子走到哪。

## 用什麼做

- **Frappe Workflow**（v15 內建）：採購單與報價的核准流程。殼只呼叫 `frappe.model.workflow.get_transitions` 和 `apply_workflow`，不自己改狀態。
- **Frappe HRMS** 的「Leave Application」與「Expense Claim」：假單沿用人事頁的 `dropout_hr_tw.shell.decide_leave`；報帳用 HRMS 的核准狀態（`approval_status`）。
- **`dropout_core.approvals`**（`frappe-apps/dropout_core/dropout_core/approvals.py`）：整理收件匣、做決定、建報帳單、讀收據。測試在 `tests/test_approvals.py`。
- 收據照片用 Frappe 內建的 `/api/method/upload_file` 存成**私人檔案**，掛在報帳單上。

沒裝 HRMS 的公司，報帳和假單會顯示「還沒開人事」，採購與報價照常運作。

## 等我簽

| 類型 | 什麼時候會出現 | 誰簽 |
| --- | --- | --- |
| 假單 | 送出、還沒核准的假單 | 員工資料上的請假核准人 |
| 報帳 | 草稿狀態的報帳單 | 員工資料上的報帳核准人；HR Manager、HR User、System Manager 也看得到 |
| 採購 | 開了「大額採購」規則，且金額超過門檻 | Purchase Manager |
| 報價 | 開了「大折扣報價」規則，且折扣超過門檻 | Sales Manager |

每張卡片寫：誰送的、買什麼、多少錢、為什麼、送來多久、附件。點「核准」就過；「退回」一定要寫原因，原因會留在單子的留言裡，送單的人在「我送出的」看得到。

**小額一次核准**：五千元以下的報帳、一天以內的假單，可以一次勾起來簽（一次最多 20 張）。採購與報價一律一張一張看。

**不能簽自己的單**：伺服器檢查一次、Frappe 的 Workflow 再擋一次（`allow_self_approval` 關閉）、殼的 API 只接受出現在你收件匣裡的單。

## 報帳

填金額、日期、分類、備註，拍收據。

- 分類：交通、餐費、住宿、文具、郵資、其他。第一次用時會建好對應的「Expense Claim Type」，並依科目名稱（旅費、交際費、文具用品、郵電費…）自動配會計科目；找不到就用雜項。公司改過的不會被蓋掉。
- 金額要大於 0、不超過一百萬；日期不能是未來，也不能超過一年前；備註最多 500 字。沒附收據就要寫原因。
- 照片在手機上先縮小（最長邊 1600 像素以內、3 MB 以內）轉成 JPEG 再送；伺服器只收 JPEG、PNG、WebP、GIF。iPhone 的 HEIC 要瀏覽器打得開才能轉。
- 報帳的人要有員工資料。核准後單子會送出（submit），付款仍在 ERPNext 做。

## 核准規則

`/workspace/approvals` 最下面「核准規則」，只有 System Manager 看得到。

| 規則 | 預設門檻 | 送審條件 |
| --- | --- | --- |
| 大額採購 | NT$50,000 | 採購單含稅總額超過門檻 |
| 大折扣報價 | 15% | 報價（未稅）比牌價低超過門檻 |

- 預設是**關的**。打開才會建立 Workflow「DropOut 大額採購核准」「DropOut 報價折扣核准」，狀態是 草稿 → 待核准 → 已核准／退回。
- 門檻以下的單子，業務或採購直接「送出」，不用等。超過門檻要「送審」，主管核准才會送出。
- 那張表已經有別的 Workflow 在用時，不會蓋掉，會請你先到 ERPNext 關掉。
- 直接在 ERPNext 按送出也擋得住：超過門檻、還沒核准的單子不能送出。
- 改門檻或關掉都可以重來，重跑不會多建東西。

## 給開發的人

- 資料：`web/lib/sources/approvals.ts` 的 `getApprovals(pack)`；Today 頁要顯示數字可以用 `pendingApprovals(pack)`（回傳張數，拿不到時是 `null`）。
- API：`/api/approvals/decide`、`/api/approvals/expense`、`/api/approvals/rules`、`/api/approvals/file`。都檢查登入、`writeBlocked`，輸入在伺服器再驗一次。
- 示範模式的簽核和報帳只存在瀏覽器裡。

## 還沒做

- 一張報帳單只有一行費用；多筆要到 ERPNext 加。
- 核准後的付款、沖帳不在這頁。
- 沒有通知（Email、LINE）；要靠主管自己打開收件匣。
- 假單如果另外設了 Workflow，仍走人事的請假核准，不走這裡的 Workflow。
