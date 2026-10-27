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
