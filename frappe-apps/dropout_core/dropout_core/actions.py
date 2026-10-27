"""Write actions for the EveryThingOS shell.

Each action runs as the logged-in user: documents are created with ERPNext's own
mappers (`make_sales_order`, `get_payment_entry`, …) and saved without
`ignore_permissions`, so roles decide who may do what. A business rule that
ERPNext refuses (not enough stock, no default bank account…) comes back as
`{"ok": False, "message": ...}` instead of an HTTP error, so the shell can show it."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, nowdate, strip_html

from dropout_core.shell import _company, _desk
from dropout_core.taiwan import normalize_email, normalize_phone

SO = "erpnext.selling.doctype.sales_order.sales_order"
PO = "erpnext.buying.doctype.purchase_order.purchase_order"


def _payment(dt, dn):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry(dt, dn)
	if not pe.paid_from or not pe.paid_to:
		frappe.throw(_("公司還沒設定預設的銀行或現金科目"))
	bank = frappe.get_cached_value("Account", pe.paid_to if pe.payment_type == "Receive" else pe.paid_from, "account_type") == "Bank"
	if bank and not pe.reference_no:
		pe.reference_no = f"EveryThingOS {dn}"
		pe.reference_date = nowdate()
	return pe


def _next(doc):
	"""The one next document for this document, or None when the chain is finished."""
	dt = doc.doctype
	if dt == "Quotation" and doc.status in ("Open", "Replied", "Partially Ordered"):
		from erpnext.selling.doctype.quotation.quotation import make_sales_order

		so = make_sales_order(doc.name)
		so.delivery_date = so.delivery_date or add_days(nowdate(), 7)
		for item in so.items:
			item.delivery_date = item.delivery_date or so.delivery_date
		return so
	if dt == "Sales Order":
		if not doc.skip_delivery_note and flt(doc.per_delivered) < 100:
			return frappe.get_attr(f"{SO}.make_delivery_note")(doc.name)
		if flt(doc.per_billed) < 100:
			return frappe.get_attr(f"{SO}.make_sales_invoice")(doc.name)
	if dt == "Delivery Note" and flt(doc.per_billed) < 100:
		from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

		return make_sales_invoice(doc.name)
	if dt == "Purchase Order":
		if flt(doc.per_received) < 100 and _has_stock(doc):
			return frappe.get_attr(f"{PO}.make_purchase_receipt")(doc.name)
		if flt(doc.per_billed) < 100:
			return frappe.get_attr(f"{PO}.make_purchase_invoice")(doc.name)
	if dt in ("Sales Invoice", "Purchase Invoice") and flt(doc.outstanding_amount) > 0:
		return _payment(dt, doc.name)
	return None


def _has_stock(doc):
	codes = [i.item_code for i in doc.items]
	return bool(frappe.get_all("Item", filters={"name": ["in", codes], "is_stock_item": 1}, limit=1))


def _refused(e):
	frappe.db.rollback()
	frappe.local.message_log = []
	return {"ok": False, "message": strip_html(str(e)).strip() or _("ERPNext 拒絕了這一步")}


@frappe.whitelist(methods=["POST"])
def advance(doctype, name):
	"""Take a sales or purchase document one step forward and submit the new document."""
	if doctype not in ("Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Purchase Order", "Purchase Invoice"):
		frappe.throw(_("這種單據不能從這裡往下走"), frappe.PermissionError)
	doc = frappe.get_doc(doctype, name, for_update=True)
	doc.check_permission("read")
	if doc.docstatus != 1:
		return {"ok": False, "message": _("這張單還沒送出，請先在 ERPNext 送出")}
	try:
		target = _next(doc)
		if target is None:
			return {"ok": False, "message": _("這張單已經走完了")}
		target.insert()
		target.submit()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {"ok": True, "created": {"doctype": target.doctype, "name": target.name, "href": _desk(target.doctype, target.name)}}


@frappe.whitelist(methods=["POST"])
def create_lead(name, email=None, phone=None, company_name=None, notes=None):
	"""Staff adds a person by hand. Same email or phone as someone we know returns that person instead."""
	from dropout_core.api import _add_identity, _find_identity, _possible_matches

	email, phone = normalize_email(email), normalize_phone(phone)
	for channel, value in (("email", email), ("phone", phone)):
		ident, _ext = _find_identity(channel, value) if value else (None, None)
		if ident:
			party_type, party = frappe.db.get_value("DropOut Identity", ident, ["party_type", "party"])
			return {"ok": True, "existing": True, "party_type": party_type, "party": party, "href": _desk(party_type, party)}
	matches = _possible_matches(email, phone)
	if matches:
		m = matches[0]
		return {"ok": True, "existing": True, "party_type": m["party_type"], "party": m["party"], "href": _desk(m["party_type"], m["party"])}
	lead = frappe.new_doc("Lead")
	lead.first_name = (name or email or phone or "").strip()[:140] or frappe.throw(_("請填名字、Email 或電話"))
	lead.company_name = company_name
	lead.email_id = email
	lead.mobile_no = phone
	lead.source = "EveryThingOS" if frappe.db.exists("Lead Source", "EveryThingOS") else None
	try:
		lead.insert()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	if notes:
		lead.add_comment("Comment", notes)
	for channel, value in (("email", email), ("phone", phone)):
		if value:
			_add_identity("Lead", lead.name, channel, value, verified=0)
	return {"ok": True, "existing": False, "party_type": "Lead", "party": lead.name, "href": _desk("Lead", lead.name)}


@frappe.whitelist(methods=["POST"])
def create_quotation(party_type, party, items, company=None, submit=1):
	"""One quotation from the shell. `items` is a list of {item_code, qty, rate?}; missing rates use the price list."""
	if party_type not in ("Lead", "Customer"):
		frappe.throw(_("報價對象只能是潛在客人或客人"))
	items = frappe.parse_json(items) if isinstance(items, str) else items
	if not items:
		frappe.throw(_("至少要有一項"))
	q = frappe.new_doc("Quotation")
	q.quotation_to = party_type
	q.party_name = party
	q.company = _company(company)
	q.transaction_date = nowdate()
	q.valid_till = add_days(nowdate(), 30)
	q.order_type = "Sales"
	for row in items:
		q.append("items", {"item_code": row["item_code"], "qty": flt(row.get("qty") or 1), **({"rate": flt(row["rate"])} if row.get("rate") not in (None, "") else {})})
	try:
		q.run_method("set_missing_values")
		for row, src in zip(q.items, items):
			if src.get("rate") not in (None, ""):
				row.rate = flt(src["rate"])
				row.price_list_rate = row.price_list_rate or row.rate
		q.insert()
		if cint(submit):
			q.submit()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {"ok": True, "created": {"doctype": "Quotation", "name": q.name, "href": _desk("Quotation", q.name), "grand_total": q.grand_total}}


def _sender():
	account = frappe.db.get_value("Email Account", {"default_outgoing": 1, "enable_outgoing": 1}, ["email_id", "name"], as_dict=True)
	if account:
		return account.email_id, account.name
	return frappe.db.get_value("User", frappe.session.user, "email"), None


@frappe.whitelist(methods=["POST"])
def draft_newsletter(subject, message, email_groups, send=0):
	"""Write a newsletter to one or more Email Groups. Unsubscribed members are skipped by Frappe itself."""
	groups = frappe.parse_json(email_groups) if isinstance(email_groups, str) and email_groups.startswith("[") else [email_groups] if isinstance(email_groups, str) else email_groups
	sender, _account = _sender()
	nl = frappe.new_doc("Newsletter")
	nl.subject = subject
	nl.content_type = "Rich Text"
	nl.message = message
	nl.sender_email = sender
	nl.sender_name = frappe.db.get_value("Company", _company(), "company_name")
	nl.send_unsubscribe_link = 1
	for g in groups or []:
		nl.append("email_group", {"email_group": g})
	try:
		nl.insert()
		if cint(send):
			nl.send_emails()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {"ok": True, "name": nl.name, "queued": bool(cint(send)), "recipients": len(nl.newsletter_recipients), "href": _desk("Newsletter", nl.name)}


@frappe.whitelist(methods=["POST"])
def send_newsletter(name):
	nl = frappe.get_doc("Newsletter", name)
	nl.check_permission("write")
	try:
		nl.send_emails()
	except frappe.ValidationError as e:
		return _refused(e)
	return {"ok": True, "name": nl.name, "recipients": len(nl.newsletter_recipients)}


@frappe.whitelist(methods=["POST"])
def upsert_course_bom(course_code, course_name, lines, target_seats=15):
	"""Creates or updates a course Product Bundle and any missing course/material Items."""
	if not ({"System Manager", "Item Manager", "Stock Manager", "Sales Manager"} & set(frappe.get_roles())):
		raise frappe.PermissionError(_("只有管理教材或課程的人可以設定課程 BOM"))
	code = (course_code or "").strip()[:60]
	title = (course_name or code).strip()[:80]
	rows = frappe.parse_json(lines) if isinstance(lines, str) else lines
	if not code or not rows:
		frappe.throw(_("要填課程代號與至少一項教材或材料"))

	leaf_group = (
		"期班"
		if frappe.db.exists("Item Group", "期班")
		else (frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "Products")
	)
	mat_group = (
		"教材"
		if frappe.db.exists("Item Group", "教材")
		else leaf_group
	)

	try:
		if not frappe.db.exists("Item", code):
			course_uom = "期" if frappe.db.exists("UOM", "期") else "Nos"
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": title,
					"item_group": leaf_group,
					"stock_uom": course_uom,
					"is_stock_item": 0,
					"is_sales_item": 1,
				}
			).insert()
		else:
			frappe.db.set_value("Item", code, "item_name", title)

		bundle_items = []
		for r in rows:
			sku = (r.get("sku") or "").strip()[:60]
			mname = (r.get("name") or sku).strip()[:80]
			qty = flt(r.get("qtyPerStudent") or r.get("qty") or 1)
			uom = (r.get("uom") or "").strip()[:12]
			if not sku or qty <= 0:
				frappe.throw(_("材料的品號與用量要填好"))
			if uom and not frappe.db.exists("UOM", uom):
				frappe.get_doc({"doctype": "UOM", "uom_name": uom, "must_be_whole_number": 0}).insert(ignore_permissions=True)
			use_uom = uom if uom and frappe.db.exists("UOM", uom) else "Nos"
			if not frappe.db.exists("Item", sku):
				frappe.get_doc(
					{
						"doctype": "Item",
						"item_code": sku,
						"item_name": mname,
						"item_group": mat_group,
						"stock_uom": use_uom,
						"is_stock_item": 1,
						"is_sales_item": 0,
						"is_purchase_item": 1,
					}
				).insert()
			bundle_items.append({"item_code": sku, "qty": qty, "uom": use_uom, "description": mname})

		if frappe.db.exists("Product Bundle", code):
			pb = frappe.get_doc("Product Bundle", code)
			pb.description = title
			pb.set("items", bundle_items)
			pb.save()
		else:
			pb = frappe.get_doc(
				{
					"doctype": "Product Bundle",
					"new_item_code": code,
					"description": title,
					"items": bundle_items,
				}
			).insert()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)

	return {
		"ok": True,
		"message": _("已儲存「{0}」的課程 BOM（{1} 項教材／材料）").format(title, len(bundle_items)),
		"created": {"doctype": "Product Bundle", "name": pb.name, "href": _desk("Product Bundle", pb.name)},
	}


@frappe.whitelist(methods=["POST"])
def record_stock_movement(kind, item_code, qty, from_warehouse, to_warehouse=None, reason=None):
	"""WMS stock movement: consume (上課領用耗用), wastage (教學損耗／報廢), or transfer (跨店調撥)."""
	if not ({"System Manager", "Stock Manager", "Stock User", "Sales Manager"} & set(frappe.get_roles())):
		raise frappe.PermissionError(_("只有倉庫或門市管理人員可以登記耗用、損耗與跨店調撥"))
	if kind not in ("consume", "wastage", "transfer"):
		frappe.throw(_("異動種類只能是上課耗用、教學損耗或跨店調撥"))
	amount_qty = flt(qty)
	if amount_qty <= 0:
		frappe.throw(_("數量要大於 0"))
	if kind == "transfer" and not to_warehouse:
		frappe.throw(_("跨店調撥要選調入分店倉庫"))

	entry_type = "Material Transfer" if kind == "transfer" else "Material Issue"
	label = {"consume": "上課領用耗用", "wastage": "教學損耗／報廢", "transfer": "跨店調撥"}[kind]
	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = entry_type
	se.company = _company()
	se.remarks = f"[{label}] {reason or ''}".strip()
	row = {
		"item_code": item_code,
		"qty": amount_qty,
		"s_warehouse": from_warehouse,
	}
	if kind == "transfer":
		row["t_warehouse"] = to_warehouse
	se.append("items", row)
	try:
		se.insert()
		se.submit()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {
		"ok": True,
		"message": _("已登記{0}：{1} × {2}").format(label, item_code, amount_qty),
		"created": {"doctype": "Stock Entry", "name": se.name, "href": _desk("Stock Entry", se.name)},
	}
