"""Receiver acceptance against the site's real Frappe/MariaDB database.

Run with ``bench --site test.local run-tests --app dropout_core``.  These are
not standalone mocked-store tests.  Only fault injection and race scheduling
are patched; all inserts, unique constraints, rollback and reads use MariaDB.
The request harness commits after successful RPC completion, as Frappe's POST
lifecycle does.  Committed test records are explicitly removed in cleanup.
"""

import copy
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.model.document import Document
from frappe.tests.utils import FrappeTestCase

from dropout_core import service_api


ACTIVITY = "DropOut Service Activity"
ROLE = "DropOut Integration"


def _payload(**changes):
	# All contacts below are synthetic fixtures, never a real dialing list.
	value = {
		"schema_version": 1,
		"source": "dodo",
		"source_tenant_id": "test-receiver",
		"source_project_id": "project-1",
		"source_record_id": "call-1",
		"source_record_type": "voice_call",
		"occurred_at": "2026-11-11T00:00:00.123Z",
		"summary": "  客戶需要人工說明 ☎️\n保留原文與空白。  ",
		"outcome": "needs_followup",
		"party": None,
		"handoff": {
			"description": "請聯絡測試客戶\n<script>alert('fixture')</script>",
			"priority": "urgent",
			"contact_name": "接收端測試",
			"contact_phone": "+886900000001",
			"contact_email": "receiver@example.invalid",
			"preferred_contact_window": "平日下午",
		},
	}
	value.update(changes)
	return value


def _hash(normalized):
	# Independent of the production normalizer/hash helper.
	encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
	return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class TestDodoServiceAPI(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.site = frappe.local.site
		cls.sites_path = frappe.local.sites_path
		cls.users = []
		cls.initial_lock = frappe.db.sql(
			"SELECT value FROM `tabSingles` WHERE doctype=%s AND field=%s",
			("DropOut Settings", "account_locked"),
		)
		cls.addClassCleanup(cls._remove_committed_fixtures)
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			raise AssertionError("The installed dropout_core app must provision its integration role")
		frappe.db.set_single_value("DropOut Settings", "account_locked", 0)
		frappe.clear_document_cache("DropOut Settings", "DropOut Settings")
		marker = uuid4().hex
		for label, role in (("integration", ROLE), ("sales", "Sales User"), ("manager", "System Manager")):
			email = f"receiver-{label}-{marker}@example.invalid"
			frappe.get_doc({
				"doctype": "User", "email": email, "first_name": "Receiver fixture",
				"enabled": 1, "send_welcome_email": 0, "user_type": "System User",
				"roles": [{"role": role}],
			}).insert(ignore_permissions=True)
			cls.users.append(email)
			setattr(cls, label, email)
		# Workers have independent connections and cannot see uncommitted users.
		frappe.db.commit()

	@classmethod
	def _remove_committed_fixtures(cls):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		for email in reversed(cls.users):
			contacts = frappe.get_all("Contact", filters={"user": email}, pluck="name")
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=True, ignore_permissions=True)
			# User.on_trash unlinks its Contact; it does not delete that fixture.
			for contact in contacts:
				frappe.delete_doc("Contact", contact, force=True, ignore_permissions=True)
		if cls.initial_lock:
			frappe.db.set_single_value("DropOut Settings", "account_locked", cls.initial_lock[0][0])
		else:
			frappe.db.sql("DELETE FROM `tabSingles` WHERE doctype=%s AND field=%s", ("DropOut Settings", "account_locked"))
		frappe.db.commit()
		frappe.clear_document_cache("DropOut Settings", "DropOut Settings")

	def setUp(self):
		frappe.db.rollback()
		frappe.set_user(self.integration)
		self.operations = []

	def tearDown(self):
		# Roll back ordinary fixtures first, then delete only this test's committed
		# operations.  Never delete another test's native ToDo or business party.
		frappe.set_user("Administrator")
		frappe.db.rollback()
		for operation in self.operations:
			name = "dodo-" + operation
			frappe.db.delete("ToDo", {"reference_type": ACTIVITY, "reference_name": name})
			frappe.db.delete(ACTIVITY, {"name": name})
		frappe.db.commit()
		frappe.clear_document_cache("DropOut Settings", "DropOut Settings")
		for email in self.users:
			frappe.clear_cache(user=email)

	def _operation(self):
		operation = str(uuid4())
		self.operations.append(operation)
		return operation

	def _counts(self, operation):
		return (
			frappe.db.count(ACTIVITY, {"operation_id": operation}),
			frappe.db.count("ToDo", {"reference_type": ACTIVITY, "reference_name": "dodo-" + operation}),
		)

	def _request_connection(self, action, *, commit=True):
		"""One simulated request; called only in a fresh worker thread."""
		try:
			frappe.init(site=self.site, sites_path=self.sites_path)
			frappe.connect()
			frappe.flags.in_test = True
			frappe.flags.mute_emails = True
			frappe.set_user(self.integration)
			frappe.db.rollback()
			frappe.db.sql("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
			# Frappe.rollback() immediately starts a new transaction.  Changing
			# the session default above does not change that already-active one.
			frappe.db.rollback()
			frappe.db.sql("SET SESSION innodb_lock_wait_timeout=8")
			if frappe.db.sql("SELECT @@tx_isolation")[0][0] != "REPEATABLE-READ":
				raise AssertionError("The concurrency fixture requires MariaDB REPEATABLE READ")
			connection_id = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
			result = action()
			if commit and result.get("ok"):
				frappe.db.commit()
			else:
				frappe.db.rollback()
			return connection_id, result
		finally:
			try:
				if getattr(frappe.local, "db", None):
					frappe.db.rollback()
			finally:
				frappe.destroy()

	def _fresh_request(self, action):
		with ThreadPoolExecutor(max_workers=1) as executor:
			return executor.submit(self._request_connection, action).result(timeout=30)

	def _customer(self, *, disabled=False, phone=None):
		with self.set_user("Administrator"):
			customer = frappe.get_doc({
				"doctype": "Customer", "customer_name": "Receiver customer " + uuid4().hex,
				"customer_type": "Individual",
				"customer_group": frappe.get_all("Customer Group", filters={"is_group": 0}, pluck="name", limit=1)[0],
				"territory": frappe.get_all("Territory", filters={"is_group": 0}, pluck="name", limit=1)[0],
				"disabled": int(disabled),
			}).insert(ignore_permissions=True)
			if phone:
				# Customer.mobile_no is normally derived from a primary Contact.
				frappe.db.set_value("Customer", customer.name, "mobile_no", phone)
			return customer.name

	def _lead(self, phone):
		with self.set_user("Administrator"):
			return frappe.get_doc({
				"doctype": "Lead", "first_name": "Receiver " + uuid4().hex,
				"mobile_no": phone, "phone": phone,
			}).insert(ignore_permissions=True).name

	def _party_counts(self):
		return tuple(frappe.db.count(doctype) for doctype in ("Customer", "Lead", "Contact", "DropOut Identity"))

	def test_shared_python_typescript_golden_normalization_and_hash(self):
		fixture_path = Path(__file__).with_name("fixtures") / "dodo-service-v1.json"
		fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
		original_input = copy.deepcopy(fixture["input"])
		normalized = service_api.normalize_payload(fixture["input"])
		self.assertEqual(normalized, fixture["normalized"])
		canonical = service_api._json(normalized)
		self.assertEqual(canonical, fixture["canonical"])
		self.assertEqual(hashlib.sha256(canonical.encode("utf-8")).hexdigest(), fixture["sha256"])
		self.assertEqual(fixture["input"], original_input)

	def test_success_commits_activity_unassigned_todo_and_minimal_receipt(self):
		operation, body = self._operation(), _payload()
		result = service_api.create_service_activity(operation, body)
		self.assertTrue(result.get("ok"), result)
		self.assertIs(result["replayed"], False)
		receipt = result["receipt"]
		self.assertEqual(set(receipt), {"schema_version", "source", "operation_id", "request_hash", "state", "activity", "handoff", "committed_at"})
		self.assertEqual(receipt["request_hash"], _hash(body))
		self.assertEqual((receipt["schema_version"], receipt["source"], receipt["operation_id"], receipt["state"]), (1, "dodo", operation, "completed"))
		self.assertEqual(receipt["activity"], {"id": "dodo-" + operation, "path": "/app/dropout-service-activity/dodo-" + operation})
		self.assertRegex(receipt["committed_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
		activity = frappe.get_doc(ACTIVITY, receipt["activity"]["id"])
		self.assertEqual(activity.summary, body["summary"])
		self.assertEqual(activity.handoff_description, body["handoff"]["description"])
		self.assertEqual(activity.occurred_at, body["occurred_at"])
		self.assertEqual(activity.contact_phone, body["handoff"]["contact_phone"])
		self.assertEqual(json.loads(activity.receipt_json), receipt)
		todo = frappe.get_doc("ToDo", receipt["handoff"]["id"])
		self.assertEqual((todo.reference_type, todo.reference_name, todo.status, todo.priority), (ACTIVITY, activity.name, "Open", "High"))
		self.assertFalse(todo.allocated_to)
		self.assertEqual(activity.followup_todo, todo.name)
		self.assertEqual(receipt["handoff"]["path"], "/app/todo/" + todo.name)
		self.assertNotIn("<script>", todo.description)
		self.assertIn("&lt;script&gt;", todo.description)
		self.assertNotIn(body["handoff"]["contact_phone"], json.dumps(receipt))
		self.assertEqual(self._counts(operation), (1, 1))
		frappe.db.commit()
		main_connection = frappe.db.sql("SELECT CONNECTION_ID()")[0][0]
		other_connection, lookup = self._fresh_request(lambda: service_api.get_operation(operation))
		self.assertNotEqual(main_connection, other_connection)
		self.assertEqual(lookup, {"ok": True, "receipt": receipt})

	def test_no_followup_creates_no_native_todo(self):
		operation = self._operation()
		result = service_api.create_service_activity(operation, _payload(outcome="no_contact", handoff=None))
		self.assertTrue(result.get("ok"), result)
		self.assertIsNone(result["receipt"]["handoff"])
		self.assertEqual(self._counts(operation), (1, 0))

	def test_same_operation_normalized_replay_preserves_original_receipt(self):
		operation = self._operation()
		body = _payload(handoff={"description": "留給人工處理", "priority": "normal"})
		del body["party"]
		first = service_api.create_service_activity(operation, body)
		self.assertTrue(first.get("ok"), first)
		normal = copy.deepcopy(body)
		normal["party"] = None
		for field in ("contact_name", "contact_phone", "contact_email", "preferred_contact_window"):
			normal["handoff"][field] = None
		# Property order and explicit nulls must not create a second operation.
		reordered = dict(reversed(list(normal.items())))
		second = service_api.create_service_activity(operation, reordered)
		self.assertEqual(second, {"ok": True, "receipt": first["receipt"], "replayed": True})
		self.assertEqual(first["receipt"]["request_hash"], _hash(normal))
		self.assertEqual(self._counts(operation), (1, 1))

	def test_same_key_changed_payload_is_conflict_without_mutation(self):
		operation, body = self._operation(), _payload()
		first = service_api.create_service_activity(operation, body)
		self.assertTrue(first.get("ok"), first)
		changed = {**body, "summary": body["summary"] + "有不同內容"}
		self.assertEqual(service_api.create_service_activity(operation, changed), {"ok": False, "code": "conflict"})
		self.assertEqual(service_api.get_operation(operation), {"ok": True, "receipt": first["receipt"]})
		self.assertEqual(frappe.db.get_value(ACTIVITY, "dodo-" + operation, "summary"), body["summary"])
		self.assertEqual(self._counts(operation), (1, 1))

	def test_sales_system_manager_and_guest_cannot_invoke_receiver(self):
		for user in (self.sales, self.manager, "Guest"):
			with self.subTest(user=user), self.set_user(user):
				operation = self._operation()
				self.assertEqual(service_api.create_service_activity(operation, _payload()), {"ok": False, "code": "forbidden"})
				self.assertEqual(service_api.get_operation(operation), {"ok": False, "code": "forbidden"})
				self.assertEqual(service_api.party_candidates("+886900000001"), {"ok": False, "code": "forbidden"})
				self.assertEqual(self._counts(operation), (0, 0))

	def test_revoked_role_is_checked_again_despite_cached_roles(self):
		self.assertIn(ROLE, frappe.get_roles(self.integration))
		frappe.db.delete("Has Role", {"parent": self.integration, "parenttype": "User", "role": ROLE})
		operation = self._operation()
		self.assertEqual(service_api.create_service_activity(operation, _payload()), {"ok": False, "code": "forbidden"})
		self.assertEqual(service_api.get_operation(operation), {"ok": False, "code": "forbidden"})
		self.assertEqual(self._counts(operation), (0, 0))

	def test_disabled_integration_user_is_rejected(self):
		frappe.db.set_value("User", self.integration, "enabled", 0)
		operation = self._operation()
		self.assertEqual(service_api.create_service_activity(operation, _payload()), {"ok": False, "code": "forbidden"})
		self.assertEqual(service_api.party_candidates("+886900000001"), {"ok": False, "code": "forbidden"})
		self.assertEqual(self._counts(operation), (0, 0))

	def test_account_lock_blocks_new_and_replayed_posts_but_not_receipt_reads(self):
		operation, body = self._operation(), _payload()
		first = service_api.create_service_activity(operation, body)
		self.assertTrue(first.get("ok"), first)
		frappe.db.set_single_value("DropOut Settings", "account_locked", 1)
		another = self._operation()
		for key in (operation, another):
			self.assertEqual(service_api.create_service_activity(key, body), {"ok": False, "code": "account_locked"})
		self.assertEqual(service_api.get_operation(operation), {"ok": True, "receipt": first["receipt"]})
		self.assertEqual(self._counts(operation), (1, 1))
		self.assertEqual(self._counts(another), (0, 0))

	def test_missing_or_disabled_party_does_not_write_or_create_a_party(self):
		disabled = self._customer(disabled=True)
		before = self._party_counts()
		for party in (
			{"party_type": "Customer", "id": "receiver-missing-" + uuid4().hex, "confirmed": True},
			{"party_type": "Lead", "id": "receiver-missing-" + uuid4().hex, "confirmed": True},
			{"party_type": "Customer", "id": disabled, "confirmed": True},
		):
			with self.subTest(party_type=party["party_type"], party=party["id"]):
				operation = self._operation()
				self.assertEqual(service_api.create_service_activity(operation, _payload(party=party)), {"ok": False, "code": "not_found"})
				self.assertEqual(self._counts(operation), (0, 0))
		self.assertEqual(self._party_counts(), before)

	def test_explicit_existing_party_link_is_preserved(self):
		for party_type, name in (("Customer", self._customer()), ("Lead", self._lead("+886900000002"))):
			with self.subTest(party_type=party_type):
				operation = self._operation()
				result = service_api.create_service_activity(operation, _payload(party={"party_type": party_type, "id": name, "confirmed": True}))
				self.assertTrue(result.get("ok"), result)
				self.assertEqual(frappe.db.get_value(ACTIVITY, "dodo-" + operation, ["party_type", "party"]), (party_type, name))

	def test_no_candidates_is_read_only(self):
		phone = "+8869" + str(uuid4().int % 100000000).zfill(8)
		before = self._party_counts()
		self.assertEqual(service_api.party_candidates(phone), {"ok": True, "data": [], "has_more": False})
		self.assertEqual(self._party_counts(), before)

	def test_ambiguous_candidates_are_distinct_and_never_auto_linked(self):
		phone = "+8869" + str(uuid4().int % 100000000).zfill(8)
		customer = self._customer(phone="0" + phone[4:])
		lead = self._lead(phone)
		self._customer(disabled=True, phone=phone)
		# Two independent matches for the same Customer still produce one result.
		with self.set_user("Administrator"):
			frappe.get_doc({"doctype": "DropOut Identity", "party_type": "Customer", "party": customer, "channel": "phone", "external_id": phone}).insert(ignore_permissions=True)
		before = self._party_counts()
		result = service_api.party_candidates(phone)
		self.assertTrue(result.get("ok"), result)
		self.assertFalse(result["has_more"])
		self.assertEqual({(row["party_type"], row["id"]) for row in result["data"]}, {("Customer", customer), ("Lead", lead)})
		self.assertEqual(len(result["data"]), 2)
		for row in result["data"]:
			self.assertEqual(set(row), {"party_type", "id", "display_name"})
		self.assertEqual(self._party_counts(), before)

	def test_candidate_limit_reports_more_without_changing_parties(self):
		phone = "+8869" + str(uuid4().int % 100000000).zfill(8)
		leads = {self._lead(phone) for _ in range(11)}
		before = self._party_counts()
		result = service_api.party_candidates(phone)
		self.assertTrue(result.get("ok"), result)
		self.assertTrue(result["has_more"])
		self.assertEqual(len(result["data"]), 10)
		self.assertTrue({row["id"] for row in result["data"]}.issubset(leads))
		self.assertEqual(self._party_counts(), before)

	def test_failure_after_real_todo_insert_rolls_back_both_records(self):
		operation, body = self._operation(), _payload()
		real_create = service_api._create_todo
		observed = []

		def fail_after_insert(activity, handoff):
			todo = real_create(activity, handoff)
			observed.append((frappe.db.exists(ACTIVITY, activity.name), frappe.db.exists("ToDo", todo.name)))
			raise RuntimeError("injected after real ToDo INSERT; private diagnostic")

		with patch.object(service_api, "_create_todo", side_effect=fail_after_insert):
			result = service_api.create_service_activity(operation, body)
		self.assertEqual(result, {"ok": False, "code": "internal_error"})
		self.assertEqual(len(observed), 1)
		self.assertTrue(all(observed[0]))
		self.assertEqual(self._counts(operation), (0, 0))
		# Even committing the HTTP request after a safe error must commit nothing.
		frappe.db.commit()
		_, missing = self._fresh_request(lambda: service_api.get_operation(operation))
		self.assertEqual(missing, {"ok": False, "code": "not_found"})
		retry = service_api.create_service_activity(operation, body)
		self.assertTrue(retry.get("ok"), retry)
		self.assertIs(retry["replayed"], False)
		self.assertEqual(self._counts(operation), (1, 1))

	def test_two_connections_concurrently_create_exactly_one_activity_and_todo(self):
		operation, body = self._operation(), _payload()
		ready = Barrier(2, timeout=15)
		real_insert = Document.db_insert

		def racing_insert(doc, *args, **kwargs):
			if doc.doctype == ACTIVITY and doc.operation_id == operation:
				# Both requests have observed absence before either INSERT.  The
				# real unique index must arbitrate; no store method is simulated.
				ready.wait()
			return real_insert(doc, *args, **kwargs)

		frappe.db.rollback()
		with patch.object(Document, "db_insert", new=racing_insert), ThreadPoolExecutor(max_workers=2) as executor:
			futures = [executor.submit(self._request_connection, lambda: service_api.create_service_activity(operation, copy.deepcopy(body))) for _ in range(2)]
			results = [future.result(timeout=35) for future in futures]
		self.assertEqual(len({connection for connection, _ in results}), 2)
		for _, result in results:
			self.assertTrue(result.get("ok"), result)
		self.assertEqual(sorted(result["replayed"] for _, result in results), [False, True])
		self.assertEqual(results[0][1]["receipt"], results[1][1]["receipt"])
		frappe.db.rollback()  # Start a fresh main-thread REPEATABLE READ snapshot.
		self.assertEqual(self._counts(operation), (1, 1))
		self.assertEqual(service_api.get_operation(operation), {"ok": True, "receipt": results[0][1]["receipt"]})

	def test_committed_response_loss_can_be_read_and_replayed_on_new_connections(self):
		operation, body = self._operation(), _payload()
		committed_receipt = []

		def lose_response():
			result = service_api.create_service_activity(operation, body)
			if not result.get("ok"):
				raise AssertionError(result)
			frappe.db.commit()
			committed_receipt.append(result["receipt"])
			raise ConnectionResetError("Synthetic response lost after database commit")

		with self.assertRaises(ConnectionResetError):
			self._fresh_request(lose_response)
		_, read = self._fresh_request(lambda: service_api.get_operation(operation))
		_, replay = self._fresh_request(lambda: service_api.create_service_activity(operation, body))
		self.assertEqual(read, {"ok": True, "receipt": committed_receipt[0]})
		self.assertEqual(replay, {"ok": True, "receipt": committed_receipt[0], "replayed": True})
		frappe.db.rollback()
		self.assertEqual(self._counts(operation), (1, 1))

	def test_invalid_payloads_never_create_partial_records(self):
		cases = [
			_payload(site="another.local"),
			_payload(company="Caller-selected company"),
			_payload(schema_version=True),
			_payload(source="another-system"),
			_payload(source_tenant_id="../other"),
			_payload(summary="   "),
			_payload(summary="x" * 2001),
			_payload(summary="invalid\x00control"),
			_payload(summary="invalid\ud800scalar"),
			_payload(occurred_at="2026-02-30T00:00:00.000Z"),
			_payload(occurred_at="2026-11-11T08:00:00.000+08:00"),
			_payload(party={"party_type": "User", "id": "Administrator", "confirmed": True}),
			_payload(party={"party_type": "Customer", "id": "missing", "confirmed": False}),
			_payload(party={"party_type": "Customer", "id": "missing", "confirmed": True, "site": "other.local"}),
			_payload(handoff=None),
			_payload(outcome="no_contact"),
		]
		for change in (
			{"description": ""}, {"description": "x" * 2001}, {"priority": "critical"},
			{"contact_email": "not-an-email"}, {"contact_phone": "0900000001"},
			{"contact_name": "bad\nname"}, {"allocated_to": self.sales},
			{"url": "https://example.invalid/callback"},
		):
			body = _payload()
			body["handoff"].update(change)
			cases.append(body)
		# Valid per-field lengths, but aggregate UTF-8 size exceeds the contract.
		oversized = _payload(summary="😀" * 2000)
		oversized["handoff"].update(description="😀" * 2000, contact_name="界" * 140, preferred_contact_window="界" * 200)
		oversized["party"] = {"party_type": "Customer", "id": "界" * 140, "confirmed": True}
		# Ensure this fixture actually crosses 16 KiB, rather than testing a guess.
		self.assertGreater(len(json.dumps(oversized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")), 16384)
		cases.append(oversized)
		for index, body in enumerate(cases):
			with self.subTest(case=index):
				operation = self._operation()
				self.assertEqual(service_api.create_service_activity(operation, body), {"ok": False, "code": "invalid_request"})
				self.assertEqual(self._counts(operation), (0, 0))

	def test_invalid_operation_and_lookup_phone_are_rejected(self):
		for operation in (str(uuid4()).upper(), "not-a-uuid", str(uuid4()) + "\n"):
			with self.subTest(operation=operation):
				self.assertEqual(service_api.create_service_activity(operation, _payload()), {"ok": False, "code": "invalid_request"})
				self.assertEqual(service_api.get_operation(operation), {"ok": False, "code": "invalid_request"})
		for phone in ("0900000001", "+123456", "+" + "1" * 16, "+886900000001\n", {"phone": "+886900000001"}):
			with self.subTest(phone=phone):
				self.assertEqual(service_api.party_candidates(phone), {"ok": False, "code": "invalid_request"})

	def test_forged_flags_cannot_insert_or_rewrite_evidence(self):
		operation = self._operation()
		forged = frappe.get_doc({
			"doctype": ACTIVITY, "operation_id": operation,
		})
		forged.flags.update(ignore_permissions=True, ignore_validate=True, dodo_receiver_insert=True)
		with self.assertRaises(frappe.PermissionError):
			forged.insert(ignore_permissions=True, set_name="dodo-" + operation)
		self.assertEqual(self._counts(operation), (0, 0))
		result = service_api.create_service_activity(operation, _payload())
		self.assertTrue(result.get("ok"), result)
		activity = frappe.get_doc(ACTIVITY, "dodo-" + operation)
		activity.summary = "unauthorized rewrite"
		with self.assertRaises(frappe.PermissionError):
			activity.save(ignore_permissions=True)
		activity.flags.ignore_validate = True
		with self.assertRaises(frappe.PermissionError):
			activity.save(ignore_permissions=True)
		with self.assertRaises(frappe.PermissionError):
			activity.db_update()
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc(ACTIVITY, activity.name, force=True, ignore_permissions=True)
		self.assertEqual(service_api.get_operation(operation), {"ok": True, "receipt": result["receipt"]})

	def test_corrupt_stored_receipt_is_not_returned_as_success_or_leaked(self):
		operation = self._operation()
		result = service_api.create_service_activity(operation, _payload())
		self.assertTrue(result.get("ok"), result)
		corrupt = {**result["receipt"], "private_debug": "must-not-leave-receiver"}
		frappe.db.set_value(ACTIVITY, "dodo-" + operation, "receipt_json", json.dumps(corrupt))
		self.assertEqual(service_api.get_operation(operation), {"ok": False, "code": "internal_error"})
		self.assertEqual(service_api.create_service_activity(operation, _payload()), {"ok": False, "code": "internal_error"})
		self.assertEqual(self._counts(operation), (1, 1))
