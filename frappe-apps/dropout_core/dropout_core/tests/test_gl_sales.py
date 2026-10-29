import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from dropout_core.shell import books


def company():
	return frappe.defaults.get_user_default("company") or frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def leaf(doctype):
	return frappe.get_all(doctype, filters={"is_group": 0}, pluck="name", limit=1)[0]


def make_item(code):
	if not frappe.db.exists("Item", code):
		frappe.get_doc(
			{"doctype": "Item", "item_code": code, "item_name": code, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 0}
		).insert()
	return code


def make_customer(name):
	existing = frappe.db.get_value("Customer", {"customer_name": name})
	if existing:
		return existing
	return frappe.get_doc(
		{"doctype": "Customer", "customer_name": name, "customer_group": leaf("Customer Group"), "territory": leaf("Territory")}
	).insert().name


def ledger_income_account(co):
	"""Company default income account, or a non-group account under it when the default is a group."""
	root = frappe.db.get_value("Company", co, "default_income_account")
	if not root:
		return None
	row = frappe.db.get_value("Account", root, ["is_group", "lft", "rgt"], as_dict=True)
	if not row or not row.is_group:
		return root
	names = frappe.get_all(
		"Account",
		filters={"company": co, "is_group": 0, "lft": [">", row.lft], "rgt": ["<", row.rgt]},
		pluck="name",
		order_by="lft asc",
		limit=1,
	)
	return names[0] if names else root


def submit_untaxed_invoice(amount=1000):
	co = company()
	income = ledger_income_account(co)
	doc = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"customer": make_customer(f"未稅銷貨-{frappe.generate_hash(length=6)}"),
			"company": co,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			"ignore_pricing_rule": 1,
			"items": [
				{
					"item_code": make_item(f"DO-GL-{frappe.generate_hash(length=6)}"),
					"qty": 1,
					"rate": amount,
					**({"income_account": income} if income else {}),
				}
			],
		}
	)
	doc.flags.dont_auto_add_taxes = True
	doc.insert()
	doc.taxes_and_charges = ""
	doc.set("taxes", [])
	doc.flags.dont_auto_add_taxes = True
	doc.calculate_taxes_and_totals()
	doc.save()
	doc.flags.dont_auto_add_taxes = True
	doc.submit()
	return doc


class TestGLSales(FrappeTestCase):
	def test_month_sales_includes_untaxed_invoice(self):
		before = books()["month_sales"]
		invoice = submit_untaxed_invoice(1000)
		after = books()["month_sales"]
		self.assertEqual(flt(invoice.total_taxes_and_charges), 0)
		self.assertAlmostEqual(invoice.base_net_total, 1000)
		self.assertAlmostEqual(after - before, invoice.base_net_total)
		self.assertTrue(frappe.db.exists("GL Entry", {"voucher_type": "Sales Invoice", "voucher_no": invoice.name, "is_cancelled": 0}))
