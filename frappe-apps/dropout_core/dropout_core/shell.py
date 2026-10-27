"""Read models for the EveryThingOS shell.

Everything goes through `frappe.get_list`, so the logged-in user's ERPNext
roles and user permissions decide what comes back. A section the user may not
read is listed in `denied` instead of failing the whole page."""

import frappe
from frappe.utils import add_months, date_diff, flt, get_first_day, getdate, nowdate

LIMIT = 30


def _company(company=None):
	return company or frappe.defaults.get_user_default("company") or frappe.defaults.get_global_default("company")


def _sum(doctype, field, filters):
	rows = frappe.get_list(doctype, filters=filters, fields=[f"sum({field}) as total"])
	return flt(rows[0].total) if rows else 0.0


class _Sections:
	def __init__(self):
		self.out, self.denied = {}, []

	def run(self, key, fn, empty):
		try:
			self.out[key] = fn()
		except frappe.PermissionError:
			frappe.clear_last_message()
			self.denied.append(key)
			self.out[key] = empty


def _desk(doctype, name):
	return f"/app/{frappe.scrub(doctype).replace('_', '-')}/{name}"


def _readable(doctype, denied, **kwargs):
	try:
		return frappe.get_list(doctype, **kwargs)
	except frappe.PermissionError:
		frappe.clear_last_message()
		denied.append(doctype)
		return []


def _sales(company, today, denied):
	docs = []
	for q in _readable(
		"Quotation",
		denied,
		filters={"company": company, "docstatus": 1, "status": ["in", ["Open", "Replied"]]},
		fields=["name", "party_name", "customer_name", "net_total", "total_taxes_and_charges", "total_qty"],
		order_by="modified desc",
		limit=LIMIT,
	):
		docs.append({"no": q.name, "party": q.customer_name or q.party_name, "qty": q.total_qty, "amount": q.net_total, "tax": q.total_taxes_and_charges, "step": "quote", "doctype": "Quotation", "href": _desk("Quotation", q.name)})
	for so in _readable(
		"Sales Order",
		denied,
		filters={"company": company, "docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Deliver", "To Bill"]]},
		fields=["name", "customer_name", "net_total", "total_taxes_and_charges", "total_qty", "per_delivered"],
		order_by="modified desc",
		limit=LIMIT,
	):
		step = "fulfill" if flt(so.per_delivered) >= 100 else "order"
		docs.append({"no": so.name, "party": so.customer_name, "qty": so.total_qty, "amount": so.net_total, "tax": so.total_taxes_and_charges, "step": step, "doctype": "Sales Order", "href": _desk("Sales Order", so.name)})
	for si in _readable(
		"Sales Invoice",
		denied,
		filters={"company": company, "docstatus": 1, "is_opening": "No", "posting_date": [">=", add_months(today, -3)]},
		fields=["name", "customer_name", "net_total", "total_taxes_and_charges", "total_qty", "outstanding_amount", "due_date", "dropout_einvoice_number"],
		order_by="posting_date desc",
		limit=LIMIT,
	):
		paid = flt(si.outstanding_amount) <= 0
		overdue = date_diff(today, si.due_date) if si.due_date and not paid else 0
		docs.append(
			{
				"no": si.name,
				"party": si.customer_name,
				"qty": si.total_qty,
				"amount": si.net_total,
				"tax": si.total_taxes_and_charges,
				"step": "paid" if paid else "invoice",
				"overdue_days": overdue if overdue > 0 else None,
				"invoice_no": si.dropout_einvoice_number,
				"doctype": "Sales Invoice",
				"href": _desk("Sales Invoice", si.name),
			}
		)
	return docs


def _purchases(company, denied):
	rows = []
	for po in _readable(
		"Purchase Order",
		denied,
		filters={"company": company, "docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive", "To Bill"]]},
		fields=["name", "supplier_name", "grand_total", "status"],
		order_by="modified desc",
		limit=LIMIT,
	):
		label = {"To Receive and Bill": "已下單待到貨", "To Receive": "已下單待到貨", "To Bill": "已到貨待請款"}[po.status]
		rows.append({"no": po.name, "vendor": po.supplier_name, "item": "", "amount": po.grand_total, "status": label, "next": "到貨入庫" if "Receive" in po.status else "登錄進項發票", "doctype": "Purchase Order", "href": _desk("Purchase Order", po.name)})
	for pi in _readable(
		"Purchase Invoice",
		denied,
		filters={"company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["name", "supplier_name", "outstanding_amount"],
		order_by="due_date asc",
		limit=LIMIT,
	):
		rows.append({"no": pi.name, "vendor": pi.supplier_name, "item": "", "amount": pi.outstanding_amount, "status": "待付款", "next": "付款", "doctype": "Purchase Invoice", "href": _desk("Purchase Invoice", pi.name)})
	return rows


def _stock(company):
	warehouses = frappe.get_list("Warehouse", filters={"company": company, "is_group": 0}, pluck="name")
	if not warehouses:
		return [], 0.0
	bins = frappe.get_list(
		"Bin",
		filters={"warehouse": ["in", warehouses], "actual_qty": ["!=", 0]},
		fields=["item_code", "warehouse", "actual_qty", "stock_value"],
		order_by="actual_qty asc",
		limit=200,
	)
	items = {b.item_code for b in bins}
	names = {i.name: i.item_name for i in frappe.get_list("Item", filters={"name": ["in", list(items)]}, fields=["name", "item_name"])} if items else {}
	safety = {}
	if items:
		for r in frappe.get_all("Item Reorder", filters={"parent": ["in", list(items)]}, fields=["parent", "warehouse", "warehouse_reorder_level"]):
			safety[(r.parent, r.warehouse)] = flt(r.warehouse_reorder_level)
	rows = [
		{"sku": b.item_code, "name": names.get(b.item_code, b.item_code), "warehouse": b.warehouse, "on_hand": flt(b.actual_qty), "safety": safety.get((b.item_code, b.warehouse), 0), "href": _desk("Item", b.item_code)}
		for b in bins
	]
	return rows, sum(flt(b.stock_value) for b in bins)


def _course_boms():
	"""Product Bundles (course BOMs): each course and the material items each student consumes."""
	bundles = frappe.get_list(
		"Product Bundle",
		filters={"disabled": 0},
		fields=["name", "new_item_code", "description"],
		order_by="modified desc",
		limit=50,
	)
	if not bundles:
		return []
	parent_codes = [b.new_item_code for b in bundles]
	parent_names = {
		i.name: i.item_name
		for i in frappe.get_all("Item", filters={"name": ["in", parent_codes]}, fields=["name", "item_name"])
	}
	children = frappe.get_all(
		"Product Bundle Item",
		filters={"parent": ["in", [b.name for b in bundles]]},
		fields=["parent", "item_code", "qty", "uom", "description", "idx"],
		order_by="idx asc",
	)
	child_codes = {c.item_code for c in children}
	child_items = {
		i.name: (i.item_name, i.stock_uom)
		for i in frappe.get_all("Item", filters={"name": ["in", list(child_codes)]}, fields=["name", "item_name", "stock_uom"])
	} if child_codes else {}
	by_parent = {}
	for c in children:
		item_name, stock_uom = child_items.get(c.item_code, (c.description or c.item_code, c.uom or "份"))
		by_parent.setdefault(c.parent, []).append(
			{
				"sku": c.item_code,
				"name": item_name or c.item_code,
				"qty_per_student": flt(c.qty) or 1,
				"uom": c.uom or stock_uom or "份",
			}
		)
	out = []
	for b in bundles:
		lines = by_parent.get(b.name, [])
		if not lines:
			continue
		out.append(
			{
				"course_code": b.new_item_code,
				"course_name": parent_names.get(b.new_item_code) or b.description or b.new_item_code,
				"target_seats": 15,
				"lines": lines,
				"href": _desk("Product Bundle", b.name),
			}
		)
	return out


def _aging(company, today):
	buckets = {}
	for si in frappe.get_list(
		"Sales Invoice",
		filters={"company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["customer", "customer_name", "outstanding_amount", "due_date"],
		limit=1000,
	):
		row = buckets.setdefault(si.customer, {"party": si.customer_name or si.customer, "current": 0, "d30": 0, "d60": 0, "d90": 0, "href": _desk("Customer", si.customer)})
		late = date_diff(today, si.due_date) if si.due_date else 0
		key = "current" if late <= 0 else "d30" if late <= 30 else "d60" if late <= 60 else "d90"
		row[key] += flt(si.outstanding_amount)
	return sorted(buckets.values(), key=lambda r: -(r["d90"] + r["d60"] + r["d30"] + r["current"]))[:LIMIT]


def _journals(company):
	entries = frappe.get_list(
		"GL Entry",
		filters={"company": company, "is_cancelled": 0},
		fields=["voucher_type", "voucher_no", "posting_date", "account", "debit", "credit", "remarks"],
		order_by="creation desc",
		limit=60,
	)
	vouchers = {}
	for e in entries:
		v = vouchers.setdefault(e.voucher_no, {"no": e.voucher_no, "date": getdate(e.posting_date).strftime("%m/%d"), "memo": (e.remarks or e.voucher_type or "")[:60], "debit": [], "credit": [], "amount": 0.0, "href": _desk(e.voucher_type, e.voucher_no)})
		if flt(e.debit):
			v["debit"].append(e.account.rsplit(" - ", 1)[0])
			v["amount"] += flt(e.debit)
		if flt(e.credit):
			v["credit"].append(e.account.rsplit(" - ", 1)[0])
	out = []
	for v in list(vouchers.values())[:10]:
		v["debit"] = "／".join(dict.fromkeys(v["debit"]))
		v["credit"] = "／".join(dict.fromkeys(v["credit"]))
		out.append(v)
	return out


def _cash(company):
	from erpnext.accounts.utils import get_balance_on

	accounts = frappe.get_list("Account", filters={"company": company, "account_type": ["in", ["Bank", "Cash"]], "is_group": 0}, pluck="name")
	return sum(flt(get_balance_on(account=a, company=company)) for a in accounts)


def _einvoices(company):
	return [
		{"no": si.dropout_einvoice_number or "（未取號）", "status": si.dropout_einvoice_status, "amount": si.grand_total, "related": si.name, "error": si.dropout_einvoice_error, "href": _desk("Sales Invoice", si.name)}
		for si in frappe.get_list(
			"Sales Invoice",
			filters={"company": company, "docstatus": 1, "dropout_einvoice_status": ["is", "set"]},
			fields=["name", "grand_total", "dropout_einvoice_status", "dropout_einvoice_number", "dropout_einvoice_error"],
			order_by="posting_date desc",
			limit=LIMIT,
		)
	]


@frappe.whitelist()
def books(company=None):
	company = _company(company)
	today = getdate(nowdate())
	month = get_first_day(today)
	s = _Sections()
	si_month = {"company": company, "docstatus": 1, "is_opening": "No", "posting_date": [">=", month]}
	s.run("month_sales", lambda: _sum("Sales Invoice", "base_net_total", si_month), 0)
	s.run("month_cost", lambda: _sum("Purchase Invoice", "base_net_total", {**si_month}), 0)
	s.run("ar", lambda: _sum("Sales Invoice", "outstanding_amount", {"company": company, "docstatus": 1}), 0)
	s.run("ap", lambda: _sum("Purchase Invoice", "outstanding_amount", {"company": company, "docstatus": 1}), 0)
	s.run("overdue_ar", lambda: _sum("Sales Invoice", "outstanding_amount", {"company": company, "docstatus": 1, "due_date": ["<", today]}), 0)
	s.run(
		"vat_payable",
		lambda: _sum("Sales Invoice", "base_total_taxes_and_charges", si_month) - _sum("Purchase Invoice", "base_total_taxes_and_charges", si_month),
		0,
	)
	s.run("cash", lambda: _cash(company), 0)
	s.run("sales", lambda: _sales(company, today, s.denied), [])
	s.run("purchases", lambda: _purchases(company, s.denied), [])
	s.run("stock", lambda: _stock(company), ([], 0))
	s.out["stock"], s.out["inventory_value"] = s.out["stock"]
	s.run("course_boms", _course_boms, [])
	s.run("ar_aging", lambda: _aging(company, today), [])
	s.run("journals", lambda: _journals(company), [])
	s.run("einvoices", lambda: _einvoices(company), [])
	o = s.out
	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency") if company else None,
		**o,
		"pnl": [
			{"label": "本月銷貨（未稅）", "amount": o["month_sales"]},
			{"label": "本月進貨與費用（未稅）", "amount": -o["month_cost"]},
			{"label": "本月差額", "amount": o["month_sales"] - o["month_cost"]},
		],
		"denied": sorted(set(s.denied)),
	}


@frappe.whitelist()
def people(limit=60):
	"""Leads and customers with the channels we know them on, newest first."""
	limit = min(int(limit), 200)
	identities = {}
	for i in frappe.get_list("DropOut Identity", fields=["party_type", "party", "channel"], order_by="first_seen_at desc", limit=limit * 3):
		identities.setdefault((i.party_type, i.party), i.channel)
	rows = []
	for lead in frappe.get_list("Lead", filters={"status": ["not in", ["Converted", "Do Not Contact"]]}, fields=["name", "lead_name", "company_name", "status", "source", "modified"], order_by="modified desc", limit=limit):
		rows.append({"name": lead.lead_name or lead.company_name or lead.name, "stage": lead.status, "channel": identities.get(("Lead", lead.name)) or lead.source or "", "party_type": "Lead", "party": lead.name, "href": _desk("Lead", lead.name), "modified": str(lead.modified)})
	for c in frappe.get_list("Customer", filters={"disabled": 0}, fields=["name", "customer_name", "customer_group", "modified"], order_by="modified desc", limit=limit):
		rows.append({"name": c.customer_name, "stage": "客人", "channel": identities.get(("Customer", c.name)) or "", "party_type": "Customer", "party": c.name, "href": _desk("Customer", c.name), "modified": str(c.modified)})
	rows.sort(key=lambda r: r["modified"], reverse=True)
	return rows[:limit]


@frappe.whitelist()
def letter():
	"""Newsletter overview: segments, consent, and recent sends."""
	s = _Sections()
	since = add_months(getdate(nowdate()), -1)
	s.run("groups", lambda: frappe.get_list("Email Group", fields=["name", "title", "total_subscribers"], order_by="total_subscribers desc", limit=20), [])
	s.run("consent", lambda: {r.status: r.count for r in frappe.get_list("DropOut Consent", filters={"purpose": "marketing"}, fields=["status", "count(name) as count"], group_by="status")}, {})
	s.run(
		"newsletters",
		lambda: frappe.get_list("Newsletter", fields=["name", "subject", "email_sent", "schedule_sending", "schedule_send", "total_recipients", "total_views"], order_by="modified desc", limit=10),
		[],
	)
	s.run(
		"last_30_days",
		lambda: {
			r.event_type: r.count
			for r in frappe.get_list(
				"DropOut Event",
				filters={"event_type": ["in", ["letter_opened", "letter_clicked", "email_bounced", "unsubscribed", "subscribed"]], "occurred_at": [">=", since]},
				fields=["event_type", "count(name) as count"],
				group_by="event_type",
			)
		},
		{},
	)
	o = s.out
	return {
		"groups": [{"name": g.name, "title": g.title or g.name, "subscribers": g.total_subscribers, "href": _desk("Email Group", g.name)} for g in o["groups"]],
		"consent": {k: o["consent"].get(k, 0) for k in ("granted", "pending", "withdrawn")},
		"newsletters": [
			{"name": n.name, "subject": n.subject, "sent": bool(n.email_sent), "scheduled": str(n.schedule_send) if n.schedule_sending and n.schedule_send else None, "recipients": n.total_recipients, "views": n.total_views, "href": _desk("Newsletter", n.name)}
			for n in o["newsletters"]
		],
		"last_30_days": o["last_30_days"],
		"denied": s.denied,
	}


@frappe.whitelist()
def catalog(limit=100):
	"""Sellable items with the default selling price, for the quotation form."""
	price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
	items = frappe.get_list("Item", filters={"disabled": 0, "is_sales_item": 1, "has_variants": 0}, fields=["name", "item_name", "stock_uom"], order_by="item_name asc", limit=min(int(limit), 500))
	prices = {}
	if items and price_list:
		for p in frappe.get_all("Item Price", filters={"price_list": price_list, "item_code": ["in", [i.name for i in items]]}, fields=["item_code", "price_list_rate"]):
			prices[p.item_code] = flt(p.price_list_rate)
	parties = [{"party_type": "Customer", "party": c.name, "label": c.customer_name} for c in frappe.get_list("Customer", filters={"disabled": 0}, fields=["name", "customer_name"], order_by="modified desc", limit=100)]
	parties += [{"party_type": "Lead", "party": l.name, "label": l.lead_name or l.company_name or l.name} for l in frappe.get_list("Lead", filters={"status": ["not in", ["Converted", "Do Not Contact"]]}, fields=["name", "lead_name", "company_name"], order_by="modified desc", limit=100)]
	return {"items": [{"item_code": i.name, "item_name": i.item_name, "uom": i.stock_uom, "rate": prices.get(i.name)} for i in items], "parties": parties}


@frappe.whitelist()
def website():
	"""官網: what is published on Webshop, online orders and form leads in the last 30 days."""
	s = _Sections()
	since = add_months(getdate(nowdate()), -1)
	s.run(
		"items",
		lambda: frappe.get_list("Website Item", filters={"published": 1}, fields=["name", "item_code", "web_item_name", "route"], order_by="ranking desc, modified desc", limit=LIMIT),
		[],
	)
	s.run("published", lambda: frappe.db.count("Website Item", {"published": 1}) if frappe.has_permission("Website Item") else 0, 0)
	s.run(
		"orders",
		lambda: frappe.get_list(
			"Sales Order",
			filters={"order_type": "Shopping Cart", "docstatus": 1, "transaction_date": [">=", since]},
			fields=["name", "customer_name", "grand_total", "status", "transaction_date"],
			order_by="transaction_date desc",
			limit=LIMIT,
		),
		[],
	)
	s.run("form_leads", lambda: len(frappe.get_list("DropOut Event", filters={"event_type": "lead_captured", "occurred_at": [">=", since]}, pluck="name", limit=1000)), 0)
	o = s.out
	return {
		"items": [{"code": i.item_code, "name": i.web_item_name, "route": f"/{i.route}" if i.route else None, "href": _desk("Website Item", i.name)} for i in o["items"]],
		"published": o["published"],
		"orders": [{"no": so.name, "party": so.customer_name, "amount": so.grand_total, "status": so.status, "date": str(so.transaction_date), "href": _desk("Sales Order", so.name)} for so in o["orders"]],
		"form_leads": o["form_leads"],
		"shop_path": "/all-products",
		"denied": s.denied,
	}


@frappe.whitelist()
def meetings(limit=20):
	"""Meeting summaries written by the meeting bot, newest first."""
	rows = frappe.get_list(
		"DropOut Event",
		filters={"event_type": "meeting_summarized"},
		fields=["name", "party_type", "party", "occurred_at", "payload", "external_id"],
		order_by="occurred_at desc",
		limit=min(int(limit), 100),
	)
	out = []
	for r in rows:
		payload = frappe.parse_json(r.payload or "{}") or {}
		summary = payload.get("summary") or ""
		title, _sep, body = summary.partition("\n") if "\n" in summary else ("", "", summary)
		out.append(
			{
				"title": title or "會議",
				"summary": body or summary,
				"at": str(r.occurred_at) if r.occurred_at else None,
				"attendees": payload.get("attendees") or [],
				"party": r.party,
				"href": _desk(r.party_type, r.party) if r.party_type and r.party else _desk("DropOut Event", r.name),
			}
		)
	return out


@frappe.whitelist()
def hygiene(limit=50):
	"""Addresses we stopped sending to, and sign-ups still waiting for the confirmation click."""
	s = _Sections()
	s.run(
		"bounced",
		lambda: frappe.get_list("DropOut Event", filters={"event_type": "email_bounced"}, fields=["external_id", "occurred_at", "payload", "party_type", "party"], order_by="occurred_at desc", limit=min(int(limit), 200)),
		[],
	)
	s.run(
		"pending",
		lambda: frappe.get_list("DropOut Consent", filters={"purpose": "marketing", "status": "pending"}, fields=["email", "creation", "party_type", "party"], order_by="creation desc", limit=min(int(limit), 200)),
		[],
	)
	rows = []
	for b in s.out["bounced"]:
		reason = (frappe.parse_json(b.payload or "{}") or {}).get("reason")
		rows.append({"email": b.external_id, "result": "退信，已停寄", "action": reason or "換一個信箱或改用電話", "href": _desk(b.party_type, b.party) if b.party else None})
	for c in s.out["pending"]:
		rows.append({"email": c.email, "result": "還沒點確認信", "action": "不寄電子報；七天後可再寄一次確認信", "href": _desk(c.party_type, c.party) if c.party else None})
	return {"rows": rows, "denied": s.denied}


SHELL_ROLES = (
	"System Manager", "Accounts Manager", "Accounts User", "Sales Manager", "Sales User", "Stock Manager", "Stock User",
	"Item Manager", "Purchase Manager", "Purchase User", "Newsletter Manager", "Website Manager", "Support Team",
	"DropOut Marketing", "Manufacturing User", "Projects User",
)


@frappe.whitelist()
def whoami():
	user = frappe.session.user
	if user == "Guest":
		raise frappe.PermissionError
	doc = frappe.get_cached_doc("User", user)
	return {
		"user": user,
		"full_name": doc.full_name,
		"company": _company(),
		"roles": [r for r in frappe.get_roles(user) if r in SHELL_ROLES],
		"profile": doc.role_profile_name,
		"chatwoot_user_id": doc.get("dropout_chatwoot_user_id"),
	}
