import base64
import unittest

import frappe
from frappe.model.workflow import apply_workflow, get_workflow_name
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from dropout_core import approvals
from dropout_core.tests.test_dropout_flow import company, leaf, make_customer, make_item
from dropout_core.tests.test_reports import make_user

HAS_HRMS = "hrms" in frappe.get_installed_apps()
# A real 1×1 PNG: Frappe opens image attachments on save, so made-up bytes fail.
RECEIPT_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC")


def make_supplier(name="核准測試供應商"):
	existing = frappe.db.get_value("Supplier", {"supplier_name": name})
	if existing:
		return existing
	return frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": leaf("Supplier Group")}).insert().name


def make_po(rate, qty=1):
	"""As whoever is logged in; the supplier and item are master data only managers may create."""
	user = frappe.session.user
	frappe.set_user("Administrator")
	supplier, item, co = make_supplier(), make_item(), company()
	frappe.set_user(user)
	return frappe.get_doc(
		{
			"doctype": "Purchase Order",
			"supplier": supplier,
			"company": co,
			"transaction_date": nowdate(),
			"schedule_date": add_days(nowdate(), 7),
			"items": [{"item_code": item, "qty": qty, "rate": rate, "schedule_date": add_days(nowdate(), 7)}],
		}
	).insert()


def card(user, doctype, name):
	frappe.set_user(user)
	return next((c for c in approvals.inbox()["items"] if c["doctype"] == doctype and c["name"] == name), None)


class TestWorkflowRules(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.buyer = make_user("approvals-buyer@example.com", "Purchase User")
		self.boss = make_user("approvals-boss@example.com", "Purchase User", "Purchase Manager")
		approvals.configure("purchase", 1, 1000)

	def tearDown(self):
		frappe.set_user("Administrator")
		approvals.configure("purchase", 0)

	def test_rows_follow_threshold_and_forbid_self_approval(self):
		states, transitions = approvals.workflow_rows("purchase", 1234)
		names = {s["state"] for s in states}
		self.assertTrue(all(t["state"] in names and t["next_state"] in names for t in transitions))
		decisions = [t for t in transitions if t["action"] in (approvals.OK, approvals.BACK)]
		self.assertEqual({t["state"] for t in decisions}, {approvals.PENDING})
		self.assertTrue(all(t["allow_self_approval"] == 0 and t["allowed"] == "Purchase Manager" for t in decisions))
		self.assertIn("doc.base_grand_total > 1234.0", [t["condition"] for t in transitions])

	def test_configure_is_idempotent(self):
		approvals.configure("purchase", 1, 2000)
		approvals.configure("purchase", 1, 2000)
		name = approvals.RULES["purchase"]["workflow"]
		self.assertEqual(frappe.db.count("Workflow", {"name": name}), 1)
		self.assertEqual(get_workflow_name("Purchase Order"), name)
		wf = frappe.get_doc("Workflow", name)
		self.assertEqual(len(wf.transitions), len(approvals.workflow_rows("purchase", 2000)[1]))
		rule = next(r for r in approvals.settings() if r["id"] == "purchase")
		self.assertTrue(rule["active"])
		self.assertEqual(rule["threshold"], 2000)

	def test_switch_off(self):
		approvals.configure("purchase", 0)
		self.assertFalse(get_workflow_name("Purchase Order"))
		po = make_po(5000)
		po.submit()
		self.assertEqual(po.docstatus, 1)

	def test_threshold_is_validated(self):
		for bad in (0, -5, 10**12):
			with self.assertRaises(frappe.ValidationError):
				approvals.configure("purchase", 1, bad)
		with self.assertRaises(frappe.ValidationError):
			approvals.configure("nope", 1, 10)

	def test_only_admin_configures(self):
		frappe.set_user(self.boss)
		with self.assertRaises(frappe.PermissionError):
			approvals.configure("purchase", 0)

	def test_does_not_replace_another_workflow(self):
		approvals.configure("purchase", 0)
		states, transitions = approvals.workflow_rows("purchase", 10)
		other = frappe.get_doc(
			{"doctype": "Workflow", "workflow_name": "別人的採購流程", "document_type": "Purchase Order", "is_active": 1, "workflow_state_field": "workflow_state", "states": states, "transitions": transitions}
		).insert()
		frappe.cache.hdel("workflow", "Purchase Order")
		try:
			with self.assertRaises(frappe.ValidationError):
				approvals.configure("purchase", 1, 10)
			self.assertEqual(next(r for r in approvals.settings() if r["id"] == "purchase")["other"], other.name)
		finally:
			other.delete()
			frappe.cache.hdel("workflow", "Purchase Order")

	def test_small_order_goes_straight_through(self):
		frappe.set_user(self.buyer)
		po = make_po(500)
		self.assertIsNone(approvals.submit_or_send(po))
		po.reload()
		self.assertEqual(po.docstatus, 1)
		self.assertEqual(po.workflow_state, approvals.APPROVED)

	def test_large_order_waits_for_the_manager(self):
		frappe.set_user(self.buyer)
		po = make_po(800, qty=5)
		with self.assertRaises(frappe.ValidationError):
			po.submit()
		po.reload()
		self.assertEqual(approvals.submit_or_send(po), approvals.PENDING)
		po.reload()
		self.assertEqual(po.workflow_state, approvals.PENDING)

		self.assertIsNone(card(self.buyer, "Purchase Order", po.name))
		with self.assertRaises(frappe.PermissionError):
			approvals.decide("Purchase Order", po.name, approvals.OK)

		item = card(self.boss, "Purchase Order", po.name)
		self.assertIsNotNone(item)
		self.assertEqual(item["kind"], "purchase")
		self.assertEqual(item["amount"], 4000)
		self.assertEqual({a["action"]: a["kind"] for a in item["actions"]}, {approvals.OK: "approve", approvals.BACK: "reject"})

		self.assertFalse(approvals.decide("Purchase Order", po.name, approvals.BACK)["ok"])
		self.assertTrue(approvals.decide("Purchase Order", po.name, approvals.BACK, reason="廠商報價太高，再問一家")["ok"])
		po.reload()
		self.assertEqual(po.workflow_state, approvals.RETURNED)

		frappe.set_user(self.buyer)
		mine = next(m for m in approvals.inbox()["mine"] if m["name"] == po.name)
		self.assertEqual(mine["tone"], "danger")
		self.assertIn("再問一家", mine["note"])
		apply_workflow(po, approvals.ASK)

		frappe.set_user(self.boss)
		self.assertTrue(approvals.decide("Purchase Order", po.name, approvals.OK)["ok"])
		po.reload()
		self.assertEqual(po.docstatus, 1)
		self.assertFalse(approvals.decide("Purchase Order", po.name, approvals.OK)["ok"])

	def test_manager_sends_own_order(self):
		frappe.set_user(self.boss)
		po = make_po(9000)
		self.assertIsNone(approvals.submit_or_send(po))
		self.assertEqual(frappe.db.get_value("Purchase Order", po.name, "docstatus"), 1)

	def test_unknown_doctype_is_refused(self):
		customer = make_customer()
		frappe.set_user(self.boss)
		self.assertFalse(approvals.decide("Customer", customer, "核准")["ok"])
		with self.assertRaises(frappe.ValidationError):
			approvals.decide("Purchase Order", "no-such-po", approvals.OK)


class TestQuotationDiscount(FrappeTestCase):
	def test_item_and_order_discounts_add_up(self):
		q = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": make_customer(),
				"company": company(),
				"transaction_date": nowdate(),
				"items": [{"item_code": make_item(), "qty": 2, "price_list_rate": 1000, "rate": 900}],
			}
		)
		q.run_method("set_missing_values")
		q.items[0].price_list_rate, q.items[0].rate = 1000, 900
		q.additional_discount_percentage = 10
		q.insert()
		self.assertAlmostEqual(q.dropout_discount_percent, 19, places=0)


@unittest.skipUnless(HAS_HRMS, "Expense Claim lives in HRMS")
class TestExpenseClaims(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		co = company()
		payable = frappe.get_all("Account", filters={"company": co, "account_type": "Payable", "is_group": 0}, pluck="name", limit=1)
		if payable:
			frappe.db.set_value("Company", co, "default_expense_claim_payable_account", payable[0])
		approvals.ensure_expense_types(co)
		fallback = frappe.get_all("Account", filters={"company": co, "root_type": "Expense", "is_group": 0}, pluck="name", limit=1)[0]
		for label in approvals.CATEGORIES:
			t = frappe.get_doc("Expense Claim Type", label)
			if not any(a.company == co for a in t.accounts):
				t.append("accounts", {"company": co, "default_account": fallback})
				t.save()
		cls.staff = make_user("approvals-staff@example.com", "Employee")
		cls.hr = make_user("approvals-hr@example.com", "HR Manager", "Employee")
		if not frappe.db.exists("Employee", {"user_id": cls.staff}):
			frappe.get_doc(
				{
					"doctype": "Employee",
					"first_name": "報帳測試",
					"gender": frappe.get_all("Gender", pluck="name", limit=1)[0],
					"date_of_birth": "1990-01-01",
					"date_of_joining": "2020-01-01",
					"company": co,
					"user_id": cls.staff,
					"status": "Active",
				}
			).insert()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_types_are_created_once(self):
		approvals.ensure_expense_types(company())
		self.assertEqual(approvals.ensure_expense_types(company()), [])
		for label in approvals.CATEGORIES:
			self.assertTrue(frappe.db.exists("Expense Claim Type", label))

	def test_input_is_validated(self):
		frappe.set_user(self.staff)
		for args in ((0, nowdate(), "交通"), (-10, nowdate(), "交通"), (10**7, nowdate(), "交通"), (100, add_days(nowdate(), 1), "交通"), (100, add_days(nowdate(), -400), "交通"), (100, nowdate(), "旅遊"), (100, "昨天", "交通"), (100, None, "交通")):
			with self.assertRaises(frappe.ValidationError):
				approvals.new_expense(*args)

	def test_file_approve_and_own_is_refused(self):
		frappe.set_user(self.staff)
		result = approvals.new_expense(1240, nowdate(), "交通", "高鐵來回 <b>台中</b>")
		self.assertTrue(result["ok"], result)
		name = result["created"]["name"]
		claim = frappe.get_doc("Expense Claim", name)
		self.assertEqual(claim.expenses[0].sanctioned_amount, 1240)
		self.assertEqual(claim.remark, "高鐵來回 台中")
		self.assertEqual(approvals.inbox()["mine"][0]["status"], "等核准")
		with self.assertRaises(frappe.PermissionError):
			approvals.decide("Expense Claim", name, "approve")

		item = card(self.hr, "Expense Claim", name)
		self.assertIsNotNone(item)
		self.assertEqual(item["amount"], 1240)
		self.assertTrue(approvals.decide("Expense Claim", name, "approve")["ok"])
		claim.reload()
		self.assertEqual((claim.docstatus, claim.approval_status), (1, "Approved"))

	def test_reject_needs_reason(self):
		frappe.set_user(self.staff)
		name = approvals.new_expense(300, nowdate(), "文具")["created"]["name"]
		frappe.set_user(self.hr)
		self.assertFalse(approvals.decide("Expense Claim", name, "reject")["ok"])
		self.assertTrue(approvals.decide("Expense Claim", name, "reject", "請附發票")["ok"])
		frappe.set_user(self.staff)
		mine = next(m for m in approvals.inbox()["mine"] if m["name"] == name)
		self.assertEqual((mine["status"], mine["note"]), ("退回", "請附發票"))

	def test_receipt_follows_document_access(self):
		frappe.set_user(self.staff)
		name = approvals.new_expense(180, nowdate(), "郵資")["created"]["name"]
		f = frappe.get_doc({"doctype": "File", "file_name": "receipt.png", "attached_to_doctype": "Expense Claim", "attached_to_name": name, "is_private": 1, "content": RECEIPT_PNG}).insert()
		approvals.receipt(f.name)
		self.assertEqual(frappe.response.filecontent, RECEIPT_PNG)
		frappe.set_user("Administrator")
		frappe.set_user(make_user("approvals-other@example.com", "Sales User"))
		with self.assertRaises(frappe.PermissionError):
			approvals.receipt(f.name)
