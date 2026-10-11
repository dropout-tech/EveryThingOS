import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from dropout_core import api
from dropout_core.checks import run_all
from dropout_core.install import configure_glue
from dropout_core.taiwan import is_valid_tax_id, normalize_phone


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


class TestTaiwan(FrappeTestCase):
	def test_tax_id(self):
		self.assertTrue(is_valid_tax_id("22099131"))
		self.assertFalse(is_valid_tax_id("22099132"))
		self.assertFalse(is_valid_tax_id("1234567"))

	def test_phone(self):
		self.assertEqual(normalize_phone("0912-345-678"), "+886912345678")
		self.assertEqual(normalize_phone("+886 2 2345 6789"), "+886223456789")
		self.assertIsNone(normalize_phone("abc"))

	def test_customer_rejects_bad_tax_id(self):
		self.assertRaises(frappe.ValidationError, make_customer, "壞統編公司", "22099132")
		self.assertTrue(make_customer("好統編公司", "22099131"))


class TestIdentityAndConsent(FrappeTestCase):
	def test_resolve_party_is_idempotent(self):
		first = api.resolve_party("line", "U-test-1", source_account="oa-1", display_name="林安安")
		second = api.resolve_party("line", "U-test-1", source_account="oa-1")
		self.assertTrue(first["created"])
		self.assertFalse(second["created"])
		self.assertEqual(first["party"], second["party"])
		other_account = api.resolve_party("line", "U-test-1", source_account="oa-2")
		self.assertNotEqual(other_account["party"], first["party"])

	def test_record_event_is_idempotent(self):
		a = api.record_event("message_received", "chatwoot:conv:1", channel="line", external_id="U1")
		b = api.record_event("message_received", "chatwoot:conv:1", channel="line", external_id="U1")
		self.assertTrue(a["created"])
		self.assertFalse(b["created"])
		self.assertEqual(a["event"], b["event"])

	def test_double_opt_in_then_unsubscribe(self):
		lead = api.capture_lead("form-1", "AnAn@Example.com", display_name="林安安", consent_marketing=1, wording_version="v1")
		self.assertTrue(lead["consent_token"])
		again = api.capture_lead("form-1", "anan@example.com", consent_marketing=1)
		self.assertEqual(again["consent_token"], lead["consent_token"])
		self.assertFalse(frappe.db.exists("Email Group Member", {"email_group": "新朋友", "email": "anan@example.com"}))

		api.confirm_consent(lead["consent_token"])
		self.assertTrue(frappe.db.exists("Email Group Member", {"email_group": "新朋友", "email": "anan@example.com", "unsubscribed": 0}))
		self.assertEqual(frappe.db.get_value("DropOut Identity", {"channel": "email", "external_id": "anan@example.com"}, "verified"), 1)

		api.resolve_party("line", "U-anan", display_name="安安")
		line_ident = frappe.db.get_value("DropOut Identity", {"external_id": "U-anan"}, "name")
		frappe.db.set_value("DropOut Identity", line_ident, {"party_type": lead["party_type"], "party": lead["party"]})

		result = api.unsubscribe(email="anan@example.com", source="line")
		self.assertIn("anan@example.com", result["emails"])
		self.assertEqual([i["external_id"] for i in result["identities"]], ["U-anan"])
		self.assertEqual(frappe.db.get_value("Email Group Member", {"email_group": "新朋友", "email": "anan@example.com"}, "unsubscribed"), 1)
		self.assertEqual(frappe.db.get_value("DropOut Consent", {"token": lead["consent_token"]}, "status"), "withdrawn")
		self.assertTrue(frappe.db.exists("Email Unsubscribe", {"email": "anan@example.com", "global_unsubscribe": 1}))

	def test_merge_and_undo(self):
		a = api.resolve_party("ig", "ig-merge-a", display_name="A")
		b = api.resolve_party("fb", "fb-merge-b", display_name="B")
		api.merge_parties(a["party_type"], a["party"], b["party_type"], b["party"])
		self.assertEqual(frappe.db.get_value("DropOut Identity", a["identity"], "party"), b["party"])
		self.assertEqual(api.undo_merge(a["party_type"], a["party"])["restored"], 1)
		self.assertEqual(frappe.db.get_value("DropOut Identity", a["identity"], "party"), a["party"])

	def test_letter_events_and_bounce(self):
		make_customer("點信客人", email="reader@example.com")
		opened = api.record_letter_event("clicked", "evt-1", "reader@example.com", url="https://example.com/new")
		self.assertTrue(opened["created"])
		self.assertFalse(api.record_letter_event("clicked", "evt-1", "reader@example.com")["created"])
		api.mark_bounced("reader@example.com", "msg-1", reason="mailbox full")
		self.assertTrue(frappe.db.exists("Email Unsubscribe", {"email": "reader@example.com", "global_unsubscribe": 1}))


class TestSalesLoop(FrappeTestCase):
	def test_documents_emit_events(self):
		item = make_item()
		customer = make_customer("迴圈客人", email="loop@example.com")
		co = company()
		quotation = submit(
			frappe.get_doc(
				{"doctype": "Quotation", "quotation_to": "Customer", "party_name": customer, "company": co, "transaction_date": nowdate(), "items": [{"item_code": item, "qty": 1, "rate": 1000}]}
			)
		)
		order = submit(
			frappe.get_doc(
				{"doctype": "Sales Order", "customer": customer, "company": co, "transaction_date": nowdate(), "delivery_date": add_days(nowdate(), 7), "items": [{"item_code": item, "qty": 1, "rate": 1000, "prevdoc_docname": quotation.name}]}
			)
		)
		from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice

		invoice = make_sales_invoice(order.name)
		invoice.insert()
		invoice.submit()

		kinds = {
			e.event_type
			for e in frappe.get_all("DropOut Event", filters={"party": customer}, fields=["event_type"])
		}
		self.assertTrue({"quote_sent", "won", "invoiced"} <= kinds)

		api.set_einvoice(invoice.name, "已開立", number="AB12345678")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice.name, "dropout_einvoice_number"), "AB12345678")

		card = api.party_card("Customer", customer)
		self.assertEqual(card["outstanding"], invoice.outstanding_amount)
		self.assertTrue(card["events"])

	def test_segments_follow_payment(self):
		lead = api.capture_lead("form-seg", "buyer@example.com", consent_marketing=1)
		api.confirm_consent(lead["consent_token"])
		api.update_segments("paid", lead["party_type"], lead["party"])
		self.assertFalse(frappe.db.exists("Email Group Member", {"email_group": "新朋友", "email": "buyer@example.com"}))
		self.assertTrue(frappe.db.exists("Email Group Member", {"email_group": "老客人", "email": "buyer@example.com"}))


class TestSetup(FrappeTestCase):
	def test_configure_glue_creates_native_webhook(self):
		name = configure_glue("https://glue.example.com/", "s3cret")
		hook = frappe.get_doc("Webhook", name)
		self.assertEqual(hook.webhook_doctype, "DropOut Event")
		self.assertTrue(hook.request_url.startswith("https://glue.example.com/erpnext/events?site="))
		from frappe.integrations.doctype.webhook.webhook import get_webhook_data

		event = frappe.get_doc("DropOut Event", api.record_event("paid", "glue-test:1", payload={"amount": 5})["event"])
		data = get_webhook_data(event, hook)
		self.assertEqual(data["event_type"], "paid")
		self.assertEqual(data["idempotency_key"], "glue-test:1")

	def test_pack_waits_for_setup_wizard(self):
		from unittest import mock

		from dropout_core import packs

		with mock.patch("frappe.is_setup_complete", return_value=False):
			self.assertIn("deferred", packs.install_from_app("dropout_pack_make"))
		self.assertIn("dropout_pack_make", packs.installed_packs())
		packs.after_setup_wizard({})
		self.assertTrue(frappe.db.exists("Sales Stage", "詢價"))

	def test_import_check_and_status(self):
		bad = make_customer("檢查用公司")
		frappe.db.set_value("Customer", bad, "tax_id", "11111111")
		checks = {i["check"] for i in run_all()}
		self.assertIn("統編檢查碼錯誤", checks)
		status = api.setup_status()
		self.assertEqual(status["total"], len(status["steps"]))
		self.assertTrue(next(s for s in status["steps"] if s["id"] == "company")["done"])


class TestMeetingsAndImport(FrappeTestCase):
	def test_record_meeting_finds_party_from_attendees(self):
		customer = make_customer("會議客人", email="meet@example.com")
		first = api.record_meeting("abc-defg-hij", "google_meet", "確認打樣數量 200 件", attendees=["someone@else.com", "Meet@Example.com"])
		again = api.record_meeting("abc-defg-hij", "google_meet", "確認打樣數量 200 件", attendees=["meet@example.com"])
		self.assertTrue(first["created"])
		self.assertFalse(again["created"])
		self.assertEqual(frappe.db.get_value("DropOut Event", first["event"], "party"), customer)
		comments = frappe.get_all("Comment", filters={"reference_doctype": "Customer", "reference_name": customer, "content": ["like", "%打樣數量%"]})
		self.assertEqual(len(comments), 1)

	def test_opening_stock_is_submitted_once(self):
		import os
		import tempfile

		from dropout_core.provisioning import opening_stock

		code = f"DO-STOCK-{frappe.generate_hash(length=6)}"
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 1}).insert()
		co = company()
		warehouse = frappe.get_all("Warehouse", filters={"company": co, "is_group": 0}, pluck="name", limit=1)[0]
		header = "company,purpose,posting_date,set_posting_time,items.item_code,items.warehouse,items.qty,items.valuation_rate\n"
		with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8-sig") as fh:
			fh.write(header + f"{co},Opening Stock,{nowdate()},1,{code},{warehouse},37,5\n")
		try:
			first = opening_stock(fh.name)
			self.assertEqual(first["status"], "submitted")
			self.assertEqual(opening_stock(fh.name)["status"], "already_done")
			self.assertEqual(frappe.db.get_value("Bin", {"item_code": code, "warehouse": warehouse}, "actual_qty"), 37)
		finally:
			os.unlink(fh.name)


class TestShellReadModels(FrappeTestCase):
	def test_books_people_letter_as_admin(self):
		from dropout_core import shell

		customer = make_customer("殼客人", email="shell@example.com")
		order = submit(
			frappe.get_doc(
				{"doctype": "Sales Order", "customer": customer, "company": company(), "transaction_date": nowdate(), "delivery_date": add_days(nowdate(), 3), "items": [{"item_code": make_item(), "qty": 2, "rate": 500}]}
			)
		)
		books = shell.books()
		self.assertEqual(books["denied"], [])
		self.assertIn(order.name, [d["no"] for d in books["sales"]])
		self.assertEqual(next(d for d in books["sales"] if d["no"] == order.name)["href"], f"/app/sales-order/{order.name}")
		for key in ("month_sales", "ar", "ap", "cash", "inventory_value", "stock", "ar_aging", "journals", "einvoices", "pnl"):
			self.assertIn(key, books)
		self.assertIn(customer, [p["party"] for p in shell.people()])
		letter = shell.letter()
		self.assertIn("新朋友", [g["name"] for g in letter["groups"]])
		self.assertEqual(set(letter["consent"]), {"granted", "pending", "withdrawn"})
		self.assertEqual(shell.whoami()["user"], "Administrator")

	def test_books_lists_denied_sections_for_a_sales_user(self):
		from dropout_core import shell

		email = "sales-only@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": "Sales", "send_welcome_email": 0}).insert(ignore_permissions=True)
		user = frappe.get_doc("User", email)
		user.add_roles("Sales User")
		frappe.set_user(email)
		try:
			books = shell.books()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("journals", books["denied"])
		self.assertIn("Purchase Order", books["denied"])
		self.assertNotIn("sales", books["denied"])
		self.assertNotIn("Sales Order", books["denied"])


class TestWebsite(FrappeTestCase):
	def test_publish_items_to_webshop(self):
		from dropout_core.website import publish_items

		code = make_item("DO-WEB-ITEM")
		result = publish_items()
		if result.get("skipped"):
			self.skipTest(result["skipped"])
		self.assertTrue(frappe.db.exists("Website Item", {"item_code": code}))
		self.assertNotIn(code, publish_items()["published"])
