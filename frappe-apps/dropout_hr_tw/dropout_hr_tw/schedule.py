"""師資排班（對應 Frappe HRMS Shift Assignment）：
檢查同一位老師衝堂、同一間教室衝突，以及老師當日是否已請假。
"""

import frappe
from frappe import _
from frappe.utils import add_days, getdate

from dropout_hr_tw import labor_rules

ROLES = {"System Manager", "HR Manager", "HR User"}


def _desk(doctype, name):
	return f"/app/{frappe.scrub(doctype).replace('_', '-')}/{name}"


def _hhmm(value, fallback=""):
	if not value:
		return fallback
	text = str(value).strip()
	parts = text.split(":")
	if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
		return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
	return text[:5]


def _ensure_shift_type(start_time, end_time):
	name = f"排課 {start_time}-{end_time}"
	if not frappe.db.exists("Shift Type", name):
		frappe.get_doc(
			{
				"doctype": "Shift Type",
				"__newname": name,
				"start_time": f"{start_time}:00",
				"end_time": f"{end_time}:00",
			}
		).insert(ignore_permissions=True)
	return name


def list_shifts(company, from_date, to_date):
	if not frappe.db.exists("DocType", "Shift Assignment"):
		return []
	rows = frappe.get_all(
		"Shift Assignment",
		filters={
			"company": company,
			"docstatus": 1,
			"status": "Active",
			"start_date": ("between", [from_date, to_date]),
		},
		fields=[
			"name",
			"employee",
			"employee_name",
			"shift_type",
			"start_date",
			"tw_course_name",
			"tw_room",
			"tw_start_time",
			"tw_end_time",
		],
		order_by="start_date asc, tw_start_time asc, name asc",
		limit=100,
	)
	out = []
	for r in rows:
		start_t = _hhmm(r.get("tw_start_time"))
		end_t = _hhmm(r.get("tw_end_time"))
		if (not start_t or not end_t) and r.get("shift_type"):
			st = frappe.db.get_value("Shift Type", r.shift_type, ["start_time", "end_time"], as_dict=True)
			if st:
				start_t = start_t or _hhmm(st.start_time, "09:00")
				end_t = end_t or _hhmm(st.end_time, "12:00")
		out.append(
			{
				"id": r.name,
				"employee": r.employee,
				"employee_name": r.employee_name or r.employee,
				"date": str(r.start_date),
				"start_time": start_t or "09:00",
				"end_time": end_t or "12:00",
				"course_name": r.get("tw_course_name") or r.get("shift_type") or "課程排班",
				"room": r.get("tw_room") or "",
				"href": _desk("Shift Assignment", r.name),
			}
		)
	return out


def upcoming_shifts(company, day, days=14):
	start = getdate(day)
	end = add_days(start, days)
	return list_shifts(company, start, end)


@frappe.whitelist(methods=["POST"])
def assign(
	employee,
	date,
	start_time,
	end_time,
	course_name,
	room=None,
	branch=None,
	ai_suggested_employee=None,
	ai_reason=None,
	adjustment_note=None,
):
	if not ROLES & set(frappe.get_roles()):
		raise frappe.PermissionError(_("只有人資或老闆可以排班"))
	emp = frappe.db.get_value(
		"Employee",
		{"name": employee, "status": "Active"},
		["name", "employee_name", "company"],
		as_dict=True,
	)
	if not emp:
		frappe.throw(_("找不到這位在職老師／員工"))
	day = getdate(date)
	start_t = _hhmm(start_time)
	end_t = _hhmm(end_time)
	course = str(course_name or "").strip()[:80]
	if not course:
		frappe.throw(_("要填課程或班級名稱"))
	room_clean = str(room or "").strip()[:40]
	branch_clean = str(branch or "").strip()[:40]
	try:
		s_min = labor_rules.minutes_of_day(start_t)
		e_min = labor_rules.minutes_of_day(end_t)
	except ValueError as e:
		frappe.throw(_(str(e)))
	if e_min <= s_min:
		frappe.throw(_("下課時間要晚於上課時間"))

	existing = list_shifts(emp.company, day, day)
	leaves = frappe.get_all(
		"Leave Application",
		filters={
			"employee": emp.name,
			"docstatus": ("<", 2),
			"status": ("in", ["Open", "Approved"]),
			"from_date": ("<=", day),
			"to_date": (">=", day),
		},
		fields=["employee", "employee_name", "leave_type", "from_date", "to_date"],
	)
	conflict = labor_rules.schedule_conflict(
		{
			"employee": emp.name,
			"employee_name": emp.employee_name,
			"date": str(day),
			"start_time": start_t,
			"end_time": end_t,
			"course_name": course,
			"room": room_clean,
		},
		existing,
		leaves,
	)
	if conflict:
		frappe.throw(_(conflict))

	shift_type = _ensure_shift_type(start_t, end_t)
	ai_emp = str(ai_suggested_employee or "").strip()[:140]
	decision = ("adopted" if ai_emp == emp.name else "modified") if ai_emp else ""
	doc = frappe.get_doc(
		{
			"doctype": "Shift Assignment",
			"employee": emp.name,
			"company": emp.company,
			"shift_type": shift_type,
			"start_date": day,
			"end_date": day,
			"status": "Active",
			"tw_course_name": course,
			"tw_branch": branch_clean,
			"tw_room": room_clean,
			"tw_start_time": start_t,
			"tw_end_time": end_t,
			"tw_ai_suggested_employee": ai_emp,
			"tw_ai_reason": str(ai_reason or "").strip()[:500],
			"tw_audit_decision": decision,
			"tw_adjustment_note": str(adjustment_note or "").strip()[:500],
		}
	)
	doc.insert()
	doc.submit()
	return {
		"ok": True,
		"name": doc.name,
		"href": _desk("Shift Assignment", doc.name),
		"message": _("已排班：{0} {1} {2}–{3}「{4}」{5}").format(
			emp.employee_name,
			day,
			start_t,
			end_t,
			course,
			f"（{room_clean}）" if room_clean else "",
		),
	}
