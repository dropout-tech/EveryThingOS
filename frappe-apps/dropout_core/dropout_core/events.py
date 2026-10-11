import re

import frappe
from frappe import _
from frappe.utils import now_datetime

from dropout_core.taiwan import is_valid_tax_id


def emit(event_type, idempotency_key, **fields):
	"""Insert a DropOut Event once per idempotency key. Returns (name, created)."""
	existing = frappe.db.get_value("DropOut Event", {"idempotency_key": idempotency_key})
	if existing:
		return existing, False
	payload = fields.pop("payload", None)
	doc = frappe.get_doc(
		{
			"doctype": "DropOut Event",
			"event_type": event_type,
			"idempotency_key": idempotency_key,
			"occurred_at": fields.pop("occurred_at", None) or now_datetime(),
			"payload": frappe.as_json(payload) if isinstance(payload, (dict, list)) else payload,
			**{k: v for k, v in fields.items() if v not in (None, "")},
		}
	)
	try:
		doc.insert(ignore_permissions=True)
	except frappe.DuplicateEntryError:
		return frappe.db.get_value("DropOut Event", {"idempotency_key": idempotency_key}), False
	return doc.name, True


def _emit_for(doc, event_type, party_type, party, payload):
	emit(
		event_type,
		f"{doc.doctype}:{doc.name}:{event_type}",
		party_type=party_type,
		party=party,
		reference_doctype=doc.doctype,
		reference_name=doc.name,
		source_system="erpnext",
		payload=payload,
	)


def on_customer_insert(doc, method=None):
	_emit_for(doc, "customer_created", "Customer", doc.name, {"customer_name": doc.customer_name})


def on_lead_insert(doc, method=None):
	_emit_for(doc, "lead_created", "Lead", doc.name, {"lead_name": doc.lead_name})


def on_quotation_submit(doc, method=None):
	_emit_for(doc, "quote_sent", doc.quotation_to, doc.party_name, {"amount": doc.grand_total, "currency": doc.currency})


def on_sales_order_submit(doc, method=None):
	_emit_for(doc, "won", "Customer", doc.customer, {"amount": doc.grand_total, "currency": doc.currency})


def on_delivery_note_submit(doc, method=None):
	_emit_for(doc, "fulfilled", "Customer", doc.customer, {"amount": doc.grand_total})


def on_sales_invoice_submit(doc, method=None):
	_emit_for(doc, "invoiced", "Customer", doc.customer, {"amount": doc.grand_total, "is_return": doc.is_return})


def on_payment_entry_submit(doc, method=None):
	if doc.payment_type != "Receive" or doc.party_type != "Customer":
		return
	_emit_for(doc, "paid", doc.party_type, doc.party, {"amount": doc.paid_amount, "currency": doc.paid_from_account_currency})


def validate_customer_tax_id(doc, method=None):
	"""Taiwan sites: 統一編號 must be 8 digits with a valid checksum."""
	tax_id = (doc.tax_id or "").strip()
	if not tax_id:
		return
	doc.tax_id = tax_id
	if frappe.db.get_default("country") != "Taiwan":
		return
	if not re.fullmatch(r"\d{8}", tax_id) or not is_valid_tax_id(tax_id):
		frappe.throw(_("統一編號 {0} 檢查碼不正確").format(tax_id), title=_("統一編號錯誤"))
