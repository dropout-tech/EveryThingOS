# 匯入資料精靈

開站第一天，老闆把舊的 Excel 貼進來，幾分鐘內就在 DropOut OS 看到自己的客人、供應商和商品。這份寫的是精靈做什麼、檢查哪些規則、怎麼寫進 ERPNext、還沒做的有哪些。

頁面在 `/workspace/settings/import`（設定 → 匯入客人、供應商、商品）。開站清單的「匯入客人」「匯入商品」、客人看板沒有客人時的「匯入客人名單」都連到這裡。

## 誰能用

| 情況 | 會看到 |
| --- | --- |
| 示範模式（沒接 ERPNext） | 整套流程都能走；匯入的資料只存在這個瀏覽器分頁（`sessionStorage`），客人進「客人」看板最後一欄，商品進「倉庫」清單 |
| 已接 ERPNext，登入的人是 System Manager | 真的寫進 ERPNext |
| 已接 ERPNext，不是 System Manager | 「只有老闆可以匯入資料」 |
| 合約只能看（`writeBlocked`） | 「現在不能新增資料」和原因 |

API 也各自再檢查一次（不靠畫面藏按鈕）：`/api/import/check`、`/api/import/run` 都要同源、JSON、大小有上限，並用 `dropout_core.shell.whoami` 確認是 System Manager；`run` 另外檢查 `writeBlocked`。

## 五個步驟

1. **選種類**：客人（Customer）、供應商（Supplier）、商品與售價（Item）。
2. **貼上／上傳**：從 Excel 複製貼上（Tab 分隔）；或上傳 CSV（UTF-8、有 BOM、Big5、UTF-16 都認得：UTF-8 解不開就當 Big5，跟導入工具同順序）；或 `.xlsx`（第一個工作表）。舊版 `.xls` 請另存。每種都有範本可以下載，也可以「先用範例試試」。一次最多 2,000 列、檔案 10 MB。
3. **對欄位**：依表頭自動對好（中英文、全形半形、大小寫、空白與標點都不影響），可以改；必填沒對到不能往下。
4. **檢查**：每一列「可以／提醒／跳過」。已接 ERPNext 時，先問伺服器哪些名稱、料號、統編已經存在，以及群組、地區、單位可以填哪些。
5. **匯入**：每 20 列一批，看得到進度、可以停止。結束後列出沒進去的列與原因，可以下載 CSV（原本的欄位加上「列號」「原因」），改好再貼回來。

## 欄位

| 種類 | 欄位（* 必填） | 也認得的表頭（節錄） |
| --- | --- | --- |
| 客人 | 客人名稱*、類型、統一編號、聯絡人、電話、Email、地址、群組、地區、舊代號 | 客戶名稱、公司名稱、名稱、客戶全名、Company；統編、營業登記號碼、VAT；手機、行動電話、Phone；E-mail、電子郵件 |
| 供應商 | 供應商名稱*、統一編號、聯絡人、電話、Email、地址、群組、舊代號 | 廠商名稱、廠商全名、Vendor |
| 商品與售價 | 料號*、品名*、售價、單位、群組、規格、庫存品 | 品號、品項代碼、SKU；品項名稱、Item Name；標準售價、單價、Price；庫存單位、UOM |

導入工具 `toolkit/dropout_onboard/mappings/{excel,a1,ecount}` 認得的表頭，精靈全部認得（有測試保證）；精靈多認得聯絡人、地址和一些英文表頭。

## 檢查規則

跟導入工具的 `checks.py`、`taiwan.py` 同一套，另外加上 ERPNext 一定會擋的情況。

**跳過（不匯入）**

- 必填空白：名稱、料號。
- 名稱或料號在檔案裡重複：每一列都標出來（跟 `checks.py` 一樣），留一列再匯。
- ERPNext 裡已經有同名客人／供應商、同料號商品（比對不分大小寫）。不會蓋掉舊資料。
- 統一編號檢查碼錯誤。
- 售價不是數字、是負的或大得離譜。
- 名稱、料號超過 140 字；規格、地址、舊代號超過 1,000 字；料號含 `< > "`。

**提醒（照樣匯入）**

- 統編在檔案裡重複，或跟 ERPNext 裡另一家一樣：可能是同一家。
- Email 格式不對：那一格不匯入。
- 電話轉不成 +886 格式：只含數字與 `+-()# ` 就照原樣存，否則不匯入那一格。
- 9 碼、9 開頭的手機（Excel 把 0 吃掉）：補 0。7 碼統編補 0 後檢查碼正確：補 0。
- 地址看不出縣市（22 個縣市名）：改放備註，不建地址。
- 群組、地區、單位在 ERPNext 找不到：用預設值。
- 類型看不懂：當公司。商品沒有售價：0 元。

**統一編號**：8 碼數字，各位數乘 1,2,1,2,1,2,4,1，乘積十位加個位後加總；總和能被 5 整除就對（2023 年起；以前是 10，能被 10 整除的也一定能被 5 整除）。第 7 碼是 7 時，那一位的 10 可以再算成 1 或 0，任一種能整除就對。

`toolkit/tests/fixtures/import_rules.json` 是兩邊共用的案例（統編、電話、Email、金額），`toolkit/tests/test_toolkit.py` 和 `web/scripts/importer.test.mjs` 都跑它。

## 怎麼寫進 ERPNext

全部用 Frappe v15 內建、白名單的方法，以登入的老闆身分呼叫，所以 ERPNext 自己的權限與「建立人」紀錄照常。

| 做什麼 | 方法 |
| --- | --- |
| 已存在的名稱／料號、統編 | `frappe.client.get_list`，`[欄位, "in", 這一批]`，每次 100 個 |
| 群組、地區、單位清單 | `frappe.client.get_list`（`is_group = 0`） |
| 預設值 | `frappe.client.get_single_value`：Selling Settings `customer_group`／`territory`／`selling_price_list`、Buying Settings `supplier_group`、Stock Settings `item_group`／`stock_uom` |
| 新增一筆 | `frappe.client.insert`，一列一次 |

不用 `frappe.client.insert_many`：它一次最多 200 筆，而且同一個請求裡一筆失敗整批都退回，沒辦法「跳過壞的、其他照進」。

送進 ERPNext 的文件只會有下面這些欄位（`lib/importer.ts` 的 `toDoc`，瀏覽器多送什麼都不會帶過去）：

- **Customer**：`customer_name`、`customer_type`、`customer_group`、`territory`、`tax_id`、`customer_details`（舊代號、看不出縣市的地址），以及 `email_id`、`mobile_no`、`first_name`（聯絡人）→ ERPNext 的 `Customer.on_update` 建主要聯絡人；`address_line1`、`address_line2`、`city`、`pincode`、`country = Taiwan` → 建主要地址。
- **Supplier**：同上，`supplier_type = Company`、`country = Taiwan`。注意 ERPNext 只在有電話或 Email 時才建供應商聯絡人。
- **Item**：`item_code`、`item_name`、`item_group`、`stock_uom`、`is_stock_item`、`description`、`standard_rate` → ERPNext 的 `Item.after_insert` 會在預設銷售價目表（Selling Settings，沒有就「Standard Selling」）建一筆 Item Price。單位「個、PCS、EA、支、件」轉成 `Nos`（跟導入工具一樣）。

每一批在伺服器端重新跑一次同樣的檢查，也重新比對是否已存在，所以網路斷掉後重送不會重複建立。登入過期、沒有權限、連不上 ERPNext 時，這一批後面的列不再送，畫面會說原因。

一批 20 列：一次請求大約 1（身分）＋ 3～5（清單與預設值）＋ 1（已存在）＋ 20（新增）個對 ERPNext 的請求，在 Cloudflare Workers 免費方案每次 50 個子請求的上限內。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `web/lib/importer.ts` | 純邏輯：解碼、CSV／貼上解析、自動對欄位、檢查、`toDoc`、CSV 輸出（`= + - @` 開頭的格子加 `'`，Excel 不會當公式） |
| `web/lib/xlsx.ts` | 讀 `.xlsx` 第一個工作表，不用套件：zip 目錄＋瀏覽器內建 `DecompressionStream("deflate-raw")`＋簡單 XML 比對。限制 10 MB、單一檔案解開 40 MB |
| `web/lib/import-server.ts` | 伺服器端：身分、大小限制、清單與預設值、已存在比對 |
| `web/app/api/import/check`、`run` | 兩支 API |
| `web/components/ImportWizard.tsx`、`web/app/workspace/settings/import/page.tsx` | 畫面 |
| `web/scripts/importer.test.mjs` | `cd web && node --experimental-strip-types --test scripts/importer.test.mjs` |

## 還沒做的

- 期初庫存、期初應收應付、未結訂單：還是請導入顧問用導入工具（`dropout-onboard import`／`opening-balances`）。
- 「更新既有資料」：同名一律跳過，不會改舊資料。要改請在 ERPNext 用 Data Import 的「Update Existing Records」。
- 示範模式的供應商不會出現在其他頁面（示範的進貨頁沒有廠商清單），只列在精靈的結果裡。
- 一次 2,000 列；更大的檔案請分批或用導入工具。
- `.xlsx` 只讀第一個工作表、讀的是存檔時的值（公式不重算）；日期會變成 Excel 的序號（目前的種類都沒有日期欄）。
- 群組、地區不會自動新增；ERPNext 沒有的會改用預設值，匯入後再調整。
