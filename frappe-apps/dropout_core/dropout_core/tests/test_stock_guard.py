import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from dropout_core.stock_guard import assert_can_ship


def company():
	return frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def leaf(doctype):
	return frappe.get_all(doctype, filters={"is_group": 0}, pluck="name", limit=1)[0]


def warehouse():
	return frappe.get_all("Warehouse", filters={"company": company(), "is_group": 0}, pluck="name", limit=1)[0]


def make_item(safety=None):
	code = f"DO-GUARD-{frappe.generate_hash(length=6)}"
	wh = warehouse()
	doc = {
		"doctype": "Item",
		"item_code": code,
		"item_name": code,
		"item_group": leaf("Item Group"),
		"stock_uom": "Nos",
		"is_stock_item": 1,
		"item_defaults": [{"company": company(), "default_warehouse": wh}],
	}
	if safety is not None:
		doc["reorder_levels"] = [
			{
				"warehouse": wh,
				"warehouse_reorder_level": safety,
				"warehouse_reorder_qty": safety,
				"material_request_type": "Purchase",
			}
		]
	frappe.get_doc(doc).insert()
	return code, wh


def receive(item_code, wh, qty):
	entry = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": company(),
			"items": [{"item_code": item_code, "qty": qty, "t_warehouse": wh, "basic_rate": 1, "uom": "Nos"}],
		}
	)
	entry.insert()
	entry.submit()
	return entry


class TestStockGuard(FrappeTestCase):
	def test_below_safety_is_refused_and_down_to_safety_is_allowed(self):
		code, wh = make_item(safety=4)
		receive(code, wh, 5)
		self.assertEqual(flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": wh}, "actual_qty")), 5)
		self.assertEqual(assert_can_ship(code, wh, 2), {"ok": False, "message": "出貨後低於安全量"})
		self.assertEqual(assert_can_ship(code, wh, 1), {"ok": True})
		self.assertEqual(flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": wh}, "actual_qty")), 5)

	def test_no_safety_stock_allows_the_shipment(self):
		code, wh = make_item()
		receive(code, wh, 5)
		self.assertEqual(assert_can_ship(code, wh, 5), {"ok": True})

	def test_shell_will_not_ship_below_safety(self):
		from dropout_core import actions

		code, wh = make_item(safety=4)
		receive(code, wh, 5)
		customer = frappe.get_doc(
			{"doctype": "Customer", "customer_name": f"安全量客人 {code}", "customer_group": leaf("Customer Group"), "territory": leaf("Territory")}
		).insert().name
		quote = actions.create_quotation("Customer", customer, [{"item_code": code, "qty": 2, "rate": 10}])
		self.assertTrue(quote["ok"], quote)
		order = actions.advance("Quotation", quote["created"]["name"])
		self.assertTrue(order["ok"], order)
		self.assertEqual(order["created"]["doctype"], "Sales Order")
		refused = actions.advance("Sales Order", order["created"]["name"])
		self.assertFalse(refused["ok"])
		self.assertEqual(refused["message"], "出貨後低於安全量")
		self.assertEqual(flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": wh}, "actual_qty")), 5)
