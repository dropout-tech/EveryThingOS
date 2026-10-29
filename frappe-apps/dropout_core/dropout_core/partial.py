"""Ship part of a sales order (訂單殘量).

Uses ERPNext's ``make_delivery_note``, then sets the line quantities to the
amount leaving this time. Does not add tax and does not change the site-wide
negative-stock setting.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, strip_html


@frappe.whitelist(methods=["POST"])
def deliver_partial(sales_order, qty):
	"""Submit a delivery note for ``qty`` units, capped at the order's pending qty.

	``qty`` is the total quantity to ship this time. It is spread across the
	mapped lines in order, and no line is shipped for more than its own pending
	qty. An illegal quantity returns ``{"ok": False, "message": ...}``.
	"""
	qty = flt(qty)
	if qty <= 0:
		return _refused(_("數量要大於 0"))

	name = sales_order if isinstance(sales_order, str) else getattr(sales_order, "name", None)
	if not name or not frappe.db.exists("Sales Order", name):
		return _refused(_("找不到這張訂單"))

	frappe.clear_document_cache("Sales Order", name)
	so = frappe.get_doc("Sales Order", name)
	if so.docstatus != 1:
		return _refused(_("這張訂單還沒送出"))

	pending = _pending_qty(name)
	if pending <= 0:
		return _refused(_("這張訂單沒有待出量"))
	if flt(qty, 6) > flt(pending, 6):
		return _refused(_("這次要出的數量超過待出量 {0}").format(_format_qty(pending)))

	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

	save_point = None
	previous_args = frappe.flags.args
	frappe.flags.args = None
	try:
		dn = make_delivery_note(so.name, kwargs={"for_reserved_stock": 0, "skip_item_mapping": 0})
		if not _apply_ship_qty(dn, qty):
			return _refused(_("這次要出的數量超過待出量 {0}").format(_format_qty(pending)))
		_strip_tax_the_order_does_not_have(so, dn)
		blocked = _below_safety(dn)
		if blocked:
			return _refused(blocked)
		save_point = f"deliver_partial_{frappe.generate_hash(length=6)}"
		frappe.db.savepoint(save_point)
		dn.insert()
		dn.submit()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		if save_point:
			frappe.db.rollback(save_point=save_point)
		frappe.local.message_log = []
		return _refused(strip_html(str(e)).strip() or _("ERPNext 拒絕了這次出貨"))
	finally:
		frappe.flags.args = previous_args

	return {
		"ok": True,
		"created": {"doctype": dn.doctype, "name": dn.name},
		"qty": qty,
		"pending_qty": _pending_qty(name),
	}


def _refused(message):
	return {"ok": False, "message": message}


def _format_qty(qty):
	text = f"{flt(qty):.6f}".rstrip("0").rstrip(".")
	return text or "0"


def _pending_qty(sales_order):
	"""Units still to ship: ordered qty minus qty already delivered."""
	total = 0.0
	for row in frappe.get_all(
		"Sales Order Item",
		filters={"parent": sales_order},
		fields=["qty", "delivered_qty", "delivered_by_supplier"],
	):
		if cint(row.delivered_by_supplier):
			continue
		total += flt(row.qty) - flt(row.delivered_qty)
	return flt(total)


def _apply_ship_qty(dn, qty):
	"""Replace the mapped remaining qty with the quantity shipped this time."""
	left = flt(qty)
	for row in dn.get("items") or []:
		take = min(flt(row.qty), left)
		row.qty = take
		row.stock_qty = flt(take * (flt(row.conversion_factor) or 1))
		left = flt(left - take)
	for row in list(dn.get("items") or []):
		if flt(row.qty) <= 0:
			dn.remove(row)
	if left > 0.0000001 or not dn.get("items"):
		return False
	dn.run_method("calculate_taxes_and_totals")
	return True


def _below_safety(dn):
	from dropout_core.stock_guard import assert_can_ship

	for row in dn.get("items") or []:
		if not row.warehouse:
			continue
		gate = assert_can_ship(row.item_code, row.warehouse, row.qty)
		if not gate["ok"]:
			return gate["message"]
	return None


def _strip_tax_the_order_does_not_have(so, dn):
	"""Drop a default tax template picked up while mapping. Do not add tax."""
	if so.taxes or flt(so.total_taxes_and_charges):
		return
	dn.taxes_and_charges = None
	dn.set("taxes", [])
	dn.flags.dont_auto_add_taxes = True
	dn.run_method("calculate_taxes_and_totals")
