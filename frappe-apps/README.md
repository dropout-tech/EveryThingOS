# ERPNext apps

DropOut OS 對 ERPNext v15 的所有差異都在這幾個 Frappe app 裡，不改 Frappe／ERPNext 原始碼。升級 ERPNext 時照上游流程 `bench update`，這些 app 跟著 `bench migrate` 重跑設定。

| App | 內容 | 依賴 |
| --- | --- | --- |
| `dropout_core` | 身分、同意、事件、統編驗證、膠水 API、導入檢查與進度、導入工具呼叫的函式 | erpnext |
| `dropout_pay_tw` | 綠界、藍新，接在 Frappe Payments 的 Payment Gateway 上 | erpnext、payments、dropout_core |
| `dropout_pack_make` | 製造業：原料到模具治具的料號群組、經銷與 OEM 客群、打樣流程、詢價到下單 | erpnext、dropout_core |
| `dropout_pack_service` | 顧問業：顧問方案、工作坊、時數、顧問專案範本、初談到簽約 | erpnext、dropout_core |
| `dropout_pack_edu` | 教育服務業：課程、期班、教材、學員與家長客群、開班範本、詢問到續報 | erpnext、dropout_core |
| `dropout_hr_tw` | 人事薪資：台灣薪資元件、勞健保勞退費率與分級表、假別、職務「人資」、殼的人事頁 API（見 `docs/HR.md`） | erpnext、hrms、dropout_core |

## 安裝

`bench get-app` 只能抓整個 repo 的根目錄，所以從這個 repo 安裝時，把 app 資料夾放進 bench 的 `apps/`：

```bash
cd frappe-bench
bench get-app payments --branch version-15   # 用到官網結帳或台灣金流才需要
bench get-app webshop --branch version-15
bench get-app hrms --branch version-15       # 人事薪資（dropout_hr_tw）才需要
git clone https://github.com/dropout-tech/EveryThingOS /tmp/everythingos
for app in dropout_core dropout_pay_tw dropout_pack_make dropout_pack_service dropout_pack_edu dropout_hr_tw; do
  cp -r /tmp/everythingos/frappe-apps/$app apps/
  ./env/bin/pip install -e apps/$app
  grep -qx $app sites/apps.txt || echo $app >> sites/apps.txt
done
bench --site <site> install-app dropout_core
```

正式環境用 `deploy/erpnext/Containerfile`，它在官方 `frappe/erpnext:v15` 映像上做同樣的事。HRMS 依上游 `version-15` 分支，從 `deploy/erpnext/apps.json` 裝；`dropout_core` 不依賴 HRMS，沒選人事的公司不用裝。

新公司一律用導入工具開站（`toolkit/`），它會依現場挑產業包，並照「建站 → 裝 app → 設定精靈 → 同步帳號 → 接膠水」的順序執行。

## 產業包

產業包 app 只放一個 `pack.json`，由 `dropout_core.packs` 轉成 ERPNext 標準紀錄（料號群組、客群、單位、商機階段、潛客來源、專案範本、Email 範本、Webshop 設定、Domain）。全部是「沒有才建」，所以：

- 先裝產業包、後跑設定精靈也可以：精靈跑完時 `setup_wizard_complete` 會補套用。
- 重跑或 `bench migrate` 不會重複建立；移除產業包不會刪資料。
- 新增一種行業：複製一個 pack app、改 `pack.json`，再在 `toolkit/dropout_onboard/plan.py` 的 `PACK_FOR_SCENE` 加一行。要新的紀錄類型時，在 `packs.py` 用 `@handler("名稱")` 加一個函式。

ERPNext v15 內建的 Domain 只有 Manufacturing 與 Retail；`pack.json` 寫了其他 Domain 時會略過，並在回傳值的 `not_in_this_erpnext` 列出。

## 測試

```bash
bench --site <測試站> set-config allow_tests true
bench --site <測試站> run-tests --app dropout_core
bench --site <測試站> run-tests --app dropout_pay_tw
bench --site <測試站> run-tests --app dropout_hr_tw
```
