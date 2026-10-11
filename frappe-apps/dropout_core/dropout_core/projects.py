"""專案與工時 writes for the DropOut OS shell.

Reads go straight through `frappe.client.get_list` from the shell; these two
writes need more than a plain insert:

- `log_time` picks a free time slot for the person that day (ERPNext refuses
  overlapping time logs), resolves their Employee and Activity Type so ERPNext
  fills in the billing and costing rates, and submits the timesheet so the
  hours can be invoiced.
- `make_invoice` bills only the time logs that were picked. It starts from
  ERPNext's own `make_sales_invoice` mapper and the same list the Sales Invoice
  "Fetch Timesheet" button uses (`get_projectwise_timesheet_data`), and leaves
  the invoice as a draft for accounting to check and submit.

Everything runs as the logged-in user without `ignore_permissions`."""

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, nowdate

from dropout_core.actions import _refused
from dropout_core.shell import _desk

STEP = 0.25
MAX_ENTRY_HOURS = 12
MAX_DAY_HOURS = 16
BACKDATE_DAYS = 60
DAY_START = "08:00:00"
MAX_INVOICE_LINES = 500
CLOSED = ("Completed", "Cancelled")


def _hours(value):
	try:
		hours = float(value)
	except (TypeError, ValueError):
		frappe.throw(_("時數要是數字"))
	if hours <= 0 or hours > MAX_ENTRY_HOURS or abs(hours / STEP - round(hours / STEP)) > 1e-9:
		frappe.throw(_("時數要在 0.25 到 {0} 小時之間，以 0.25 小時為單位").format(MAX_ENTRY_HOURS))
	return hours


def _day(value):
	try:
		day = getdate(value or nowdate())
	except Exception:
		frappe.throw(_("日期格式不對"))
	today = getdate(nowdate())
	if day > today:
		frappe.throw(_("不能記明天以後的工時"))
	if (today - day).days > BACKDATE_DAYS:
		frappe.throw(_("超過 {0} 天前的工時，請在 ERPNext 的工時表補登").format(BACKDATE_DAYS))
	return day


def _project(name, for_invoice=False):
	if not name or not isinstance(name, str) or not frappe.db.exists("Project", name):
		frappe.throw(_("找不到這個專案"))
	project = frappe.get_doc("Project", name)
	project.check_permission("read")
	if not for_invoice and project.status in CLOSED:
		frappe.throw(_("這個專案已經結案，不能再記工時"))
	return project


def _activity(activity_type, employee):
	if activity_type:
		if not frappe.db.exists("Activity Type", {"name": activity_type, "disabled": 0}):
			frappe.throw(_("沒有這個工作類型"))
		return activity_type
	first = frappe.get_all("Activity Type", filters={"disabled": 0}, order_by="creation asc", pluck="name", limit=1)
	if first:
		return first[0]
	if employee:
		frappe.throw(_("請先在 ERPNext 建一個工作類型（Activity Type），例如：顧問、施工"))
	return None


def _day_logs(day, employee, user):
	"""Time logs this person already has on `day`, from any timesheet that is not cancelled."""
	ts = frappe.qb.DocType("Timesheet")
	tsd = frappe.qb.DocType("Timesheet Detail")
	start = get_datetime(f"{day} 00:00:00")
	query = (
		frappe.qb.from_(tsd)
		.join(ts)
		.on(ts.name == tsd.parent)
		.select(tsd.hours, tsd.to_time)
		.where((tsd.parenttype == "Timesheet") & (ts.docstatus < 2) & (tsd.from_time >= start) & (tsd.from_time < add_to_date(start, days=1)))
	)
	query = query.where(ts.employee == employee) if employee else query.where(ts.owner == user)
	return query.run(as_dict=True)


@frappe.whitelist(methods=["POST"])
def log_time(project, hours, date=None, task=None, note=None, activity_type=None, billable=1):
	"""One time log on one project, submitted so it can be invoiced. Returns the new Timesheet."""
	hours = _hours(hours)
	day = _day(date)
	doc = _project(project)
	if task:
		if frappe.db.get_value("Task", task, "project") != doc.name:
			frappe.throw(_("這個工作項目不屬於這個專案"))
	note = (note or "").strip()[:280] or None
	user = frappe.session.user
	employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
	activity = _activity(activity_type, employee)

	logs = _day_logs(day, employee, user)
	logged = sum(flt(r.hours) for r in logs)
	if logged + hours > MAX_DAY_HOURS:
		frappe.throw(_("這天已經記了 {0} 小時，一天最多 {1} 小時").format(flt(logged, 2), MAX_DAY_HOURS))
	start = get_datetime(f"{day} {DAY_START}")
	for r in logs:
		if r.to_time and get_datetime(r.to_time) > start:
			start = get_datetime(r.to_time)
	end = add_to_date(start, hours=hours)
	if end > add_to_date(get_datetime(f"{day} 00:00:00"), days=1):
		frappe.throw(_("這天剩下的時間不夠記 {0} 小時，請改記到別天或在 ERPNext 調整").format(hours))

	sheet = frappe.new_doc("Timesheet")
	sheet.company = doc.company
	sheet.employee = employee
	sheet.parent_project = doc.name
	sheet.customer = doc.customer
	sheet.note = note
	sheet.append(
		"time_logs",
		{
			"activity_type": activity,
			"from_time": start,
			"hours": hours,
			"to_time": end,
			"project": doc.name,
			"task": task or None,
			"is_billable": 1 if cint(billable) else 0,
			"description": note,
		},
	)
	try:
		sheet.insert()
		sheet.submit()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {
		"ok": True,
		"created": {"doctype": "Timesheet", "name": sheet.name, "href": _desk("Timesheet", sheet.name)},
		"hours": hours,
		"from_time": str(start),
	}


def _service_item(item_code=None):
	filters = {"is_sales_item": 1, "is_stock_item": 0, "disabled": 0, "has_variants": 0}
	if item_code:
		if not frappe.db.exists("Item", {"name": item_code, **filters}):
			frappe.throw(_("這個品項不能拿來開工時發票，請選不管庫存的服務品項"))
		return item_code
	first = frappe.get_all("Item", filters=filters, order_by="creation asc", pluck="name", limit=1)
	if not first:
		frappe.throw(_("請先在 ERPNext 建一個不管庫存的服務品項，例如「專業服務」，發票才有品項可以開"))
	return first[0]


@frappe.whitelist(methods=["POST"])
def make_invoice(project, details, item_code=None):
	"""A draft Sales Invoice for the picked time logs (`details`: Timesheet Detail names) of one project."""
	from erpnext.projects.doctype.timesheet.timesheet import get_projectwise_timesheet_data, make_sales_invoice

	if isinstance(details, str):
		try:
			details = frappe.parse_json(details)
		except ValueError:
			details = None
	if not isinstance(details, list) or not details or len(details) > MAX_INVOICE_LINES or not all(isinstance(d, str) and d for d in details):
		frappe.throw(_("請選要請款的工時"))
	details = list(dict.fromkeys(details))
	doc = _project(project, for_invoice=True)
	if not frappe.has_permission("Sales Invoice", "create"):
		raise frappe.PermissionError(_("你的 ERPNext 角色不能開發票"))
	if not doc.customer:
		frappe.throw(_("這個專案還沒填客人，請先在 ERPNext 的專案填上客人"))

	open_rows = {r.name: r for r in get_projectwise_timesheet_data(project=doc.name)}
	missing = [d for d in details if d not in open_rows]
	if missing:
		frappe.throw(_("有 {0} 筆工時已經請過款、還沒送出，或不能請款，請重新整理再選").format(len(missing)))
	drafted = frappe.get_all("Sales Invoice Timesheet", filters={"parenttype": "Sales Invoice", "timesheet_detail": ["in", details], "docstatus": 0}, pluck="parent", distinct=True)
	if drafted:
		frappe.throw(_("有工時已經在發票草稿 {0} 裡，請先送出或刪掉那張草稿").format("、".join(drafted)))
	item = _service_item(item_code)
	rows = [open_rows[d] for d in details]

	try:
		si = make_sales_invoice(rows[0].time_sheet, customer=doc.customer)
		si.project = doc.name
		si.set("timesheets", [])
		si.set("items", [])
		by_activity = {}
		for r in rows:
			si.append(
				"timesheets",
				{
					"time_sheet": r.time_sheet,
					"timesheet_detail": r.name,
					"billing_hours": r.billing_hours,
					"billing_amount": r.billing_amount,
					"activity_type": r.activity_type,
					"description": r.description,
					"from_time": r.from_time,
					"to_time": r.to_time,
					"project_name": r.project_name,
				},
			)
			line = by_activity.setdefault(r.activity_type or "", {"hours": 0.0, "amount": 0.0})
			line["hours"] += flt(r.billing_hours)
			line["amount"] += flt(r.billing_amount)
		for activity, line in by_activity.items():
			if line["hours"] <= 0:
				continue
			label = f"{doc.project_name}｜{activity}" if activity else doc.project_name
			si.append("items", {"item_code": item, "qty": flt(line["hours"], 2), "rate": line["amount"] / line["hours"], "description": label, "project": doc.name})
		if not si.items:
			frappe.throw(_("選到的工時都是 0 小時"))
		si.run_method("calculate_billing_amount_for_timesheet")
		rates = [flt(row.rate) for row in si.items]
		si.run_method("set_missing_values")
		for row, rate in zip(si.items, rates):
			row.rate = rate
			row.price_list_rate = row.price_list_rate or rate
		si.insert()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {
		"ok": True,
		"created": {"doctype": "Sales Invoice", "name": si.name, "href": _desk("Sales Invoice", si.name)},
		"hours": flt(sum(flt(r.billing_hours) for r in rows), 2),
		"net_total": si.net_total,
		"grand_total": si.grand_total,
	}
