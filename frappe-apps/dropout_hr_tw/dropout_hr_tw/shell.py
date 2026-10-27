"""Read and write API for the shell's 人事 page.

Who may see what follows HRMS roles: HR Manager / HR User see the whole
company, a Leave Approver sees the applications assigned to them, everyone else
only their own check-ins. Sections a person may not see are listed in `denied`."""

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate, now_datetime, nowdate

ADMIN = "System Manager"
HR_ROLES = {ADMIN, "HR Manager", "HR User"}
APPROVER_ROLES = HR_ROLES | {"Leave Approver"}
PAYROLL_ROLES = HR_ROLES | {"Accounts Manager"}
LOG_TYPES = {"IN": "上班", "OUT": "下班"}
DECISIONS = {"approve": "Approved", "reject": "Rejected"}
DUPLICATE_SECONDS = 60
LIMIT = 50


def _desk(doctype, name):
	return f"/app/{frappe.scrub(doctype).replace('_', '-')}/{name}"


def _user():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	return frappe.session.user


def _roles():
	return set(frappe.get_roles())


def _company():
	return frappe.defaults.get_user_default("company") or frappe.defaults.get_global_default("company")


def _employee(user):
	return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name", "company"], as_dict=True)


def _time(value):
	return str(value)[11:16] if value else ""


def _checkins(employee, day):
	return frappe.get_all(
		"Employee Checkin",
		filters={"employee": employee, "time": ("between", [f"{day} 00:00:00", f"{day} 23:59:59"])},
		fields=["log_type", "time"],
		order_by="time asc",
	)


def _me(user, day):
	emp = _employee(user)
	if not emp:
		return {"employee": None, "name": frappe.utils.get_fullname(user), "logs": [], "next": None}
	logs = _checkins(emp.name, day)
	last = logs[-1].log_type if logs else None
	return {
		"employee": emp.name,
		"name": emp.employee_name,
		"logs": [{"type": l.log_type, "time": _time(l.time)} for l in logs],
		"next": "OUT" if last == "IN" else "IN",
	}


def _on_leave(company, day):
	rows = frappe.get_all(
		"Leave Application",
		filters={"company": company, "docstatus": 1, "status": "Approved", "from_date": ("<=", day), "to_date": (">=", day)},
		fields=["name", "employee_name", "leave_type", "from_date", "to_date", "half_day", "half_day_date"],
		order_by="employee_name asc",
		limit=LIMIT,
	)
	return [
		{
			"name": r.employee_name,
			"leave_type": r.leave_type,
			"from_date": str(r.from_date),
			"to_date": str(r.to_date),
			"half_day": bool(cint(r.half_day) and (not r.half_day_date or str(r.half_day_date) == str(day))),
			"href": _desk("Leave Application", r.name),
		}
		for r in rows
	]


def _approvals(user, roles, company, me):
	filters = {"company": company, "docstatus": 0, "status": "Open"}
	if not roles & HR_ROLES:
		filters["leave_approver"] = user
	if me:
		filters["employee"] = ("!=", me)
	rows = frappe.get_all(
		"Leave Application",
		filters=filters,
		fields=["name", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "description", "posting_date"],
		order_by="from_date asc",
		limit=LIMIT,
	)
	return [
		{
			"name": r.name,
			"employee": r.employee_name,
			"leave_type": r.leave_type,
			"from_date": str(r.from_date),
			"to_date": str(r.to_date),
			"days": flt(r.total_leave_days),
			"reason": (frappe.utils.strip_html(r.description or ""))[:200],
			"href": _desk("Leave Application", r.name),
		}
		for r in rows
	]


def _payroll(company, day):
	start, end = get_first_day(day), get_last_day(day)
	entries = []
	if frappe.has_permission("Payroll Entry", "read"):
		entries = frappe.get_list(
			"Payroll Entry",
			filters={"company": company, "docstatus": ("<", 2), "start_date": ("<=", end), "end_date": (">=", start)},
			fields=["name", "status"],
			order_by="creation desc",
			limit=5,
		)
	slips = frappe.get_list(
		"Salary Slip",
		filters={"company": company, "docstatus": ("<", 2), "start_date": ("<=", end), "end_date": (">=", start)},
		fields=["docstatus", "count(name) as count", "sum(net_pay) as net_pay"],
		group_by="docstatus",
	)
	by_status = {cint(s.docstatus): s for s in slips}
	draft, submitted = by_status.get(0), by_status.get(1)
	employees = frappe.db.count("Employee", {"company": company, "status": "Active"})
	if submitted and not draft:
		state = "paid"
	elif draft or submitted:
		state = "slips"
	elif entries:
		state = "started"
	else:
		state = "not_started"
	return {
		"month": str(start)[:7],
		"state": state,
		"employees": employees,
		"draft": cint(draft.count) if draft else 0,
		"submitted": cint(submitted.count) if submitted else 0,
		"net_pay": flt(submitted.net_pay if submitted else 0) + flt(draft.net_pay if draft else 0),
		"entries": [{"name": e.name, "status": e.status, "href": _desk("Payroll Entry", e.name)} for e in entries],
	}


def _rates(day):
	s = frappe.get_cached_doc("Taiwan Payroll Settings")
	return {"year": cint(s.effective_year), "verified": bool(s.verified), "current": cint(s.effective_year) == getdate(day).year, "href": "/app/taiwan-payroll-settings"}


@frappe.whitelist()
def today():
	user = _user()
	roles = _roles()
	company = _company()
	day = getdate(nowdate())
	me = _me(user, day)
	out = {"date": str(day), "company": company, "me": me, "on_leave": [], "approvals": [], "payroll": None, "rates": None, "denied": []}
	if roles & APPROVER_ROLES:
		out["on_leave"] = _on_leave(company, day)
		out["approvals"] = _approvals(user, roles, company, me["employee"])
	else:
		out["denied"] += ["on_leave", "approvals"]
	if roles & PAYROLL_ROLES:
		try:
			out["payroll"] = _payroll(company, day)
		except frappe.PermissionError:
			frappe.clear_last_message()
			out["denied"].append("payroll")
	else:
		out["denied"].append("payroll")
	if roles & HR_ROLES:
		out["rates"] = _rates(day)
	out["can"] = {"approve": bool(roles & APPROVER_ROLES), "payroll": out["payroll"] is not None}
	return out


@frappe.whitelist(methods=["POST"])
def check_in(log_type, latitude=None, longitude=None):
	"""Clock in or out for the employee linked to the logged-in user."""
	user = _user()
	log_type = str(log_type or "").upper()
	if log_type not in LOG_TYPES:
		frappe.throw(_("打卡只能選上班或下班"))
	emp = _employee(user)
	if not emp:
		frappe.throw(_("你的帳號還沒連到員工資料。請人資在 ERPNext 的員工資料填上你的使用者帳號。"))
	now = now_datetime()
	recent = frappe.get_all(
		"Employee Checkin",
		filters={"employee": emp.name, "time": (">=", frappe.utils.add_to_date(now, seconds=-DUPLICATE_SECONDS))},
		fields=["log_type"],
		limit=1,
	)
	if recent:
		frappe.throw(_("一分鐘內已經打過卡了"))
	doc = frappe.new_doc("Employee Checkin")
	doc.update({"employee": emp.name, "log_type": log_type, "time": now, "device_id": "EveryThingOS"})
	if latitude not in (None, "") and longitude not in (None, ""):
		lat, lng = flt(latitude), flt(longitude)
		if not (-90 <= lat <= 90 and -180 <= lng <= 180):
			frappe.throw(_("位置不正確"))
		doc.latitude, doc.longitude = lat, lng
	# The user → employee link set by HR is the authorization: people only clock themselves.
	doc.insert(ignore_permissions=True)
	return {"ok": True, "message": _("{0}打卡 {1}").format(_(LOG_TYPES[log_type]), _time(doc.time)), "log": {"type": log_type, "time": _time(doc.time)}}


@frappe.whitelist(methods=["POST"])
def decide_leave(name, decision):
	"""Approve or reject an open leave application assigned to the logged-in user."""
	user = _user()
	if decision not in DECISIONS:
		frappe.throw(_("只能核准或退回"))
	if not isinstance(name, str) or not frappe.db.exists("Leave Application", name):
		frappe.throw(_("找不到這張假單"))
	doc = frappe.get_doc("Leave Application", name, for_update=True)
	roles = _roles()
	if not (roles & HR_ROLES or (doc.leave_approver == user and "Leave Approver" in roles)):
		raise frappe.PermissionError(_("這張假單不是給你核准的"))
	me = _employee(user)
	if me and doc.employee == me.name:
		raise frappe.PermissionError(_("不能核准自己的假單"))
	if doc.docstatus != 0 or doc.status != "Open":
		frappe.throw(_("這張假單已經處理過了"))
	doc.status = DECISIONS[decision]
	doc.flags.ignore_permissions = True
	doc.submit()
	verb = _("核准") if decision == "approve" else _("退回")
	return {"ok": True, "message": _("已{0} {1} 的{2}").format(verb, doc.employee_name, doc.leave_type), "href": _desk("Leave Application", doc.name)}
