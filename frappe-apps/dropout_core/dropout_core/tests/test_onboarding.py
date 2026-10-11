import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from dropout_core import api
from dropout_core.onboarding import checklist
from dropout_core.tests.test_dropout_flow import company, make_customer, make_item, submit

IDS = ["company", "team", "customers", "items", "first_quotation", "first_payment", "channels", "newsletter", "employees", "einvoice"]


def step(key):
	return next(s for s in checklist()["steps"] if s["id"] == key)


class TestChecklist(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_shape_and_totals(self):
		out = checklist()
		self.assertEqual([s["id"] for s in out["steps"]], IDS)
		used = [s for s in out["steps"] if s["applies"]]
		self.assertEqual(out["total"], len(used))
		self.assertEqual(out["done"], sum(s["done"] for s in used))
		self.assertEqual(step("employees")["applies"], "hrms" in frappe.get_installed_apps())

	def test_company_needs_tax_id(self):
		before = dict(frappe.get_all("Company", fields=["name", "tax_id"], as_list=True))
		for name in before:
			frappe.db.set_value("Company", name, "tax_id", None)
		self.assertFalse(step("company")["done"])
		frappe.db.set_value("Company", company(), "tax_id", "22099131")
		self.assertTrue(step("company")["done"])
		for name, tax_id in before.items():
			frappe.db.set_value("Company", name, "tax_id", tax_id)

	def test_documents_tick_their_steps(self):
		customer = make_customer("清單客人")
		self.assertTrue(step("customers")["done"])
		before = step("first_quotation")["count"]
		submit(
			frappe.get_doc(
				{"doctype": "Quotation", "quotation_to": "Customer", "party_name": customer, "company": company(), "transaction_date": nowdate(), "items": [{"item_code": make_item(), "qty": 1, "rate": 300}]}
			)
		)
		self.assertEqual(step("first_quotation")["count"], before + 1)
		self.assertTrue(step("first_quotation")["done"])

	def test_newsletter_and_einvoice(self):
		from dropout_core import actions

		group = frappe.db.get_value("Email Group", {}) or frappe.get_doc({"doctype": "Email Group", "title": "清單群組"}).insert().name
		self.assertTrue(actions.draft_newsletter("清單電子報", "<p>你好</p>", [group])["ok"])
		self.assertTrue(step("newsletter")["done"])
		si = submit(frappe.get_doc({"doctype": "Sales Invoice", "customer": make_customer("清單發票客人"), "company": company(), "posting_date": nowdate(), "due_date": nowdate(), "items": [{"item_code": make_item(), "qty": 1, "rate": 100}]}))
		api.set_einvoice(si.name, "已開立", number="CD12345678")
		self.assertTrue(step("einvoice")["done"])

	def test_team_counts_people_besides_the_owner(self):
		from dropout_core.team import ensure_role_profiles

		ensure_role_profiles()
		before = step("team")["count"]
		email = f"checklist-{frappe.generate_hash(length=6)}@example.com"
		# Invites always carry a job profile; a user with no desk role is a Website User, not staff.
		frappe.get_doc({"doctype": "User", "email": email, "first_name": "清單", "send_welcome_email": 0, "role_profile_name": "業務"}).insert(ignore_permissions=True)
		self.assertEqual(step("team")["count"], before + 1)
		self.assertTrue(step("team")["done"])

	def test_only_the_owner_may_read_it(self):
		from dropout_core.team import ensure_role_profiles

		ensure_role_profiles()
		email = "checklist-sales@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": "業務", "send_welcome_email": 0, "role_profile_name": "業務"}).insert(ignore_permissions=True)
		frappe.set_user(email)
		with self.assertRaises(frappe.PermissionError):
			api.setup_checklist()
		frappe.set_user("Administrator")
		self.assertEqual(api.setup_checklist()["total"], checklist()["total"])
