# 導入工具 `dropout-onboard`

幫一家新公司開站、把舊系統的資料搬進 ERPNext，並在匯入前先檢查。每一步都交給上游已有的功能（`bench`、ERPNext Data Import、Opening Invoice Creation Tool、Stock Reconciliation、Chatwoot Platform API、Vexa admin API），這個工具只負責順序、欄位對照與檢查。

只需要 Python 3.10 以上，沒有其他依賴；要讀 Excel 再裝 `openpyxl`。

```bash
pip install -e toolkit            # 或 pip install -e 'toolkit[excel]'
dropout-onboard --help
```

## 一行開站加搬家：`bootstrap`

一個資料夾放 `bootstrap.json`（ShopProfile 加公司名稱）與舊系統匯出檔，一次跑完：開站 → 客人／供應商／商品 → 期初庫存 → 期初應收應付。

```bash
# 預演：列出每一步與檢查結果
dropout-onboard bootstrap examples/make --site demo-make.local --admin-email boss@example.tw
# 真的做；provision 的服務網址參數（--glue-url、--chatwoot-url、--vexa-url…）都可以加
dropout-onboard bootstrap examples/make --site demo-make.local --admin-email boss@example.tw \
  --bench-dir ~/frappe-bench --apply
```

- 檔名決定種類：`customers.csv`、`suppliers.csv`、`items.csv`、`opening_stock.csv`、`opening_receivables.csv`、`opening_payables.csv`；沒有的就跳過。
- 公司代碼、客戶群組、地區、倉庫、計量單位、開帳日從站台本身的設定讀（`dropout_core.provisioning.import_defaults`），不用手填英文名稱。預演時站台還不存在，用占位值檢查。
- 進度依檔案內容記在狀態檔，同一份檔案再跑一次會略過；改了檔案才會重匯。
- 三家示範公司：`examples/make`（琢奧精密製造）、`examples/service`（琢奧管理顧問）、`examples/edu`（琢奧學院）。

## 一次很多家：`fleet`

```bash
dropout-onboard fleet bootstrap examples/fleet.csv --shell-url-template "https://{slug}.os.dropout.tw"          # 預演
dropout-onboard fleet bootstrap examples/fleet.csv --bench-dir ~/frappe-bench --glue-url https://glue.dropout.tw \
  --shell-url-template "https://{slug}.os.dropout.tw" --concurrency 2 --apply
dropout-onboard fleet list   --glue-url https://glue.dropout.tw
dropout-onboard fleet renew  demo-make.local --years 1 --reference INV-2026-001 --glue-url https://glue.dropout.tw
dropout-onboard fleet suspend|resume|cancel demo-make.local --reason 未付款 --glue-url https://glue.dropout.tw
```

- CSV 一列一家：`folder`、`site`、`admin_email` 必填；`company`、`abbr`、`shell_url`、`renews_on`、`trial_days`、`calendar` 選填。先檢查整份 CSV，有錯一家都不開。
- 每家在自己的程序裡跑 `bootstrap`，紀錄在 `<state_dir>/fleet-logs/<site>.log`（權限 600）。`GLUE_ADMIN_TOKEN`、`CHATWOOT_PLATFORM_TOKEN`、`VEXA_ADMIN_TOKEN` 只經環境變數傳，不會出現在 `ps` 或紀錄裡。
- 第一次登記到膠水時寫進合約：`--trial-days`（預設 30）或 `--renews-on`（已簽約的到期日）。之後重跑不會改合約，續約用 `fleet renew` 或營運後台。
- `--backup-bucket`、`--backup-endpoint` 加上環境變數 `BACKUP_ACCESS_KEY_ID`、`BACKUP_SECRET_ACCESS_KEY`，開站時順便設定每日備份。

容量、費用、合約階段見 [docs/SAAS-OPERATIONS.md](../docs/SAAS-OPERATIONS.md)。

## 還原演練：`backup verify`

```bash
dropout-onboard backup verify demo-make.local --bench-dir ~/frappe-bench                     # 預演：列出會用哪個備份、每一步
DB_ROOT_PASSWORD=... dropout-onboard backup verify demo-make.local --bench-dir ~/frappe-bench --apply
dropout-onboard backup verify demo-make.local --backup ~/r2/20261011_020000-demo-make_local-database.sql.gz --with-files --apply
```

- 把 `sites/<site>/private/backups` 裡最新的備份（或 `--backup` 指定的檔）還原到暫存站 `restore-drill.<site>`，排程暫停、不寄信；正式站不動。
- 比對正式站與暫存站的單據筆數和資料檢查（`dropout_core.checks.summary`），然後刪掉暫存站；中途失敗也會刪。
- 沒通過的情況：備份超過 24 小時、還原失敗、有單據還原後變 0 筆或整種不見。備份之後新增或刪除的筆數只列為提醒。
- 報告寫在 `<state_dir>/restore-drills/<site>-<時間>.json`（權限 600），記下備份時間、還原花幾分鐘、每種單據筆數；資料庫密碼不會寫進報告。

目標與每月演練排程見 [docs/RELIABILITY.md](../docs/RELIABILITY.md)。

## 流程

下面是 `bootstrap` 拆開的每一步，需要個別控制時用。

1. **在殼裡選現場**：老闆在 DropOut OS 的開始設定選行業、規模、要用的功能，下載 ShopProfile JSON（範例：`examples/profile-service.json`）。
2. **看方案**：`dropout-onboard plan profile.json` 列出要裝的 app 與搬家順序。官網有勾就加 Payments、Webshop、台灣金流；行業決定產業包。
3. **開站**：先預演，看清楚每一步再加 `--apply`。

   ```bash
   dropout-onboard provision profile.json --site acme.erp.dropout.tw --company 安安顧問 \
     --admin-email boss@acme.tw --erpnext-url https://acme.erp.dropout.tw \
     --glue-url https://glue.dropout.tw --glue-admin-token "$GLUE_ADMIN_TOKEN" \
     --chatwoot-url https://chat.dropout.tw --chatwoot-platform-token "$CHATWOOT_PLATFORM_TOKEN" \
     --vexa-url https://meet.dropout.tw --vexa-admin-token "$VEXA_ADMIN_TOKEN" \
     --calendar https://calendar.google.com/calendar/ical/.../basic.ics
   ```

   步驟：建站 → 裝 app → 設定精靈（台灣、新台幣、Asia/Taipei）→ 同步帳號（glue 使用者與 API key）→ 登記到膠水（ERPNext Webhook 指向膠水；有 `--shell-url` 時一併登記網址與合約）→ 對話帳號（Chatwoot 帳戶、管理員、Webhook）→ 會議機器人（Vexa 使用者、Webhook、行事曆）。沒給的服務網址就跳過那一步。

   每一步做完記在 `~/.dropout-onboard/<site>.json`（權限 600，內含 API 金鑰，別放進 git）。中途失敗就修好再跑一次，做過的步驟會略過。

4. **搬資料**：依序做客人／供應商 → 商品 → 期初庫存 → 期初應收應付。

   ```bash
   dropout-onboard mappings                                   # 有哪些舊系統對照表
   dropout-onboard convert --source a1 --kind customers 客戶.csv customers.csv \
     --default customer_group=Commercial --default territory=Taiwan
   dropout-onboard import --site acme.erp.dropout.tw --kind customers customers.csv

   dropout-onboard convert --source a1 --kind items 商品.csv items.csv --default item_group=Products
   dropout-onboard import --site acme.erp.dropout.tw --kind items items.csv

   dropout-onboard convert --source a1 --kind opening_stock 庫存.csv stock.csv \
     --default company=安安顧問 --default posting_date=2026-12-31 --default "warehouse=Stores - AA"
   dropout-onboard check --kind opening_stock stock.csv --items items.csv
   dropout-onboard import --site acme.erp.dropout.tw --kind opening_stock stock.csv

   dropout-onboard opening-balances --site acme.erp.dropout.tw --company 安安顧問 應收.csv
   dropout-onboard opening-balances --site acme.erp.dropout.tw --company 安安顧問 --type Purchase 應付.csv
   ```

   `import` 與 `opening-balances` 要在 bench 所在的機器上跑（`--bench-dir`，預設 `/home/frappe/frappe-bench`）。

5. **驗收**：在 ERPNext 打開「DropOut Import Check」報表，再看 DropOut OS 的「今天」導入進度；每一項都由實際資料判斷，不能手動打勾。

## 欄位對照

`dropout_onboard/mappings/<舊系統>/<種類>.json`。內建 `a1`（凌越）、`ecount`、`excel`（我們的範本，見 `templates/`）。

```json
{
 "doctype": "Customer",
 "fields": {
  "customer_name": {"from": ["客戶全名", "客戶簡稱"], "required": true},
  "tax_id": {"from": ["統一編號"], "transform": "tax_id"},
  "customer_type": {"from": ["類型"], "map": {"公司": "Company", "個人": "Individual"}, "default": "Company"},
  "customer_group": {"from": ["客戶類別"], "default": "{customer_group}"}
 }
}
```

- `from`：舊系統可能出現的表頭，依序取第一個有值的。舊系統換版本、表頭不同時，只要加進這個陣列，不用改程式。
- `transform`：`tax_id`、`email`、`phone`（轉成 +886）、`number`（去千分位與「元」）、`check`（是／Y／✓ → 1）、`date`（民國年也可以）。
- `default`：舊檔沒有這個值時用；`{名稱}` 由 `--default 名稱=值` 帶入。
- 有子表的種類（期初庫存）另有 `parent` 與 `child_table`，輸出成 Data Import 的父子格式。

新增一個舊系統：複製 `mappings/excel/` 成新資料夾，改 `from` 即可。內建的 A1、Ecount 表頭是依常見匯出檔整理的，第一次導入時請拿實際匯出檔核對。

舊檔可以是 UTF-8、Big5（cp950）、UTF-16 的 CSV，或 XLSX。

## 檢查

`convert` 會順便檢查，`import` 前也會再檢查一次，有錯誤就不匯入：

- 必填欄位空白、名稱或料號重複
- 統一編號檢查碼錯誤；統編重複只提醒（可能是同一家）
- Email 格式、售價不是數字或是負的、沒有售價（提醒）
- 期初庫存數量不是數字或是負的、同一倉庫重複、料號不在商品檔裡

匯入後 ERPNext 的「DropOut Import Check」報表會用同一套規則檢查實際資料。

## 為什麼這樣做

- **客人、供應商、商品** 走 ERPNext 的 Data Import 文件，跟後台按「匯入」同一條路，失敗的列可以在後台逐筆看原因再重匯。不用 `bench data-import`：它在主控台模式會把舊紀錄誤認成已匯入而跳過資料列。
- **期初庫存** 由 `dropout_core.provisioning.opening_stock` 建立用途為 Opening Stock 的 Stock Reconciliation，差異科目用公司的「暫時開帳」科目，與表單預設相同。ERPNext 在 Stock Reconciliation 關閉了 Data Import，所以不走那條路。同一個檔案再跑一次會略過。
- **期初應收應付** 走 Opening Invoice Creation Tool。
- **產業包** 會等設定精靈跑完才套用，所以開站順序錯了也不會壞。

## 開發

```bash
cd toolkit && python3 -m unittest discover -s tests
```

`dropout_onboard/taiwan.py` 是指向 `frappe-apps/dropout_core/dropout_core/taiwan.py` 的連結，統編與電話規則只有一份。
