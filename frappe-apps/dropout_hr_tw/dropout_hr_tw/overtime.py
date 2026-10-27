"""記加班：人資輸入核准的時數與種類，系統依勞基法倍數算出加發金額，寫成「加班費」額外薪資。

不讀打卡推算時數（休息、輪班、外勤的判斷要人做）。超過一日 12 小時或每月上限的時數會被擋下，
所以記進去的金額都在財政部免稅時數內（台財稅第 16713 號函），「加班費」薪資項目維持免稅。
"""

from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate

from dropout_hr_tw import labor_rules
from dropout_hr_tw.payroll import monthly_wage

COMPONENT = "加班費"
SETTINGS = "Taiwan Payroll Settings"
ROLES = {"System Manager", "HR Manager", "HR User"}
KINDS = {
	"weekday": "平日延長",
	"rest": "休息日",
	"holiday": "國定假日或特休日出勤",
	"disaster": "天災、事變或突發事件（平日）",
	"rest_disaster": "天災、事變或突發事件（休息日）",
	"regular_off": "例假（僅限天災等）",
}


def month_cap_hours(employee, day):
	"""Hours already recorded this month that count toward the 第32條 monthly limit."""
	total = frappe.db.sql(
		"""select coalesce(sum(tw_ot_cap_hours), 0) from `tabAdditional Salary`
		   where employee = %s and salary_component = %s and docstatus = 1
		     and payroll_date between %s and %s""",
		(employee, COMPONENT, get_first_day(day), get_last_day(day)),
	)[0][0]
	return Decimal(str(flt(total)))


@frappe.whitelist(methods=["POST"])
def record(employee, work_date, hours, kind, reason=None):
	if not ROLES & set(frappe.get_roles()):
		raise frappe.PermissionError(_("只有人資或老闆可以記加班"))
	if kind not in KINDS:
		frappe.throw(_("不知道的加班種類"))
	if not isinstance(employee, str) or not frappe.db.exists("Employee", {"name": employee, "status": "Active"}):
		frappe.throw(_("找不到這位在職員工"))
	hrs = flt(hours)
	if hrs <= 0 or hrs > 24:
		frappe.throw(_("時數要大於 0、不超過 24"))
	day = getdate(work_date)
	if not frappe.db.exists("Salary Component", COMPONENT):
		frappe.throw(_("還沒有「加班費」薪資項目，請重跑人資設定"))
	wage = monthly_wage(employee, day)
	if not wage:
		frappe.throw(_("這位員工在 {0} 還沒有薪資結構指派，算不出時薪").format(day))

	result = labor_rules.overtime_pay(labor_rules.hourly_from_monthly(wage), Decimal(str(hrs)), kind)
	so_far = month_cap_hours(employee, day)
	consented = bool(cint(frappe.db.get_single_value(SETTINGS, "overtime_consent")))
	refusal = labor_rules.overtime_refusal(result, so_far, consented=consented)
	if refusal:
		frappe.throw(_(refusal))
	if not result["extra"]:
		frappe.throw(_("這筆沒有加發金額"))

	note = "；".join(f"{b['hours']} 小時 × {b['multiplier']}" for b in result["bands"])
	doc = frappe.get_doc({
		"doctype": "Additional Salary",
		"employee": employee,
		"company": frappe.db.get_value("Employee", employee, "company"),
		"salary_component": COMPONENT,
		"amount": result["extra"],
		"payroll_date": day,
		"overwrite_salary_structure_amount": 0,
		"tw_ot_kind": KINDS[kind],
		"tw_ot_hours": hrs,
		"tw_ot_cap_hours": flt(result["hours_in_monthly_cap"]),
		"tw_ot_note": f"{note}。{result['cite']}" + (f" 事由：{str(reason)[:200]}" if reason else ""),
	})
	doc.insert()
	doc.submit()
	month_total = so_far + Decimal(result["hours_in_monthly_cap"])
	return {
		"ok": True,
		"name": doc.name,
		"amount": result["extra"],
		"bands": result["bands"],
		"month_hours": str(month_total),
		"limit": labor_rules.EXTENSION_HOURS_PER_MONTH_WITH_CONSENT if consented else labor_rules.EXTENSION_HOURS_PER_MONTH,
		"message": _("{0} 加班 {1} 小時，加發 NT${2:,}，會進 {3} 的薪資單。這個月計入上限 {4} 小時。").format(KINDS[kind], hrs, result["extra"], str(day)[:7], month_total),
	}
