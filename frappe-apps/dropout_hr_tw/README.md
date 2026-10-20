# DropOut HR TW

台灣人事薪資設定，裝在 Frappe HRMS（version-15）上。不改 HRMS 原始碼，差異都在這個 app。

- 薪資元件：本薪、伙食津貼（免稅額度）、加班費、獎金、勞保自付額、健保自付額、勞退自提、二代健保補充保費、所得稅扣繳（`setup/salary_components.json`）
- 月中到職、離職：勞保、勞退、職災按 30 日計到離職日；健保投保當月收整月、退保當月不收（離職日是月底仍收）
- 雇主負擔：薪資單顯示勞保、健保、勞退、職災。費用與應付科目成對填了才在送出時開傳票
- 假別：特休、病假、事假、婚假（115 年 10 月 1 日起 14 日）、喪假、產假、產檢假、陪產假、生理假、家庭照顧假、公假、公傷病假（`setup/leave_types.json`）
- 條文裡的天數與加班倍數：`labor_rules.py`（特休年資、加班加給、免稅時數、喪假、產假）。每年公告的費率不在這裡。投保單位補充保費在 `payroll_calc.employer_supplement`，費率空白就是 0
- `Taiwan Payroll Settings`：當年度費率與投保薪資分級表，公式只讀這裡的數字
- 每家公司一份草稿薪資結構「台灣月薪範本 - 公司縮寫」，人資檢查後送出、指派
- 職務「人資」；第一次安裝時替「老闆」補上 HR 角色、替「主管」補上請假核准
- 殼的人事頁 API：`dropout_hr_tw.shell.today`、`check_in`、`decide_leave`

全部是「沒有才建」：公司改過的假別、薪資元件、職務、費率，重跑 `bench migrate` 不會被蓋掉。已送出的「台灣月薪範本」會補上後來新增的薪資元件；扣繳公式只有在仍是我們上一版的文字時才會改成含獎金。公司自己另存的薪資結構不會被改。

費率每年都要核對，清單與說明在 `docs/HR.md`。

- 裝：`bench --site <site> install-app dropout_hr_tw`（會先要求 hrms）
- 測試：`bench --site <site> run-tests --app dropout_hr_tw`
