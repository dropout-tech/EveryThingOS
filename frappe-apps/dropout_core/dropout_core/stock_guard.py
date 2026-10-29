"""Safety-stock gate for a shipment. Not registered as a document event."""

import frappe
from frappe.utils import flt


def assert_can_ship(item_code, warehouse, qty):
	"""Whether ``qty`` can leave ``warehouse`` without dropping below safety stock.

	Safety stock is that warehouse's Item Reorder ``warehouse_reorder_level``,
	or ``Item.safety_stock`` when the field exists. No safety level means the
	shipment is allowed. ``Bin.actual_qty`` is only read.
	"""
	safety = _safety_qty(item_code, warehouse)
	if safety <= 0:
		return {"ok": True}
	on_hand = flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))
	if on_hand - flt(qty) < safety:
		return {"ok": False, "message": "出貨後低於安全量"}
	return {"ok": True}


def _safety_qty(item_code, warehouse):
	rows = frappe.get_all(
		"Item Reorder",
		filters={"parent": item_code, "parenttype": "Item", "warehouse": warehouse},
		pluck="warehouse_reorder_level",
	)
	level = max((flt(row) for row in rows), default=0.0)
	if level > 0:
		return level
	if frappe.get_meta("Item").has_field("safety_stock"):
		return flt(frappe.db.get_value("Item", item_code, "safety_stock"))
	return 0.0
