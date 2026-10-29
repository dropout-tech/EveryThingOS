import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, nowdate

from dropout_core.deposit import record_deposit


def company():
	return frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def leaf(doctype):
	return frappe.get_all(doctype, filters={"is_group": 0}, pluck="name", limit=1)[0]


def make_item(code="DO-TEST-ITEM"):
	if not frappe.db.exists("Item", code):
		frappe.get_doc(
			{"doctype": "Item", "item_code": code, "item_name": code, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 0}
		).insert()
	return code


def make_customer(name="安安商行", tax_id=None, email=None):
	existing = frappe.db.get_value("Customer", {"customer_name": name})
	if existing:
		return existing
	return frappe.get_doc(
		{"doctype": "Customer", "customer_name": name, "customer_group": leaf("Customer Group"), "territory": leaf("Territory"), "tax_id": tax_id, "email_id": email}
	).insert().name


def submit(doc):
	doc.insert()
	doc.submit()
	return doc


def stock_qty(item_code):
	return frappe.get_all("Bin", filters={"item_code": item_code}, pluck="actual_qty")


class TestDeposit(FrappeTestCase):
	def test_deposit_on_uninvoiced_order_does_not_move_stock(self):
		item = make_item("DO-DEPOSIT-ITEM")
		frappe.db.set_value("Item", item, "is_stock_item", 0)
		customer = make_customer("訂金客人")
		order = submit(
			frappe.get_doc(
				{
					"doctype": "Sales Order",
					"customer": customer,
					"company": company(),
					"transaction_date": nowdate(),
					"delivery_date": add_days(nowdate(), 7),
					"items": [{"item_code": item, "qty": 1, "rate": 1000}],
				}
			)
		)
		self.assertEqual(flt(order.grand_total), 1000)
		self.assertEqual(flt(order.total_taxes_and_charges), 0)
		self.assertEqual(flt(order.per_billed), 0)

		before = stock_qty(item)
		self.assertRaises(frappe.ValidationError, record_deposit, order.name, 0)

		result = record_deposit(order.name, 300)
		self.assertTrue(result["ok"], result)
		self.assertEqual(result["advance_paid"], 300)
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order.name, "advance_paid")), 300)
		self.assertEqual(frappe.db.get_value("Payment Entry", result["payment_entry"], "docstatus"), 1)
		self.assertEqual(flt(order.per_billed), 0)

		after = stock_qty(item)
		self.assertEqual(before, after)
		self.assertTrue(not after or all(flt(qty) == 0 for qty in after))

		self.assertRaises(frappe.ValidationError, record_deposit, order.name, 701)
		self.assertEqual(flt(frappe.db.get_value("Sales Order", order.name, "advance_paid")), 300)
