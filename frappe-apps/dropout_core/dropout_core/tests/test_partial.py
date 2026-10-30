import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, nowdate

from dropout_core.partial import deliver_partial
from dropout_core.shell import books
from dropout_core.tests.test_dropout_flow import company, leaf, make_customer


def _warehouse(company_name):
	return frappe.get_all("Warehouse", filters={"company": company_name, "is_group": 0}, pluck="name", limit=1)[0]


def _bin_qty(item_code, warehouse):
	return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))


def _pending_qty(sales_order):
	rows = frappe.get_all("Sales Order Item", filters={"parent": sales_order}, fields=["qty", "delivered_qty"])
	return flt(sum(flt(row.qty) - flt(row.delivered_qty) for row in rows))


def _submitted_notes(sales_order):
	rows = frappe.db.sql(
		"""
		select distinct dn.name
		from `tabDelivery Note` dn
		inner join `tabDelivery Note Item` dni on dni.parent = dn.name
		where dni.against_sales_order = %s and dn.docstatus = 1
		""",
		sales_order,
	)
	return [row[0] for row in rows]


def _stocked_order(qty=10, rate=100):
	"""A submitted stock-item order with ``qty`` already received into the same warehouse."""
	co = company()
	wh = _warehouse(co)
	code = f"DO-PARTIAL-{frappe.generate_hash(length=6)}"
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": code,
			"item_group": leaf("Item Group"),
			"stock_uom": "Nos",
			"is_stock_item": 1,
		}
	)
	item.append("item_defaults", {"company": co, "default_warehouse": wh})
	item.insert()
	customer = make_customer(f"殘量客人 {frappe.generate_hash(length=6)}")
	receipt = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": co,
			"posting_date": nowdate(),
			"set_posting_time": 1,
			"posting_time": "00:00:01",
			"items": [{"item_code": code, "qty": qty, "t_warehouse": wh, "basic_rate": rate, "uom": "Nos"}],
		}
	)
	receipt.insert()
	receipt.submit()
	order = frappe.get_doc(
		{
			"doctype": "Sales Order",
			"customer": customer,
			"company": co,
			"transaction_date": nowdate(),
			"delivery_date": add_days(nowdate(), 7),
			"items": [
				{
					"item_code": code,
					"qty": qty,
					"rate": rate,
					"warehouse": wh,
					"delivery_date": add_days(nowdate(), 7),
				}
			],
		}
	)
	order.flags.dont_auto_add_taxes = True
	order.insert()
	if order.taxes or order.taxes_and_charges or flt(order.total_taxes_and_charges):
		order.taxes_and_charges = None
		order.set("taxes", [])
		order.flags.dont_auto_add_taxes = True
		order.run_method("calculate_taxes_and_totals")
		order.save()
	order.submit()
	return {"company": co, "warehouse": wh, "item_code": code, "rate": rate, "order": order.name}


class TestPartialDelivery(FrappeTestCase):
	def test_deliver_partial_ships_six_then_four_without_adding_tax(self):
		allow_negative = frappe.db.get_single_value("Stock Settings", "allow_negative_stock")
		tax_templates = set(frappe.get_all("Sales Taxes and Charges Template", pluck="name"))
		fx = _stocked_order(10, rate=100)
		order, code, wh, rate = fx["order"], fx["item_code"], fx["warehouse"], fx["rate"]

		self.assertEqual(_bin_qty(code, wh), 10)
		self.assertEqual(_pending_qty(order), 10)
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order, "total_taxes_and_charges")), 0)
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order, "grand_total")), flt(10 * rate))

		for bad in (0, -1):
			refused = deliver_partial(order, bad)
			self.assertFalse(refused["ok"], refused)
			self.assertTrue(refused.get("message"))
		self.assertEqual(_bin_qty(code, wh), 10)
		self.assertEqual(_pending_qty(order), 10)
		self.assertEqual(_submitted_notes(order), [])

		first = deliver_partial(order, 6)
		self.assertTrue(first["ok"], first)
		self.assertEqual(flt(first["pending_qty"]), 4)
		self.assertEqual(_bin_qty(code, wh), 4)
		self.assertEqual(flt(10 - _bin_qty(code, wh)), 6)
		self.assertEqual(_pending_qty(order), 4)
		self.assertEqual(flt(frappe.db.get_value("Delivery Note Item", {"parent": first["created"]["name"]}, "qty")), 6)
		self.assertEqual(frappe.db.get_value("Delivery Note Item", {"parent": first["created"]["name"]}, "warehouse"), wh)
		self._assert_no_tax(first["created"]["name"], 6 * rate)
		listed = next(row for row in books()["sales"] if row["no"] == order)
		self.assertEqual(listed["delivery_note"], first["created"]["name"])
		self.assertGreaterEqual(flt(listed["previous_balance"]), 0)

		over = deliver_partial(order, 5)
		self.assertFalse(over["ok"], over)
		self.assertIn("待出量", over["message"])
		self.assertEqual(_bin_qty(code, wh), 4)
		self.assertEqual(_pending_qty(order), 4)
		self.assertEqual(_submitted_notes(order), [first["created"]["name"]])

		second = deliver_partial(order, 4)
		self.assertTrue(second["ok"], second)
		self.assertEqual(flt(second["pending_qty"]), 0)
		self.assertEqual(_pending_qty(order), 0)
		self.assertEqual(_bin_qty(code, wh), 0)
		self.assertEqual(flt(frappe.db.get_value("Delivery Note Item", {"parent": second["created"]["name"]}, "qty")), 4)
		self._assert_no_tax(second["created"]["name"], 4 * rate)
		self.assertEqual(sorted(_submitted_notes(order)), sorted([first["created"]["name"], second["created"]["name"]]))
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order, "total_taxes_and_charges")), 0)
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order, "grand_total")), flt(10 * rate))
		self.assertEqual(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"), allow_negative)
		self.assertEqual(set(frappe.get_all("Sales Taxes and Charges Template", pluck="name")), tax_templates)

	def test_deliver_partial_stops_when_stock_would_fall_below_safety(self):
		fx = _stocked_order(10, rate=100)
		order, code, wh = fx["order"], fx["item_code"], fx["warehouse"]
		item = frappe.get_doc("Item", code)
		item.append(
			"reorder_levels",
			{"warehouse": wh, "warehouse_reorder_level": 5, "warehouse_reorder_qty": 1, "material_request_type": "Purchase"},
		)
		item.save()

		refused = deliver_partial(order, 6)
		self.assertEqual(refused, {"ok": False, "message": "出貨後低於安全量"})
		self.assertEqual(_bin_qty(code, wh), 10)
		self.assertEqual(_pending_qty(order), 10)
		self.assertEqual(_submitted_notes(order), [])

		allowed = deliver_partial(order, 5)
		self.assertTrue(allowed["ok"], allowed)
		self.assertEqual(_bin_qty(code, wh), 5)
		self.assertEqual(_pending_qty(order), 5)

	def test_deliver_partial_rejects_qty_over_pending(self):
		fx = _stocked_order(10, rate=80)
		order, code, wh = fx["order"], fx["item_code"], fx["warehouse"]
		stock_before = _bin_qty(code, wh)
		self.assertEqual(stock_before, 10)

		over = deliver_partial(order, 11)
		self.assertFalse(over["ok"], over)
		self.assertIn("待出量", over["message"])
		self.assertEqual(_bin_qty(code, wh), stock_before)
		self.assertEqual(_pending_qty(order), 10)
		self.assertEqual(_submitted_notes(order), [])

		nothing = deliver_partial(order, 0)
		self.assertFalse(nothing["ok"], nothing)
		self.assertTrue(nothing.get("message"))
		self.assertEqual(_bin_qty(code, wh), stock_before)

	def _assert_no_tax(self, delivery_note, expected_total):
		tax = flt(frappe.db.get_value("Delivery Note", delivery_note, "total_taxes_and_charges"))
		net = flt(frappe.db.get_value("Delivery Note", delivery_note, "net_total"))
		grand = flt(frappe.db.get_value("Delivery Note", delivery_note, "grand_total"))
		self.assertEqual(tax, 0)
		self.assertEqual(grand, net)
		self.assertEqual(grand, flt(expected_total))
		self.assertEqual(
			frappe.db.count("Sales Taxes and Charges", {"parent": delivery_note, "parenttype": "Delivery Note"}),
			0,
		)
