import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from dropout_core import api
from dropout_core.checks import run_all, summary
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
		totals = summary()
		self.assertGreaterEqual(totals["counts"]["Customer"], 1)
		self.assertGreaterEqual(totals["by_check"]["統編檢查碼錯誤"], 1)
		self.assertEqual(totals["issues"], sum(totals["by_check"].values()))
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
		row = next(d for d in books["sales"] if d["no"] == order.name)
		self.assertEqual(row["href"], f"/app/sales-order/{order.name}")
		self.assertEqual(row["date"], nowdate())
		self.assertEqual(row["due"], add_days(nowdate(), 3))
		for key in ("month_sales", "ar", "ap", "cash", "inventory_value", "stock", "ar_aging", "journals", "einvoices", "pnl"):
			self.assertIn(key, books)
		self.assertIn(customer, [p["party"] for p in shell.people()])
		letter = shell.letter()
		self.assertIn("新朋友", [g["name"] for g in letter["groups"]])
		self.assertEqual(set(letter["consent"]), {"granted", "pending", "withdrawn"})
		self.assertEqual(shell.whoami()["user"], "Administrator")

	def test_oauth_client_and_chatwoot_link(self):
		from dropout_core.provisioning import create_oauth_client, link_chatwoot_user

		first = create_oauth_client("https://a.example/api/auth/callback", app_name="DropOut OS test")
		second = create_oauth_client("https://b.example/api/auth/callback", app_name="DropOut OS test")
		self.assertEqual(first["client_id"], second["client_id"])
		self.assertEqual(sorted(second["redirect_uris"]), ["https://a.example/api/auth/callback", "https://b.example/api/auth/callback"])
		self.assertEqual(frappe.db.get_value("OAuth Client", first["client_id"], "skip_authorization"), 1)
		self.assertTrue(link_chatwoot_user("Administrator", 7)["linked"])
		from dropout_core import shell

		frappe.clear_document_cache("User", "Administrator")
		self.assertEqual(shell.whoami()["chatwoot_user_id"], "7")
		self.assertFalse(link_chatwoot_user("nobody@example.com", 7)["linked"])

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


class TestShellActions(FrappeTestCase):
	def test_quote_to_cash_from_the_shell(self):
		from dropout_core import actions, shell

		customer = make_customer("殼動作客人", email="act@example.com")
		q = actions.create_quotation("Customer", customer, [{"item_code": make_item(), "qty": 3, "rate": 200}])
		self.assertTrue(q["ok"], q)
		self.assertEqual(q["created"]["grand_total"], frappe.db.get_value("Quotation", q["created"]["name"], "grand_total"))
		self.assertIn(q["created"]["name"], [d["no"] for d in shell.books()["sales"]])

		chain = [("Quotation", q["created"]["name"])]
		for _ in range(4):
			step = actions.advance(*chain[-1])
			if not step["ok"]:
				break
			chain.append((step["created"]["doctype"], step["created"]["name"]))
		kinds = [dt for dt, _n in chain]
		self.assertEqual(kinds[0], "Quotation")
		self.assertIn("Sales Order", kinds)
		self.assertIn("Sales Invoice", kinds)
		self.assertEqual(kinds[-1], "Payment Entry")
		invoice = next(n for dt, n in chain if dt == "Sales Invoice")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount"), 0)
		again = actions.advance("Sales Invoice", invoice)
		self.assertFalse(again["ok"])
		self.assertEqual(again["message"], "這張單已經走完了")

	def test_sales_user_cannot_take_payment(self):
		from dropout_core import actions

		customer = make_customer("殼權限客人")
		si = submit(frappe.get_doc({"doctype": "Sales Invoice", "customer": customer, "company": company(), "posting_date": nowdate(), "due_date": nowdate(), "items": [{"item_code": make_item(), "qty": 1, "rate": 100}]}))
		email = "sales-only@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": "Sales", "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", email).add_roles("Sales User")
		frappe.set_user(email)
		try:
			with self.assertRaises(frappe.PermissionError):
				actions.advance("Sales Invoice", si.name)
		finally:
			frappe.set_user("Administrator")

	def test_create_lead_returns_known_person(self):
		from dropout_core import actions

		tag = frappe.generate_hash(length=6)
		first = actions.create_lead("手動新客人", email=f"Manual-{tag}@Example.com", notes="展場認識")
		self.assertTrue(first["ok"])
		self.assertFalse(first["existing"])
		second = actions.create_lead("同一個人", email=f"manual-{tag}@example.com")
		self.assertTrue(second["existing"])
		self.assertEqual(second["party"], first["party"])

	def test_new_customers_and_leads_emit_events_for_webhooks(self):
		from dropout_core import actions

		tag = frappe.generate_hash(length=6)
		customer = make_customer(f"建檔客人 {tag}")
		self.assertTrue(frappe.db.exists("DropOut Event", {"idempotency_key": f"Customer:{customer}:customer_created"}))
		lead = actions.create_lead(f"新名單 {tag}", email=f"lead-{tag}@example.com")
		self.assertTrue(frappe.db.exists("DropOut Event", {"idempotency_key": f"Lead:{lead['party']}:lead_created"}))

	def test_public_api_create_customer(self):
		from dropout_core import public_api

		tag = frappe.generate_hash(length=6)
		created = public_api.create_customer(f"API 客人 {tag}", email=f"api-{tag}@Example.com", phone="0912-345-678")
		self.assertTrue(created["ok"])
		self.assertEqual(created["customer"]["customer_name"], f"API 客人 {tag}")
		self.assertTrue(frappe.db.exists("DropOut Identity", {"party": created["customer"]["name"], "channel": "email", "external_id": f"api-{tag}@example.com"}))
		make_customer(f"有統編 {tag}", tax_id="04595257")
		conflict = public_api.create_customer("另一家", tax_id="04595257")
		self.assertTrue(conflict["conflict"])
		self.assertEqual(frappe.db.get_value("Customer", conflict["customer"], "tax_id"), "04595257")
		if frappe.db.get_default("country") == "Taiwan":
			self.assertFalse(public_api.create_customer("壞統編", tax_id="22099132")["ok"])

	def test_newsletter_draft_and_read_models(self):
		from dropout_core import actions, shell

		group = frappe.db.get_value("Email Group", {}) or frappe.get_doc({"doctype": "Email Group", "title": "殼測試群組"}).insert().name
		out = actions.draft_newsletter("本月消息", "<p>你好</p>", [group])
		self.assertTrue(out["ok"], out)
		self.assertEqual(frappe.db.get_value("Newsletter", out["name"], "email_sent"), 0)
		for fn in (shell.catalog, shell.website, shell.meetings, shell.hygiene):
			fn()
		self.assertIn(make_item(), [i["item_code"] for i in shell.catalog()["items"]])


class TestTeam(FrappeTestCase):
	def setUp(self):
		from dropout_core.team import ensure_role_profiles

		ensure_role_profiles()
		self.boss = self._user("boss-team@example.com", "老闆")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _user(self, email, profile):
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0, "role_profile_name": profile}).insert(ignore_permissions=True)
		return email

	def test_profiles_and_invite(self):
		from dropout_core import team

		frappe.set_user(self.boss)
		data = team.team()
		names = [p["name"] for p in data["profiles"]]
		for name in ("老闆", "業務", "倉管", "會計"):
			self.assertIn(name, names)
		self.assertNotIn("Administrator", [u["email"] for u in data["users"]])
		email = f"sales-{frappe.generate_hash(length=6)}@example.com"
		team.invite(email, "小業", "業務", send_welcome=0)
		roles = frappe.get_roles(email)
		self.assertIn("Sales User", roles)
		self.assertNotIn("System Manager", roles)
		with self.assertRaises(frappe.ValidationError):
			team.invite(email, "小業", "業務", send_welcome=0)

	def test_non_admin_cannot_manage(self):
		from dropout_core import team

		clerk = self._user("clerk-team@example.com", "業務")
		frappe.set_user(clerk)
		with self.assertRaises(frappe.PermissionError):
			team.team()
		with self.assertRaises(frappe.PermissionError):
			team.invite("x@example.com", "x", "老闆")

	def test_keeps_one_admin_and_revokes_on_disable(self):
		from dropout_core import team

		frappe.set_user(self.boss)
		with self.assertRaises(frappe.ValidationError):
			team.set_profile(self.boss, "業務")
		other = self._user(f"staff-{frappe.generate_hash(length=6)}@example.com", "業務")
		team.set_profile(other, "會計")
		self.assertIn("Accounts User", frappe.get_roles(other))
		self.assertNotIn("Sales User", frappe.get_roles(other))
		team.set_enabled(other, 0)
		self.assertEqual(frappe.db.get_value("User", other, "enabled"), 0)

	def test_security_and_audit(self):
		from dropout_core import team

		frappe.set_user(self.boss)
		out = team.set_security(two_factor=1, two_factor_method="Email", password_policy=1, session_expiry="08:00", lockout_attempts=5)
		self.assertEqual(out["security"]["enable_two_factor_auth"], 1)
		self.assertEqual(out["security"]["two_factor_for_everyone"], 1)
		with self.assertRaises(frappe.ValidationError):
			team.set_security(session_expiry="forever")
		team.set_security(two_factor=0)
		self.assertEqual(frappe.db.get_value("Role", "All", "two_factor_auth"), 0)
		self.assertIsInstance(team.audit()["rows"], list)
		frappe.set_user("Administrator")
		u = team.usage()
		self.assertGreaterEqual(u["users"], 1)
		self.assertIn("db_mb", u)
		for key in ("active_users_7d", "last_active", "invoices_30d", "invoices_prev_30d"):
			self.assertIn(key, u)


class TestAccountLock(FrappeTestCase):
	def setUp(self):
		from dropout_core.team import ensure_role_profiles

		ensure_role_profiles()
		for email, profile in (("lock-boss@example.com", "老闆"), ("lock-sales@example.com", "業務")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": "lock", "send_welcome_email": 0, "role_profile_name": profile}).insert(ignore_permissions=True)

	def tearDown(self):
		from dropout_core import account

		frappe.set_user("Administrator")
		account.set_status("active", 0, "", None)

	def _lead(self):
		return frappe.get_doc({"doctype": "Lead", "lead_name": f"鎖定測試 {frappe.generate_hash(length=5)}"}).insert()

	def test_locked_site_refuses_business_writes_but_keeps_people_and_settings(self):
		from dropout_core import account, team

		account.set_status("read_only", 1, "試用已在 2026-10-01 到期。資料都在，可以看和匯出。", "2026-10-01")
		self.assertTrue(account.status()["locked"])
		frappe.set_user("lock-sales@example.com")
		with self.assertRaises(frappe.PermissionError):
			self._lead()
		frappe.set_user("lock-boss@example.com")
		with self.assertRaises(frappe.PermissionError):
			self._lead()
		team.set_enabled("lock-sales@example.com", 0)
		team.set_enabled("lock-sales@example.com", 1)
		settings = frappe.get_single("DropOut Settings")
		settings.account_locked = 0
		settings.save()
		self.assertTrue(account.status()["locked"])
		with self.assertRaises(frappe.PermissionError):
			account.set_status("active", 0)
		frappe.set_user("Administrator")
		self._lead()

	def test_unlock_restores_writes(self):
		from dropout_core import account

		account.set_status("suspended", 1, "帳號暫停", None)
		account.set_status("active", 0, "", "2027-10-11")
		frappe.set_user("lock-sales@example.com")
		self.assertTrue(self._lead().name)
		self.assertEqual(account.status()["ends"], "2027-10-11")
