# 免費導入：顧問手冊

這份是 DropOut 顧問到一家新公司做免費導入時照著走的腳本：開會要問什麼、要跟老闆拿哪些資料、導入工具怎麼下、上線前檢查什麼、上線後 30／60／90 天回訪看什麼。工具細節在 [toolkit/README.md](../toolkit/README.md)，搬家順序與驗收關卡在 [ONBOARDING-TOOLKIT.md](ONBOARDING-TOOLKIT.md)，健康度算法在 [BILLING.md](BILLING.md#健康度)。

客戶自己看的說明在殼的 `/help`（不用登入），內容來自 `web/lib/help.ts`。現場講解時直接開那幾頁給老闆看，不要另外做簡報。

## 0. 出發前

- 營運後台 `/platform` 看這家公司是否已登記、試用天數、聯絡人 Email。
- 請老闆先在殼的開始設定選行業、規模、要用的功能，下載 ShopProfile JSON 寄給你（範例 `toolkit/examples/profile-service.json`）。沒選也沒關係，開會時一起選。
- 自己先在示範模式走一次「練習第一筆生意」（`/workspace/practice`），等一下要帶老闆做。

## 1. 開場會議（約 90 分鐘，老闆＋會用的主管）

### 要問的問題

照順序問，答案直接填進 ShopProfile 或記在導入筆記。

| 問題 | 為什麼要問 | 影響什麼 |
| --- | --- | --- |
| 賣什麼？貨還是服務？怎麼交給客人？ | 決定產業包與要不要倉庫 | `scene`、進銷存要不要開 |
| 公司幾個人？各自做什麼？ | 對到九種職務（老闆、主管、業務、倉管、採購、會計、客服、行銷、人資） | 邀請名單與職務，見 `/help/roles` |
| 現在用什麼記帳、開單？（A1、ECOUNT、Excel、紙本） | 決定用哪份欄位對照表 | `dropout-onboard convert --source a1／ecount／excel` |
| 客人從哪裡來？LINE 官方帳號、IG、FB、官網、電話？ | 要接哪些對話通道 | provision 的 `--chatwoot-url` |
| 有沒有官網？要不要網路下單、線上付款？ | 官網模組與 Webshop、台灣金流 | ShopProfile `website` |
| 電子發票現在怎麼開？加值中心是哪家？ | 電子發票要先接好加值中心 | 開站清單的「電子發票」 |
| 有沒有在寄電子報？名單有沒有同意紀錄？ | 沒有同意紀錄的不能匯入，要寄確認信重新取得 | 電子報名單 |
| 要不要打卡、請假、薪資？ | 人事模組（2 人以上預設勾） | `hrms`、`dropout_hr_tw`，見 [HR.md](HR.md) |
| 要從哪一天開帳？ | 期初庫存、期初應收應付的日期 | `--default posting_date=` |
| 誰是公司裡的「老闆」帳號？ | 只有老闆能管團隊、看開站清單、設 API | `--admin-email` |

### 現場一起做

1. 老闆用示範模式打開 `/workspace`，看「今天」最上面的第一天卡片（你每天會用到的三件事）。
2. 帶他按「先練習一筆生意」，在練習帳本走完報價 → 客人答應 → 出貨／履行 → 請他付錢 → 收款。每一步旁邊有「真的時候：」說明 ERPNext 會開哪張單。
3. 打開 `/help/checklist` 說明開站清單：上線後每一項都由實際資料打勾，沒有手動勾選。

## 2. 要跟老闆拿的資料

範本在 `toolkit/templates/`，欄位說明在 `/help/import-data`。從舊系統直接匯出也可以，`convert` 會對照表頭。

| 檔名（bootstrap 資料夾內） | 內容 | 範本欄位 |
| --- | --- | --- |
| `customers.csv` | 客人 | 客人名稱、類型、統一編號、Email、手機、群組、舊代號 |
| `suppliers.csv` | 供應商 | 供應商名稱、統一編號、舊代號 |
| `items.csv` | 商品與售價 | 料號、品名、群組、單位、售價、規格 |
| `opening_stock.csv` | 開帳日庫存 | 料號、倉庫、數量、單位成本 |
| `opening_receivables.csv` | 開帳日還沒收的錢 | 客人、未收金額、日期、到期日 |
| `opening_payables.csv` | 開帳日還沒付的錢 | 供應商、未付金額、日期、到期日 |

另外要拿：公司全名、統一編號、地址（設定精靈與發票用）；同事名單（姓名、Email、職務）；LINE 官方帳號與 Meta 粉專的管理員權限；加值中心帳號；有同意紀錄的電子報名單；要接會議機器人的公司行事曆 ICS 網址。

舊檔可以是 UTF-8、Big5、UTF-16 的 CSV 或 XLSX。統編檢查碼錯、料號重複、售價是負的都會在匯入前擋下來，先請老闆修好再匯。

## 3. 開站與搬家

每個指令都先預演（不加 `--apply`），看完每一步再真的做。中途失敗修好再跑，做過的步驟會略過。狀態檔在 `~/.dropout-onboard/<site>.json`，內含 API 金鑰，不要放進 git。

```bash
pip install -e toolkit

# 一次做完：開站 → 客人／供應商／商品 → 期初庫存 → 期初應收應付
dropout-onboard bootstrap ./acme --site acme.erp.dropout.tw --admin-email boss@acme.tw
dropout-onboard bootstrap ./acme --site acme.erp.dropout.tw --admin-email boss@acme.tw \
  --bench-dir ~/frappe-bench --glue-url https://glue.dropout.tw \
  --chatwoot-url https://chat.dropout.tw --vexa-url https://meet.dropout.tw --apply
```

要個別控制時拆開跑（完整參數見 toolkit README「流程」）：

```bash
dropout-onboard plan profile.json
dropout-onboard provision profile.json --site acme.erp.dropout.tw --company 安安顧問 --admin-email boss@acme.tw ...
dropout-onboard convert --source a1 --kind customers 客戶.csv customers.csv
dropout-onboard import --site acme.erp.dropout.tw --kind customers customers.csv
dropout-onboard check --kind opening_stock stock.csv --items items.csv
dropout-onboard opening-balances --site acme.erp.dropout.tw --company 安安顧問 應收.csv
```

開站時一併設定每日備份（`--backup-bucket`、`--backup-endpoint` 與環境變數），然後跑一次還原演練：

```bash
dropout-onboard backup verify acme.erp.dropout.tw --bench-dir ~/frappe-bench --apply
```

## 4. 上線前檢查（go-live）

全部打勾才算上線。前五項是老闆在「今天」看到的開站清單（`dropout_core.api.setup_checklist`），可以請老闆自己對著畫面念。

- [ ] **公司資料與統編**：Company 有填統一編號。
- [ ] **邀請同事**：團隊頁除了老闆外至少一位同事，職務對了。請每位同事登入一次，看到自己的第一天卡片。
- [ ] **客人、商品匯入**：ERPNext「DropOut Import Check」報表全綠；期初試算表與舊系統一致。
- [ ] **第一筆報價、第一筆收款**：在真的帳上，跟老闆一起從一個真實詢問走到收款（ONBOARDING-TOOLKIT 的「上線」關卡）。
- [ ] **接上 LINE／對話**：用 LINE 問一句，出現在客人卡片上。
- [ ] 電子報（有開才算）：至少一份電子報草稿；名單只含有同意紀錄的人。
- [ ] 人事（有裝才算）：員工資料建好、當年度勞健保費率已確認。
- [ ] 電子發票：開一張測試發票，加值中心有收到配號。
- [ ] 官網（有開才算）：一筆線上訂單付款成功，發票開出。
- [ ] `dropout-onboard backup verify` 還原演練成功（目標與每月演練見 [RELIABILITY.md](RELIABILITY.md)）。
- [ ] 營運後台這家公司的合約狀態、到期日、聯絡人正確。

清單在「今天」可以先收起來，老闆隨時可以在「設定 → 導入教學」叫回來。上線後清單全部完成就不必再看。

## 5. 上線後回訪

健康度每天 02:00 算一次（0–100，未滿 50 高風險、50–74 要注意、75 以上健康），扣分原因會寫成一句話列在分數旁邊。回訪前先看營運後台的分數和原因，照下面的重點準備。

| 時間 | 目標分數 | 要看的 | 要做的 |
| --- | --- | --- | --- |
| 第 30 天 | 75 以上 | 7 天活躍人數至少三成；最近 7 天內有人用；已經開過銷貨發票 | 到現場或視訊 30 分鐘。看「今天」是不是每天有人清掉；開站清單還沒完成的項目一起做完；問每個職務卡在哪一步，把答案對到 `/help` 的文章，缺的回報產品 |
| 第 60 天 | 維持 75 以上，沒有「單據量下降」扣分 | 近 30 天發票量沒有掉到前 30 天的一半；沒有超過 30 天未付的帳單（試用轉年約時） | 看報表頁（老闆、主管、會計）：營收、帳齡、成交率有沒有出來；教主管用報表開週會；確認對話、電子報有人在用 |
| 第 90 天 | 75 以上 | 續約狀態：試用剩 7 天內、或年約接近到期會扣分 | 跟老闆回顧三個月的數字（報表頁），確認續約與付款方式（`/help/renewal`）；把要加的同事、要開的功能一次做完；約下一次季度回訪 |

分數掉到 50 以下不用等排定的回訪，當週打電話或約到現場（BILLING.md：看到高風險就先處理，不要等到期）。常見原因與處理：

- **7 天沒有人用（−30）**：通常是「今天」沒人看。請老闆把「今天」設成同事每天第一個打開的頁面，手機可以加到主畫面（`/help/mobile`）。
- **不到三成帳號在用（−15）**：邀了但不用的同事，看他的職務是不是對的；職務決定看得到什麼，太多會亂、太少會沒事做。
- **60 天沒開單（−10）**：可能還在用舊系統開單。找出還在舊系統做的那一步，帶他在 DropOut 做一次。
- **只能看或暫停（−30）、寬限中（−20）**：先確認帳單和付款連結（營運後台「寄付款連結」），線下付款請營運標記已付。
- **讀不到用量（−10）**：站台或膠水連線出問題，轉給工程。

## 6. 交接

- 導入筆記（開場會議的答案、特殊流程、還沒做的事）交給負責回訪的同事。營運後台的「紀錄」只記系統事件（登記、續約、暫停…），不能手寫備註。
- 告訴老闆三個地方：「今天」（每天看）、「設定 → 導入教學」（叫回開站清單和第一天卡片）、`/help`（說明中心，不用登入）。
- 告訴老闆資料隨時可以帶走：`/help/export`。
