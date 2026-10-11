"""客戶入口: the quote, order or invoice a customer opens from a shared link.

The shell creates links as the salesperson, so `document` runs ERPNext's own
read permission first. The glue then renders, accepts and pays with the
integration user (`accept_quotation`, `payment_link` are integration-only).
Nothing here is guest-callable: customers never talk to ERPNext directly.
"""

import base64
import binascii
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, get_url, getdate, now_datetime, nowdate, strip_html

from dropout_core.api import _guard

DOCTYPES = ("Quotation", "Sales Order", "Sales Invoice")
KIND = {"Quotation": "quote", "Sales Order": "order", "Sales Invoice": "invoice"}
OPEN_QUOTATION = ("Open", "Replied")
TW_GATEWAYS = ("ECPay", "NewebPay")
PNG = b"\x89PNG\r\n\x1a\n"
MAX_SIGNATURE_BYTES = 300_000
MAX_LINES = 200


def _text(value, limit=4000):
	return re.sub(r"\n{3,}", "\n\n", strip_html(value or "").strip())[:limit]


def _doc(doctype, name):
	if doctype not in DOCTYPES:
		frappe.throw(_("客戶入口只能分享報價單、訂單和發票"))
	if not name or not isinstance(name, str) or len(name) > 140:
		frappe.throw(_("缺少單號"))
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("找不到 {0}").format(name), frappe.DoesNotExistError)
	return frappe.get_doc(doctype, name)


def _logo(path):
	return get_url(path) if path and path.startswith("/files/") else None


def _company(name):
	c = frappe.db.get_value("Company", name, ["company_name", "tax_id", "phone_no", "email", "website", "company_logo"], as_dict=True) or {}
	return {
		"name": c.get("company_name") or name,
		"tax_id": c.get("tax_id"),
		"phone": c.get("phone_no"),
		"email": c.get("email"),
		"website": c.get("website"),
		"logo": _logo(c.get("company_logo")),
	}


def _contact(doc):
	user = frappe.db.get_value("User", doc.owner, ["full_name", "email", "mobile_no", "enabled"], as_dict=True)
	if not user or not user.enabled or doc.owner in ("Administrator", "Guest"):
		return None
	return {"name": user.full_name, "email": user.email, "phone": user.mobile_no}


def _bank(company):
	"""The company's own bank account for transfers (ERPNext Bank Account marked as a company account)."""
	rows = frappe.get_all(
		"Bank Account",
		filters={"is_company_account": 1, "company": company, "disabled": 0},
		fields=["bank", "account_name", "bank_account_no", "branch_code"],
		order_by="is_default desc, modified desc",
		limit=1,
	)
	if not rows or not rows[0].bank_account_no:
		return None
	r = rows[0]
	return {"bank": r.bank, "holder": r.account_name, "account": r.bank_account_no, "branch": r.branch_code}


def _gateway_account(company):
	"""A Payment Gateway Account for ECPay/NewebPay in TWD whose settings are enabled, or None."""
	if not frappe.db.exists("DocType", "Payment Gateway Account"):
		return None
	for row in frappe.get_all(
		"Payment Gateway Account",
		filters={"payment_gateway": ["in", TW_GATEWAYS], "currency": "TWD"},
		fields=["name", "payment_gateway"],
		order_by="is_default desc, creation asc",
	):
		settings = f"{row.payment_gateway} Settings"
		if frappe.db.exists("DocType", settings) and cint(frappe.db.get_single_value(settings, "enabled")):
			return row.name
	return None


def _status(doc):
	if doc.docstatus == 2:
		return "cancelled"
	if doc.doctype == "Quotation":
		if doc.get("dropout_accepted_at"):
			return "accepted"
		if doc.status in ("Ordered", "Partially Ordered"):
			return "ordered"
		if doc.status == "Lost":
			return "lost"
		if doc.status == "Expired" or (doc.valid_till and getdate(doc.valid_till) < getdate(nowdate())):
			return "expired"
		return "open"
	if doc.doctype == "Sales Invoice":
		if flt(doc.outstanding_amount) <= 0:
			return "paid"
		return "overdue" if doc.due_date and getdate(doc.due_date) < getdate(nowdate()) else "unpaid"
	return "closed" if doc.status in ("Completed", "Closed") else "open"


def present(doc):
	"""What the customer sees. Only fields meant for them; never costs, margins or internal notes."""
	taxes = flt(doc.total_taxes_and_charges)
	total = flt(doc.get("rounded_total")) or flt(doc.grand_total)
	out = {
		"doctype": doc.doctype,
		"kind": KIND[doc.doctype],
		"name": doc.name,
		"status": _status(doc),
		"company": _company(doc.company),
		"customer": doc.get("customer_name") or doc.get("party_name") or doc.get("customer"),
		"date": str(doc.get("transaction_date") or doc.get("posting_date") or ""),
		"valid_till": str(doc.valid_till) if doc.get("valid_till") else None,
		"due_date": str(doc.due_date) if doc.get("due_date") else None,
		"delivery_date": str(doc.delivery_date) if doc.get("delivery_date") else None,
		"currency": doc.currency,
		"lines": [
			{
				"item": row.item_name or row.item_code,
				"description": _text(row.description, 400) if row.description and row.description != row.item_name else None,
				"qty": flt(row.qty),
				"uom": row.uom,
				"rate": flt(row.rate),
				"amount": flt(row.amount),
			}
			for row in doc.items[:MAX_LINES]
		],
		"net": flt(doc.net_total),
		"tax": taxes,
		"total": total,
		"terms": _text(doc.get("terms")) or None,
		"contact": _contact(doc),
		"accepted": None,
		"outstanding": None,
		"einvoice": None,
		"bank": None,
		"online_pay": False,
	}
	if doc.doctype == "Quotation" and doc.get("dropout_accepted_at"):
		out["accepted"] = {"name": doc.dropout_accepted_by, "at": str(doc.dropout_accepted_at)}
	if doc.doctype == "Sales Invoice":
		out["outstanding"] = flt(doc.outstanding_amount)
		out["einvoice"] = doc.get("dropout_einvoice_number") or None
		if out["outstanding"] > 0:
			out["bank"] = _bank(doc.company)
			out["online_pay"] = bool(_gateway_account(doc.company))
	return out


@frappe.whitelist()
def document(doctype, name):
	"""The customer's view of one submitted document. Called as the salesperson when a link is made
	(ERPNext decides whether they may read it) and as the integration user when the link is opened."""
	doc = _doc(doctype, name)
	doc.check_permission("read")
	if doc.docstatus != 1:
		frappe.throw(_("{0} 還沒送出（或已取消），不能給客人看。請先在 ERPNext 送出。").format(name))
	return present(doc)


def _signature(data):
	if not data:
		return None
	if not isinstance(data, str):
		frappe.throw(_("簽名格式不對"))
	if data.startswith("data:"):
		head, _sep, data = data.partition(",")
		if head != "data:image/png;base64":
			frappe.throw(_("簽名要是 PNG 圖"))
	if len(data) > MAX_SIGNATURE_BYTES * 4 // 3 + 4:
		frappe.throw(_("簽名圖太大"))
	try:
		raw = base64.b64decode(data, validate=True)
	except (binascii.Error, ValueError):
		frappe.throw(_("簽名格式不對"))
	if not raw.startswith(PNG) or len(raw) > MAX_SIGNATURE_BYTES:
		frappe.throw(_("簽名要是 PNG 圖"))
	return raw


@frappe.whitelist(methods=["POST"])
def accept_quotation(name, full_name, signature=None, link=None, ip_hash=None, consent=0):
	"""The customer accepts a quotation online. Keeps the evidence on the Quotation: who typed their
	name, when, through which link, a hash of the network address, and the drawn signature as a private file."""
	_guard()
	doc = _doc("Quotation", name)
	if doc.get("dropout_accepted_at"):
		return {"status": "already_accepted", "accepted": {"name": doc.dropout_accepted_by, "at": str(doc.dropout_accepted_at)}}
	full_name = re.sub(r"\s+", " ", (full_name or "")).strip()
	if not 2 <= len(full_name) <= 80:
		frappe.throw(_("請輸入 2 到 80 個字的全名"))
	if not cint(consent):
		frappe.throw(_("要先勾選同意，才能接受報價"))
	if doc.docstatus != 1:
		frappe.throw(_("這張報價還沒送出或已取消"))
	status = _status(doc)
	if status == "expired":
		frappe.throw(_("這張報價已過期，請跟業務要一張新的"))
	if status != "open" or doc.status not in OPEN_QUOTATION:
		frappe.throw(_("這張報價已經不能接受（{0}）").format(doc.status))
	png = _signature(signature)
	link = (link or "")[:64] or None
	ip_hash = (ip_hash or "")[:64] or None

	file_url = None
	if png:
		f = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"signature-{doc.name}.png",
				"attached_to_doctype": "Quotation",
				"attached_to_name": doc.name,
				"attached_to_field": "dropout_signature",
				"is_private": 1,
				"content": png,
			}
		)
		f.flags.ignore_permissions = True
		f.insert()
		file_url = f.file_url

	at = now_datetime()
	doc.db_set(
		{
			"dropout_accepted_by": full_name,
			"dropout_accepted_at": at,
			"dropout_acceptance_link": link,
			"dropout_acceptance_ip": ip_hash,
			"dropout_signature": file_url,
		}
	)
	doc.add_comment(
		"Comment",
		_("客人在客戶入口接受報價：{0}，{1}。{2}").format(
			full_name, get_datetime(at).strftime("%Y-%m-%d %H:%M"), _("附手寫簽名。") if file_url else _("以輸入全名代替簽名。")
		),
	)
	return {"status": "accepted", "accepted": {"name": full_name, "at": str(at)}, "signature": file_url}


@frappe.whitelist(methods=["POST"])
def payment_link(sales_invoice):
	"""An ECPay/NewebPay checkout URL for what is still owed, through ERPNext's own Payment Request.
	Reuses an open request so reloading the page never creates a second one."""
	_guard()
	doc = _doc("Sales Invoice", sales_invoice)
	if doc.docstatus != 1:
		frappe.throw(_("這張發票還沒送出或已取消"))
	if flt(doc.outstanding_amount) <= 0:
		return {"status": "paid"}
	gateway_account = _gateway_account(doc.company)
	if not gateway_account:
		return {"status": "unavailable"}
	gateway = frappe.db.get_value("Payment Gateway Account", gateway_account, "payment_gateway")
	existing = frappe.get_all(
		"Payment Request",
		filters={
			"reference_doctype": "Sales Invoice",
			"reference_name": doc.name,
			"docstatus": 1,
			"status": ["in", ("Requested", "Initiated")],
			"payment_gateway": gateway,
		},
		pluck="name",
		order_by="creation desc",
		limit=1,
	)
	if existing:
		pr = frappe.get_doc("Payment Request", existing[0])
	else:
		from erpnext.accounts.doctype.payment_request.payment_request import make_payment_request

		pr = make_payment_request(dt="Sales Invoice", dn=doc.name, payment_gateway_account=gateway_account, submit_doc=1, mute_email=1, return_doc=1)
	return {"status": "ok", "url": pr.get_payment_url(), "payment_request": pr.name, "amount": flt(pr.grand_total)}
