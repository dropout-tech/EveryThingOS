"""客人還能不能再下這一筆。

額度在 Customer 的 credit_limits（子表 Customer Credit Limit 的 credit_limit，依公司）。
沒有這一列，或額度是 0，表示不限。未冲應收是該公司已送出銷售發票的 outstanding_amount 加總。
next_amount 直接加，不另算稅。
"""

import frappe
from frappe.utils import flt


def _company(company=None):
	return company or frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def can_order(customer, next_amount, company=None):
	company = _company(company)
	limit = flt(
		frappe.db.get_value(
			"Customer Credit Limit",
			{"parent": customer, "parenttype": "Customer", "company": company},
			"credit_limit",
		)
	)
	if not limit:
		return {"ok": True}
	outstanding = flt(
		frappe.db.sql(
			"select sum(outstanding_amount) from `tabSales Invoice` where customer=%s and company=%s and docstatus=1",
			(customer, company),
		)[0][0]
	)
	if outstanding + flt(next_amount) > limit:
		return {"ok": False, "message": "超過信用額度"}
	return {"ok": True}
