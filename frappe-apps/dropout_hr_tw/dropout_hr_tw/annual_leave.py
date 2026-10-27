"""特別休假自動給假（勞動基準法第38條，到職日週年制）。

每天跑一次。員工進入新的特休年度那天，建一張「特休」Leave Allocation 並送出。
同一段期間已經有特休分配（人資手動建的也算）就跳過，不覆蓋。
公司若約定曆年制或會計年度制，在 Taiwan Payroll Settings 關掉「自動給特休」。
"""

import frappe
from frappe.utils import cint, getdate, nowdate

from dropout_hr_tw import labor_rules

LEAVE_TYPE = "特休"
SETTINGS = "Taiwan Payroll Settings"


def _enabled():
	return cint(frappe.db.get_single_value(SETTINGS, "auto_annual_leave"))


def _already_allocated(employee, start, end):
	return frappe.db.exists(
		"Leave Allocation",
		{"employee": employee, "leave_type": LEAVE_TYPE, "docstatus": ("<", 2), "from_date": ("<=", end), "to_date": (">=", start)},
	)


def allocate_for(employee, joining, on_date):
	"""One employee. Returns the new allocation name, or None when nothing was due."""
	period = labor_rules.annual_leave_period(joining, on_date)
	if not period:
		return None
	start, end, days = period
	if not days or _already_allocated(employee, start, end):
		return None
	doc = frappe.get_doc({
		"doctype": "Leave Allocation",
		"employee": employee,
		"leave_type": LEAVE_TYPE,
		"from_date": start,
		"to_date": end,
		"new_leaves_allocated": days,
		"description": f"勞動基準法第38條，到職日 {joining} 起算，{start} 至 {end} 共 {days} 日。日期由勞工排；年度終結未休完要折發工資。",
	})
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.name


def allocate_due(on_date=None):
	"""Scheduler entry. One employee failing does not stop the others; the error goes to Error Log."""
	if not _enabled() or not frappe.db.exists("Leave Type", LEAVE_TYPE):
		return []
	day = getdate(on_date or nowdate())
	created = []
	for emp in frappe.get_all("Employee", filters={"status": "Active", "date_of_joining": ("is", "set")}, fields=["name", "date_of_joining"]):
		try:
			name = allocate_for(emp.name, emp.date_of_joining, day)
			if name:
				created.append(name)
				frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"特休自動給假失敗：{emp.name}")
	return created
