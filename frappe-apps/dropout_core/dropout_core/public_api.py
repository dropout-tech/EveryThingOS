"""Writes behind the glue's public REST API (/v1).

The glue has already resolved the company from the API key, checked the key's
scope and the contract, and validated every field against a whitelist. Errors
ERPNext raises for business rules come back as {"ok": False, "message": ...}.
"""

import frappe
from frappe import _

from dropout_core.actions import _refused
from dropout_core.api import _add_identity, _find_identity, _guard
from dropout_core.taiwan import normalize_email, normalize_phone

CUSTOMER_FIELDS = ("name", "customer_name", "customer_type", "customer_group", "territory", "tax_id", "email_id", "mobile_no", "disabled", "creation", "modified")


def _default(doctype, setting):
	return frappe.db.get_single_value("Selling Settings", setting) or frappe.db.get_value(doctype, {"is_group": 0}, "name", order_by="lft asc")


@frappe.whitelist(methods=["POST"])
def create_customer(customer_name, customer_type="Company", tax_id=None, email=None, phone=None):
	"""POST /v1/customers. Same 統一編號 as an existing customer is a conflict, not a duplicate."""
	_guard()
	name = (customer_name or "").strip()[:140] or frappe.throw(_("請填客戶名稱"))
	tax_id = (tax_id or "").strip() or None
	email, phone = normalize_email(email), normalize_phone(phone)
	if tax_id:
		existing = frappe.db.get_value("Customer", {"tax_id": tax_id})
		if existing:
			return {"ok": False, "conflict": True, "customer": existing, "message": _("統一編號 {0} 已經是 {1}").format(tax_id, existing)}
	doc = frappe.new_doc("Customer")
	doc.update(
		{
			"customer_name": name,
			"customer_type": "Individual" if customer_type == "Individual" else "Company",
			"customer_group": _default("Customer Group", "customer_group"),
			"territory": _default("Territory", "territory"),
			"tax_id": tax_id,
			"email_id": email,
			"mobile_no": phone,
		}
	)
	try:
		doc.insert()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	for channel, value in (("email", email), ("phone", phone)):
		if value and not _find_identity(channel, value)[0]:
			_add_identity("Customer", doc.name, channel, value, verified=0)
	return {"ok": True, "customer": frappe.db.get_value("Customer", doc.name, CUSTOMER_FIELDS, as_dict=True)}
