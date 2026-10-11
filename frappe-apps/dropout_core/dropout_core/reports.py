"""老闆報表: the owner's numbers for the shell's 報表 page.

Revenue, top customers, the pipeline and low stock go through
`frappe.get_list`, so ERPNext's own permissions apply. Gross margin and AR
aging are ERPNext's Gross Profit and Accounts Receivable reports, run only when
the user may open that report in Desk. A section that is not permitted or fails
comes back as None and is named in `denied` or `failed`; the rest still load."""

import frappe
from frappe import _
from frappe.utils import add_days, add_months, cint, flt, get_first_day, get_last_day, getdate, nowdate

from dropout_core.shell import _company, _desk

REPORT_ROLES = ("System Manager", "Accounts Manager", "Sales Manager")
MAX_MONTHS = 24
PIPELINE_DAYS = 90
LIMIT = 30


def _require_reports():
	if frappe.session.user != "Administrator" and not set(REPORT_ROLES) & set(frappe.get_roles()):
		raise frappe.PermissionError(_("只有老闆、主管、會計看得到報表"))


def _months(months):
	value = cint(months)
	if str(value) != str(months).strip() or not 1 <= value <= MAX_MONTHS:
		frappe.throw(_("月數要是 1 到 {0} 的整數").format(MAX_MONTHS), frappe.ValidationError)
	return value


def _windows(today, months):
	first = get_first_day(add_months(today, -(months - 1)))
	return [(get_first_day(add_months(first, i)), get_last_day(add_months(first, i))) for i in range(months)]


class _Sections:
	def __init__(self):
		self.out, self.denied, self.failed = {}, [], []

	def run(self, key, fn):
		try:
			self.out[key] = fn()
		except frappe.PermissionError:
			frappe.clear_last_message()
			self.denied.append(key)
			self.out[key] = None
		except Exception:
			frappe.clear_last_message()
			frappe.log_error(title=f"DropOut 報表：{key}")
			self.failed.append(key)
			self.out[key] = None


def _report(name):
	if not frappe.get_cached_doc("Report", name).is_permitted():
		raise frappe.PermissionError(name)


def _invoices(company, start, end):
	# Credit notes are submitted Sales Invoices with negative totals, so summing them nets out returns.
	return {"company": company, "docstatus": 1, "is_opening": "No", "posting_date": ["between", [str(start), str(end)]]}


def _revenue(company, windows):
	out = []
	for start, end in windows:
		rows = frappe.get_list("Sales Invoice", filters=_invoices(company, start, end), fields=["sum(base_net_total) as total"])
		out.append({"month": start.strftime("%Y-%m"), "amount": flt(rows[0].total) if rows else 0.0})
	return out


def _margin(company, windows):
	_report("Gross Profit")
	from erpnext.accounts.report.gross_profit.gross_profit import GrossProfitGenerator

	currency = frappe.get_cached_value("Company", company, "default_currency")
	out = []
	for start, end in windows:
		gp = GrossProfitGenerator(
			frappe._dict(company=company, from_date=str(start), to_date=str(end), group_by="Customer", currency=currency, include_returned_invoices=1)
		)
		rows = getattr(gp, "grouped_data", None) or []
		revenue = sum(flt(r.get("base_amount")) for r in rows)
		profit = sum(flt(r.get("gross_profit")) for r in rows)
		out.append({"month": start.strftime("%Y-%m"), "revenue": revenue, "profit": profit, "percent": round(profit / revenue * 100, 1) if revenue else None})
	return out


def _aging(company, today):
	_report("Accounts Receivable")
	from erpnext.accounts.report.accounts_receivable.accounts_receivable import execute

	data = execute(frappe._dict(company=company, report_date=str(today), ageing_based_on="Due Date", range="30, 60, 90, 120"))[1]
	rows = [r for r in data if isinstance(r, dict) and r.get("voucher_no")]
	b1, b2, b3 = (sum(flt(r.get(f"range{i}")) for r in rows) for i in (1, 2, 3))
	total = sum(flt(r.get("outstanding")) for r in rows)
	return {"d0_30": b1, "d31_60": b2, "d61_90": b3, "d90_plus": total - b1 - b2 - b3, "total": total}


def _top_customers(company, start, end):
	rows = frappe.get_list(
		"Sales Invoice",
		filters=_invoices(company, start, end),
		fields=["customer", "max(customer_name) as customer_name", "sum(base_net_total) as total"],
		group_by="customer",
		order_by="customer asc",
	)
	rows = sorted((r for r in rows if flt(r.total) > 0), key=lambda r: -flt(r.total))[:10]
	return [{"customer": r.customer, "name": r.customer_name or r.customer, "amount": flt(r.total), "href": _desk("Customer", r.customer)} for r in rows]


def _count(doctype, filters, denied):
	try:
		rows = frappe.get_list(doctype, filters=filters, fields=["count(name) as n"])
	except frappe.PermissionError:
		frappe.clear_last_message()
		denied.append(doctype)
		return None
	return cint(rows[0].n) if rows else 0


def _pipeline(company, since, denied):
	return {
		"lead": _count("Lead", {"creation": [">=", str(since)]}, denied),
		"opportunity": _count("Opportunity", {"company": company, "transaction_date": [">=", str(since)]}, denied),
		"quotation": _count("Quotation", {"company": company, "docstatus": 1, "transaction_date": [">=", str(since)]}, denied),
		"sales_order": _count("Sales Order", {"company": company, "docstatus": 1, "transaction_date": [">=", str(since)]}, denied),
	}


def _low_stock(company):
	"""Same test as ERPNext's automatic reorder: projected quantity below the warehouse reorder level."""
	if not frappe.has_permission("Item", "read"):
		raise frappe.PermissionError("Item")
	warehouses = frappe.get_list("Warehouse", filters={"company": company, "is_group": 0}, pluck="name")
	if not warehouses:
		return []
	levels = frappe.get_all(
		"Item Reorder",
		filters={"parenttype": "Item", "warehouse": ["in", warehouses], "warehouse_reorder_level": [">", 0]},
		fields=["parent", "warehouse", "warehouse_reorder_level", "warehouse_reorder_qty"],
	)
	if not levels:
		return []
	names = {i.name: i.item_name for i in frappe.get_list("Item", filters={"name": ["in", list({r.parent for r in levels})], "disabled": 0}, fields=["name", "item_name"])}
	if not names:
		return []
	bins = {
		(b.item_code, b.warehouse): b
		for b in frappe.get_list("Bin", filters={"item_code": ["in", list(names)], "warehouse": ["in", warehouses]}, fields=["item_code", "warehouse", "actual_qty", "projected_qty"])
	}
	rows = []
	for r in levels:
		if r.parent not in names:
			continue
		b = bins.get((r.parent, r.warehouse))
		projected = flt(b.projected_qty) if b else 0.0
		if projected < flt(r.warehouse_reorder_level):
			rows.append(
				{
					"item_code": r.parent,
					"item_name": names[r.parent],
					"warehouse": r.warehouse,
					"actual": flt(b.actual_qty) if b else 0.0,
					"projected": projected,
					"reorder_level": flt(r.warehouse_reorder_level),
					"reorder_qty": flt(r.warehouse_reorder_qty),
					"href": _desk("Item", r.parent),
				}
			)
	rows.sort(key=lambda r: r["projected"] - r["reorder_level"])
	return rows[:LIMIT]


@frappe.whitelist()
def overview(months=12):
	_require_reports()
	months = _months(months)
	company = _company()
	if not company:
		frappe.throw(_("還沒有設定公司"))
	today = getdate(nowdate())
	windows = _windows(today, months)
	s = _Sections()
	s.run("revenue", lambda: _revenue(company, windows))
	s.run("margin", lambda: _margin(company, windows))
	s.run("aging", lambda: _aging(company, today))
	s.run("top_customers", lambda: _top_customers(company, windows[0][0], today))
	s.run("pipeline", lambda: _pipeline(company, add_days(today, -PIPELINE_DAYS), s.denied))
	s.run("low_stock", lambda: _low_stock(company))
	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"months": months,
		"as_of": str(today),
		"pipeline_days": PIPELINE_DAYS,
		**s.out,
		"denied": sorted(set(s.denied)),
		"failed": s.failed,
	}
