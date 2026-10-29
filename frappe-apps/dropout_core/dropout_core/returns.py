"""退貨：對一張已送出的出貨單退一部分數量回倉庫。"""

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist(methods=["POST"])
def return_against_delivery(delivery_note, qty):
	"""建一張退貨出貨單、送出，並回傳它。

	`qty` 要大於 0，而且不能超過原出貨數量，也不能超過還沒退的數量。
	明細用這個數量（退貨單上是負數），倉庫與單價沿用原出貨單，不加稅。
	沒有這張出貨單，或它還沒送出，就失敗。
	"""
	qty = flt(qty)
	source = _delivery(delivery_note)
	delivered = flt(sum(flt(row.qty) for row in source.items))
	if qty <= 0 or qty > delivered:
		frappe.throw(_("退貨數量要大於 0，而且不能超過出貨數量 {0}").format(delivered))
	remaining = flt(delivered - _already_returned(source.name))
	if qty > remaining:
		frappe.throw(_("退貨數量不能超過還沒退的 {0}").format(remaining))

	from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_return

	doc = make_sales_return(source.name)
	_apply_qty(doc, source, qty)
	_strip_tax(doc)
	doc.calculate_taxes_and_totals()
	doc.insert()
	if doc.taxes or doc.taxes_and_charges:
		_strip_tax(doc)
		doc.calculate_taxes_and_totals()
	doc.flags.dont_auto_add_taxes = True
	doc.submit()
	return doc


def _delivery(name):
	if not name or not frappe.db.exists("Delivery Note", name):
		frappe.throw(_("找不到出貨單 {0}").format(name or ""), frappe.DoesNotExistError)
	source = frappe.get_doc("Delivery Note", name)
	if source.docstatus != 1:
		frappe.throw(_("出貨單 {0} 還沒送出，不能退貨").format(name))
	return source


def _already_returned(name):
	names = frappe.get_all(
		"Delivery Note",
		filters={"return_against": name, "is_return": 1, "docstatus": 1},
		pluck="name",
	)
	if not names:
		return 0.0
	rows = frappe.get_all("Delivery Note Item", filters={"parent": ["in", names]}, fields=["sum(qty) as qty"])
	return abs(flt(rows[0].qty)) if rows and rows[0].qty else 0.0


def _apply_qty(doc, source, qty):
	"""把退貨明細改成這次要退的數量，倉庫與單價留原出貨的。"""
	origins = {row.name: row for row in source.items}
	left = qty
	for item in doc.items:
		origin = origins.get(item.dn_detail)
		available = flt(origin.qty) - flt(origin.returned_qty) if origin else 0
		take = min(available, left) if available > 0 else 0
		if take <= 0:
			item.qty = 0
			continue
		item.qty = -take
		item.stock_qty = flt(item.qty) * flt(item.conversion_factor or 1)
		item.warehouse = origin.warehouse
		item.rate = origin.rate
		item.price_list_rate = origin.price_list_rate or origin.rate
		left -= take
	for item in list(doc.items):
		if not flt(item.qty):
			doc.remove(item)
	if left > 0 or not doc.items:
		frappe.throw(_("這張出貨單沒有可以退的數量"))
	warehouses = {row.warehouse for row in doc.items}
	doc.set_warehouse = next(iter(warehouses)) if len(warehouses) == 1 else None


def _strip_tax(doc):
	doc.set("taxes", [])
	doc.taxes_and_charges = None
	doc.shipping_rule = None
	doc.flags.dont_auto_add_taxes = True
