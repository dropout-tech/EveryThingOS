import base64

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from dropout_core import portal
from dropout_core.tests.test_dropout_flow import company, make_customer, make_item, submit
from dropout_core.tests.test_reports import make_user

# 1×1 transparent PNG.
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="


def make_quotation(rate=1000, qty=2, valid_till=None, submit_it=True):
	q = frappe.get_doc(
		{
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": make_customer("入口客人"),
			"company": company(),
			"transaction_date": nowdate(),
			"valid_till": valid_till or add_days(nowdate(), 30),
			"order_type": "Sales",
			"terms": "<p>付款：<b>月結 30 天</b></p>",
			"items": [{"item_code": make_item(), "qty": qty, "rate": rate}],
		}
	)
	q.insert()
	if submit_it:
		q.submit()
	return q


def make_invoice(rate=500):
	return submit(
		frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": make_customer("入口客人"),
				"company": company(),
				"posting_date": nowdate(),
				"due_date": add_days(nowdate(), 14),
				"items": [{"item_code": make_item(), "qty": 1, "rate": rate}],
			}
		)
	)


class TestPortalDocument(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_presents_a_quotation(self):
		q = make_quotation()
		data = portal.document("Quotation", q.name)
		self.assertEqual(data["kind"], "quote")
		self.assertEqual(data["status"], "open")
		self.assertEqual(data["customer"], q.customer_name)
		self.assertEqual(data["valid_till"], str(q.valid_till))
		self.assertEqual(len(data["lines"]), 1)
		self.assertAlmostEqual(data["lines"][0]["amount"], 2000)
		self.assertAlmostEqual(data["net"], q.net_total)
		self.assertAlmostEqual(data["total"], q.rounded_total or q.grand_total)
		self.assertEqual(data["terms"], "付款：月結 30 天")
		self.assertIsNone(data["accepted"])
		for internal in ("incoming_rate", "valuation_rate", "gross_profit"):
			self.assertNotIn(internal, data["lines"][0])

	def test_only_sales_documents(self):
		for doctype in ("Purchase Invoice", "User", "File"):
			with self.assertRaises(frappe.ValidationError):
				portal.document(doctype, "x")

	def test_draft_cannot_be_shared(self):
		q = make_quotation(submit_it=False)
		with self.assertRaises(frappe.ValidationError):
			portal.document("Quotation", q.name)

	def test_needs_read_permission(self):
		q = make_quotation()
		frappe.set_user(make_user("portal-nobody@example.com", "Stock User"))
		with self.assertRaises(frappe.PermissionError):
			portal.document("Quotation", q.name)

	def test_expired_quotation(self):
		q = make_quotation(valid_till=add_days(nowdate(), 1))
		frappe.db.set_value("Quotation", q.name, "valid_till", add_days(nowdate(), -1))
		self.assertEqual(portal.document("Quotation", q.name)["status"], "expired")

	def test_invoice_shows_outstanding_and_bank(self):
		si = make_invoice()
		data = portal.document("Sales Invoice", si.name)
		self.assertEqual(data["kind"], "invoice")
		self.assertEqual(data["status"], "unpaid")
		self.assertAlmostEqual(data["outstanding"], si.outstanding_amount)
		if not frappe.db.exists("Bank", "入口測試銀行"):
			frappe.get_doc({"doctype": "Bank", "bank_name": "入口測試銀行"}).insert()
		if not frappe.db.exists("Bank Account", {"bank_account_no": "0123456789012"}):
			parent = frappe.db.get_value("Account", {"company": company(), "is_group": 1, "account_type": "Bank"}) or frappe.db.get_value(
				"Account", {"company": company(), "is_group": 1, "root_type": "Asset"}
			)
			ledger = frappe.get_doc({"doctype": "Account", "account_name": "入口測試銀行戶", "parent_account": parent, "company": company(), "account_type": "Bank"}).insert().name
			frappe.get_doc(
				{
					"doctype": "Bank Account",
					"account_name": "入口測試公司",
					"bank": "入口測試銀行",
					"account": ledger,
					"bank_account_no": "0123456789012",
					"branch_code": "0012",
					"is_company_account": 1,
					"company": company(),
					"is_default": 1,
				}
			).insert()
		bank = portal.document("Sales Invoice", si.name)["bank"]
		self.assertEqual(bank["account"], "0123456789012")
		self.assertEqual(bank["bank"], "入口測試銀行")


class TestAcceptQuotation(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_accept_keeps_evidence(self):
		q = make_quotation()
		out = portal.accept_quotation(q.name, "  林 安安 ", signature=f"data:image/png;base64,{PNG}", link="lnk_1", ip_hash="abc", consent=1)
		self.assertEqual(out["status"], "accepted")
		q.reload()
		self.assertEqual(q.dropout_accepted_by, "林 安安")
		self.assertTrue(q.dropout_accepted_at)
		self.assertEqual(q.dropout_acceptance_link, "lnk_1")
		self.assertEqual(q.dropout_acceptance_ip, "abc")
		f = frappe.get_doc("File", {"attached_to_doctype": "Quotation", "attached_to_name": q.name})
		self.assertTrue(f.is_private)
		self.assertEqual(f.file_url, q.dropout_signature)
		comment = frappe.get_all("Comment", filters={"reference_doctype": "Quotation", "reference_name": q.name, "comment_type": "Comment"}, pluck="content")
		self.assertTrue(any("林 安安" in c for c in comment))
		self.assertEqual(portal.document("Quotation", q.name)["status"], "accepted")

	def test_typed_name_alone_counts(self):
		q = make_quotation()
		out = portal.accept_quotation(q.name, "王小明", consent=1)
		self.assertEqual(out["status"], "accepted")
		self.assertIsNone(out["signature"])
		self.assertFalse(frappe.db.exists("File", {"attached_to_doctype": "Quotation", "attached_to_name": q.name}))

	def test_accept_is_idempotent(self):
		q = make_quotation()
		portal.accept_quotation(q.name, "王小明", consent=1)
		again = portal.accept_quotation(q.name, "別人", consent=1)
		self.assertEqual(again["status"], "already_accepted")
		self.assertEqual(again["accepted"]["name"], "王小明")

	def test_refuses_bad_input(self):
		q = make_quotation()
		with self.assertRaises(frappe.ValidationError):
			portal.accept_quotation(q.name, "王", consent=1)
		with self.assertRaises(frappe.ValidationError):
			portal.accept_quotation(q.name, "王小明", consent=0)
		for bad in ("data:image/svg+xml;base64,PHN2Zz4=", base64.b64encode(b"GIF89a....").decode(), "not base64!!", "A" * 500_000):
			with self.assertRaises(frappe.ValidationError):
				portal.accept_quotation(q.name, "王小明", signature=bad, consent=1)
		self.assertFalse(frappe.db.get_value("Quotation", q.name, "dropout_accepted_at"))

	def test_refuses_expired_lost_and_draft(self):
		expired = make_quotation(valid_till=add_days(nowdate(), 1))
		frappe.db.set_value("Quotation", expired.name, "valid_till", add_days(nowdate(), -1))
		with self.assertRaises(frappe.ValidationError):
			portal.accept_quotation(expired.name, "王小明", consent=1)
		lost = make_quotation()
		frappe.db.set_value("Quotation", lost.name, "status", "Lost")
		with self.assertRaises(frappe.ValidationError):
			portal.accept_quotation(lost.name, "王小明", consent=1)
		draft = make_quotation(submit_it=False)
		with self.assertRaises(frappe.ValidationError):
			portal.accept_quotation(draft.name, "王小明", consent=1)

	def test_integration_only(self):
		q = make_quotation()
		frappe.set_user(make_user("portal-sales@example.com", "Sales User"))
		with self.assertRaises(frappe.PermissionError):
			portal.accept_quotation(q.name, "王小明", consent=1)
		with self.assertRaises(frappe.PermissionError):
			portal.payment_link("x")


class TestPaymentLink(FrappeTestCase):
	def test_unavailable_without_gateway(self):
		si = make_invoice()
		if portal._gateway_account(si.company):
			self.skipTest("this site has a Taiwan gateway configured")
		self.assertEqual(portal.payment_link(si.name), {"status": "unavailable"})
		self.assertFalse(portal.document("Sales Invoice", si.name)["online_pay"])

	def test_paid_invoice(self):
		si = make_invoice()
		frappe.db.set_value("Sales Invoice", si.name, "outstanding_amount", 0)
		self.assertEqual(portal.payment_link(si.name), {"status": "paid"})
		self.assertEqual(portal.document("Sales Invoice", si.name)["status"], "paid")
