import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, nowdate

from dropout_core.returns import return_against_delivery


def company():
	return frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def leaf(doctype):
	return frappe.get_all(doctype, filters={"is_group": 0}, pluck="name", limit=1)[0]


def warehouse(co):
	return frappe.get_all("Warehouse", filters={"company": co, "is_group": 0}, pluck="name", limit=1)[0]


def make_customer(name):
	existing = frappe.db.get_value("Customer", {"customer_name": name})
	if existing:
		return existing
	return (
		frappe.get_doc(
			{"doctype": "Customer", "customer_name": name, "customer_group": leaf("Customer Group"), "territory": leaf("Territory")}
		)
		.insert()
		.name
	)


def make_stock_item(code, co, wh):
	if frappe.db.exists("Item", code):
		return code
	item = frappe.get_doc(
		{"doctype": "Item", "item_code": code, "item_name": code, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 1}
	)
	item.append("item_defaults", {"company": co, "default_warehouse": wh})
	item.insert()
	return code


def bin_qty(item, wh):
	return flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": wh}, "actual_qty"))


def receive(item, wh, co, qty):
	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": co,
			"items": [{"item_code": item, "qty": qty, "t_warehouse": wh, "basic_rate": 50, "uom": "Nos"}],
		}
	)
	doc.insert()
	doc.submit()
	return doc


def ship(customer, item, wh, co, qty, rate):
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

	order = frappe.get_doc(
		{
			"doctype": "Sales Order",
			"customer": customer,
			"company": co,
			"transaction_date": nowdate(),
			"delivery_date": add_days(nowdate(), 7),
			"items": [{"item_code": item, "qty": qty, "rate": rate, "warehouse": wh, "delivery_date": add_days(nowdate(), 7)}],
		}
	)
	order.insert()
	order.submit()
	note = make_delivery_note(order.name)
	note.insert()
	note.submit()
	return note


class TestReturns(FrappeTestCase):
	def test_partial_return_restocks_without_tax(self):
		co = company()
		wh = warehouse(co)
		code = f"DO-RET-{frappe.generate_hash(length=6)}"
		make_stock_item(code, co, wh)
		customer = make_customer(f"退貨客人 {code}")
		receive(code, wh, co, 10)
		note = ship(customer, code, wh, co, 10, 125)
		self.assertEqual(note.items[0].qty, 10)
		self.assertEqual(note.items[0].warehouse, wh)
		self.assertEqual(bin_qty(code, wh), 0)

		with self.assertRaises(frappe.ValidationError):
			return_against_delivery("DN-NO-SUCH", 1)
		with self.assertRaises(frappe.ValidationError):
			return_against_delivery(note.name, 0)
		with self.assertRaises(frappe.ValidationError):
			return_against_delivery(note.name, 11)
		self.assertEqual(bin_qty(code, wh), 0)

		returned = return_against_delivery(note.name, 2)
		returned.reload()
		self.assertEqual(returned.docstatus, 1)
		self.assertEqual(returned.is_return, 1)
		self.assertEqual(returned.return_against, note.name)
		self.assertEqual(returned.items[0].dn_detail, note.items[0].name)
		self.assertEqual(returned.items[0].qty, -2)
		self.assertEqual(returned.items[0].warehouse, note.items[0].warehouse)
		self.assertEqual(returned.items[0].rate, note.items[0].rate)
		self.assertEqual(returned.total_taxes_and_charges, 0)
		self.assertFalse(returned.taxes)
		self.assertEqual(bin_qty(code, wh), 2)

		with self.assertRaises(frappe.ValidationError):
			return_against_delivery(note.name, 9)
		self.assertEqual(bin_qty(code, wh), 2)
