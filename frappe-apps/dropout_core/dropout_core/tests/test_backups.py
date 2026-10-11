import os
from unittest import mock

import frappe
from frappe.tests.utils import FrappeTestCase

from dropout_core import account, backups

BOSS = "backup-boss@example.com"
SALES = "backup-sales@example.com"


def _user(email, profile):
	from dropout_core.team import ensure_role_profiles

	ensure_role_profiles()
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": "backup", "send_welcome_email": 0, "role_profile_name": profile}).insert(ignore_permissions=True)


class TestBackups(FrappeTestCase):
	def setUp(self):
		from frappe.utils.backups import get_backup_path

		_user(BOSS, "老闆")
		_user(SALES, "業務")
		self.folder = get_backup_path()
		os.makedirs(self.folder, exist_ok=True)
		self.made = []
		for name, size in (("20991231_235900-x-database.sql.gz", 100), ("20991231_235900-x-files.tar", 50), ("20991230_235900-x-database.sql.gz", 7)):
			path = os.path.join(self.folder, name)
			with open(path, "wb") as fh:
				fh.write(b"0" * size)
			self.made.append(path)
		frappe.cache.delete_value(backups.CACHE_KEY)

	def tearDown(self):
		frappe.set_user("Administrator")
		account.set_status("active", 0, "", None)
		for path in self.made:
			os.remove(path)
		frappe.cache.delete_value(backups.CACHE_KEY)

	def test_local_reads_the_newest_set(self):
		got = backups.local()
		self.assertTrue(got["taken_at"].startswith("2099-12-31T23:59:00"))
		self.assertEqual((got["bytes"], got["files"], got["encrypted"]), (150, 2, False))

	def test_offsite_lists_the_bucket_folder(self):
		page = {
			"Contents": [
				{"Key": "test.local/20261010_000000/20261010_000000-test_local-database.sql.gz", "Size": 10},
				{"Key": "test.local/20261011_000000/20261011_000000-test_local-database-enc.sql.gz", "Size": 20},
				{"Key": "test.local/20261011_000000/20261011_000000-test_local-files-enc.tar", "Size": 5},
				{"Key": "test.local/20261012_000000/20261012_000000-test_local-files.tar", "Size": 9},
			]
		}
		client = mock.Mock()
		client.get_paginator.return_value.paginate.return_value = [page]
		settings = frappe._dict(enabled=1, bucket="dropout-backups", backup_path="test.local/", frequency="Daily", backup_files=1, access_key_id="k", endpoint_url="https://r2.example", get_password=lambda _f: "s")
		with mock.patch("frappe.get_single", return_value=settings), mock.patch("boto3.client", return_value=client):
			got = backups.offsite()
		self.assertTrue(got["taken_at"].startswith("2026-10-11T00:00:00"))
		self.assertEqual((got["bytes"], got["files"], got["sets"]), (25, 2, 2))
		client.get_paginator.return_value.paginate.assert_called_with(Bucket="dropout-backups", Prefix="test.local/")

	def test_offsite_error_is_reported_not_raised(self):
		settings = frappe._dict(enabled=1, bucket="b", backup_path="", frequency="Daily", backup_files=1, access_key_id="k", endpoint_url=None, get_password=lambda _f: "s")
		with mock.patch("frappe.get_single", return_value=settings), mock.patch("boto3.client", side_effect=RuntimeError("no route")):
			self.assertEqual(backups.offsite()["error"], "no route")

	def test_owner_only(self):
		frappe.set_user(SALES)
		with self.assertRaises(frappe.PermissionError):
			backups.status()
		frappe.set_user(BOSS)
		self.assertIn("offsite", backups.status())

	def test_owner_can_export_while_the_contract_is_locked(self):
		"""設定 → 下載全部資料 must keep working when read-only, suspended or cancelled."""
		from frappe.desk.reportview import export_query

		account.set_status("cancelled", 1, "已解約。資料保留，可以看和匯出。", None)
		frappe.set_user(BOSS)
		self.assertIn("local", backups.status(refresh=1))
		frappe.local.form_dict = frappe._dict(doctype="Customer", file_format_type="CSV", fields=frappe.as_json(["`tabCustomer`.`name`", "`tabCustomer`.`customer_name`"]))
		export_query()
		self.assertEqual(frappe.response["type"], "binary")
		self.assertTrue(frappe.response["filename"].endswith(".csv"))
		self.assertTrue(frappe.response["filecontent"])
