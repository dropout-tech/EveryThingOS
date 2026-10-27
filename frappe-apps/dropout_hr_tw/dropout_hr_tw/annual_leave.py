"""特別休假自動給假與未休折算（勞動基準法第38條、施行細則第24條之1，到職日週年制）。

每天跑一次：
1. allocate_due：員工進入新的特休年度那天，建一張「特休」Leave Allocation 並送出。
   同一段期間已經有特休分配（人資手動建的也算）就跳過，不覆蓋。
2. settle_due：特休假別分配到期（迄日早於今天）且沒有結轉到下一年度時，把剩餘未休日數
   按「最近一個月正常工作時間工資 ÷ 30 × 未休日數」寫成「特休未休折算」額外薪資並送出。

公司若約定曆年制或會計年度制，或自行處理遞延折算，在 Taiwan Payroll Settings 關掉對應開關。
"""

from decimal import Decimal

import frappe
from frappe.utils import cint, flt, getdate, nowdate

from dropout_hr_tw import labor_rules
from dropout_hr_tw.payroll import monthly_wage

LEAVE_TYPE = "特休"
UNUSED_COMPONENT = "特休未休折算"
SETTINGS = "Taiwan Payroll Settings"


def _enabled():
	return cint(frappe.db.get_single_value(SETTINGS, "auto_annual_leave"))


def _settle_enabled():
	return cint(frappe.db.get_single_value(SETTINGS, "auto_settle_unused_leave"))


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


def unused_days(allocation) -> Decimal:
	"""Allocated 特休 days minus approved Leave Applications inside the allocation window."""
	allocated = Decimal(str(flt(allocation.total_leaves_allocated or allocation.new_leaves_allocated)))
	taken = frappe.db.sql(
		"""select coalesce(sum(total_leave_days), 0) from `tabLeave Application`
		   where employee = %s and leave_type = %s and docstatus = 1 and status = 'Approved'
		     and from_date >= %s and to_date <= %s""",
		(allocation.employee, LEAVE_TYPE, allocation.from_date, allocation.to_date),
	)[0][0]
	return max(Decimal(0), allocated - Decimal(str(flt(taken))))


def _carried_forward_after(employee, end_date) -> bool:
	return bool(
		frappe.db.exists(
			"Leave Allocation",
			{
				"employee": employee,
				"leave_type": LEAVE_TYPE,
				"docstatus": 1,
				"from_date": (">", end_date),
				"carry_forward": 1,
				"unused_leaves": (">", 0),
			},
		)
	)


def settle_allocation(allocation_name, pay_date=None):
	"""Settles one expired 特休 Leave Allocation into an Additional Salary, once."""
	if not frappe.db.exists("Salary Component", UNUSED_COMPONENT):
		return None
	if frappe.db.exists("Additional Salary", {"tw_leave_allocation": allocation_name, "docstatus": ("<", 2)}):
		return None
	alloc = frappe.get_doc("Leave Allocation", allocation_name)
	if alloc.docstatus != 1 or alloc.leave_type != LEAVE_TYPE:
		return None
	if _carried_forward_after(alloc.employee, alloc.to_date):
		return None
	left = unused_days(alloc)
	if left <= 0:
		return None
	wage = monthly_wage(alloc.employee, alloc.to_date)
	if not wage:
		return None
	amount = labor_rules.unused_annual_leave_wage(wage, left)
	if amount <= 0:
		return None
	doc = frappe.get_doc({
		"doctype": "Additional Salary",
		"employee": alloc.employee,
		"company": alloc.company or frappe.db.get_value("Employee", alloc.employee, "company"),
		"salary_component": UNUSED_COMPONENT,
		"amount": amount,
		"payroll_date": getdate(pay_date or alloc.to_date),
		"overwrite_salary_structure_amount": 0,
		"tw_leave_allocation": alloc.name,
		"tw_ot_note": f"特休 {alloc.from_date} 至 {alloc.to_date} 未休 {left} 日，月薪 NT${int(wage):,} ÷ 30 × {left} 日（勞動基準法第38條第4項、施行細則第24條之1）。",
	})
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.name


def settle_due(on_date=None):
	"""Daily scheduler entry for expired 特休 allocations."""
	if not _settle_enabled() or not frappe.db.exists("Salary Component", UNUSED_COMPONENT):
		return []
	day = getdate(on_date or nowdate())
	settled = []
	rows = frappe.get_all(
		"Leave Allocation",
		filters={"leave_type": LEAVE_TYPE, "docstatus": 1, "to_date": ("<", day)},
		fields=["name"],
	)
	for row in rows:
		try:
			name = settle_allocation(row.name, pay_date=day)
			if name:
				settled.append(name)
				frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"特休未休折算失敗：{row.name}")
	return settled
