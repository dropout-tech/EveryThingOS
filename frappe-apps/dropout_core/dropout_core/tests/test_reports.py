import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from dropout_core import reports
from dropout_core.tests.test_dropout_flow import company, leaf, make_customer, make_item, submit


def make_user(email, *roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}).insert(ignore_permissions=True)
	frappe.get_doc("User", email).add_roles(*roles)
	return email


def this_month(rows):
	return next(r for r in rows if r["month"] == nowdate()[:7])


class TestOwnerReports(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_overview_as_admin(self):
		customer = make_customer("報表客人")
		before = reports.overview()
		si = submit(frappe.get_doc({"doctype": "Sales Invoice", "customer": customer, "company": company(), "posting_date": nowdate(), "due_date": nowdate(), "items": [{"item_code": make_item(), "qty": 2, "rate": 750}]}))
		data = reports.overview()
		self.assertEqual(data["denied"], [])
		self.assertEqual(data["failed"], [])
		self.assertEqual(len(data["revenue"]), 12)
		self.assertEqual(len(data["margin"]), 12)
		self.assertAlmostEqual(this_month(data["revenue"])["amount"] - this_month(before["revenue"])["amount"], si.base_net_total)
		self.assertAlmostEqual(this_month(data["margin"])["revenue"] - this_month(before["margin"])["revenue"], si.base_net_total)
		self.assertIn(customer, [c["customer"] for c in data["top_customers"]])
		self.assertLessEqual(len(data["top_customers"]), 10)
		self.assertAlmostEqual(data["aging"]["total"] - before["aging"]["total"], si.outstanding_amount)
		self.assertAlmostEqual(data["aging"]["d0_30"] - before["aging"]["d0_30"], si.outstanding_amount)
		self.assertEqual(set(data["pipeline"]), {"lead", "opportunity", "quotation", "sales_order"})
		self.assertIsInstance(data["low_stock"], list)

	def test_returns_are_netted(self):
		from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

		customer = make_customer("報表退貨客人")
		si = submit(frappe.get_doc({"doctype": "Sales Invoice", "customer": customer, "company": company(), "posting_date": nowdate(), "due_date": nowdate(), "items": [{"item_code": make_item(), "qty": 4, "rate": 100}]}))
		before = this_month(reports.overview()["revenue"])["amount"]
		credit = make_sales_return(si.name)
		credit.insert()
		credit.submit()
		self.assertAlmostEqual(this_month(reports.overview()["revenue"])["amount"], before - si.base_net_total)

	def test_low_stock_uses_reorder_level(self):
		code = f"DO-REORDER-{frappe.generate_hash(length=6)}"
		warehouse = frappe.get_all("Warehouse", filters={"company": company(), "is_group": 0}, pluck="name", limit=1)[0]
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code,
				"item_group": leaf("Item Group"),
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"reorder_levels": [{"warehouse": warehouse, "warehouse_reorder_level": 10, "warehouse_reorder_qty": 20, "material_request_type": "Purchase"}],
			}
		).insert()
		row = next(r for r in reports.overview()["low_stock"] if r["item_code"] == code)
		self.assertEqual(row["reorder_level"], 10)
		self.assertEqual(row["projected"], 0)
		self.assertEqual(row["href"], f"/app/item/{code}")

	def test_months_are_validated(self):
		self.assertEqual(len(reports.overview(months="6")["revenue"]), 6)
		for bad in (0, 25, "abc", "-3", "6; drop"):
			with self.assertRaises(frappe.ValidationError):
				reports.overview(months=bad)

	def test_only_owner_manager_accounts_roles(self):
		frappe.set_user(make_user("report-sales@example.com", "Sales User"))
		with self.assertRaises(frappe.PermissionError):
			reports.overview()

	def test_sales_manager_gets_sections_it_may_read(self):
		frappe.set_user(make_user("report-manager@example.com", "Sales Manager"))
		data = reports.overview()
		self.assertNotIn("pipeline", data["denied"])
		self.assertIsNotNone(data["pipeline"])
		self.assertIn("margin", data["denied"])
		self.assertIsNone(data["margin"])
