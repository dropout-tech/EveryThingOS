import argparse
import csv
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

from dropout_onboard import bootstrap, checks, cli, convert, plan, provision

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write(path, text, encoding="utf-8"):
	with open(path, "w", encoding=encoding, newline="") as fh:
		fh.write(text)
	return path


class TestPlan(unittest.TestCase):
	def test_legacy_module_names_and_website_apps(self):
		p = plan.plan({"scene": "service", "modules": ["reply", "funnel", "website", "crm"]})
		self.assertEqual(p["modules"], ["chat", "crm", "letter", "website"])
		self.assertEqual(p["apps"], ["erpnext", "payments", "webshop", "dropout_core", "dropout_pay_tw", "dropout_pack_service"])
		self.assertTrue(p["chat"] and p["letter"])

	def test_without_website_skips_shop_apps(self):
		p = plan.plan({"scene": "make", "modules": ["sales"]})
		self.assertEqual(p["apps"], ["erpnext", "dropout_core", "dropout_pack_make"])

	def test_unknown_scene_falls_back_to_service(self):
		self.assertEqual(plan.plan({"scene": "space"})["pack"], "dropout_pack_service")
		self.assertEqual(plan.plan({"scene": "edu"})["pack"], "dropout_pack_edu")

	def test_every_pack_has_an_app_folder(self):
		for pack in set(plan.PACK_FOR_SCENE.values()):
			self.assertTrue(os.path.exists(os.path.join(HERE, "..", "frappe-apps", pack, "pyproject.toml")), pack)


class TestConvert(unittest.TestCase):
	def setUp(self):
		self.tmp = tempfile.mkdtemp()

	def test_big5_a1_customers(self):
		path = write(
			os.path.join(self.tmp, "a1.csv"),
			"客戶代號,客戶全名,統一編號,E-MAIL,行動電話,備註\nC001,示範商行,12-345-675,Boss@Example.COM,0912-345-678,老客戶\n",
			encoding="cp950",
		)
		rows = convert.read_table(path)
		header, out, report = convert.convert(rows, convert.load_mapping("a1", "customers"), {"customer_group": "Commercial", "territory": "Taiwan"})
		record = dict(zip(header, out[0]))
		self.assertEqual(record["customer_name"], "示範商行")
		self.assertEqual(record["tax_id"], "12345675")
		self.assertEqual(record["email_id"], "boss@example.com")
		self.assertEqual(record["mobile_no"], "+886912345678")
		self.assertEqual(record["customer_group"], "Commercial")
		self.assertEqual(record["customer_type"], "Company")
		self.assertEqual(report["unmapped_columns"], ["備註"])
		self.assertEqual(report["missing_columns"], [])

	def test_missing_required_header_is_reported(self):
		_, _, report = convert.convert([{"代號": "C1"}], convert.load_mapping("a1", "customers"))
		self.assertIn("customer_name", report["missing_columns"])

	def test_transforms(self):
		self.assertEqual(convert._transform("115/3/9", "date"), "2026-03-09")
		self.assertEqual(convert._transform("2026.1.2", "date"), "2026-01-02")
		self.assertEqual(convert._transform("NT$1,200 元", "number"), "1200")
		self.assertEqual(convert._transform("是", "check"), "1")
		self.assertEqual(convert._transform("否", "check"), "0")

	def test_opening_stock_puts_parent_on_first_row(self):
		rows = convert.read_table(os.path.join(HERE, "templates", "opening_stock.csv"))
		rows.append(dict(rows[0], 料號="M4-10"))
		header, out, _ = convert.convert(rows, convert.load_mapping("excel", "opening_stock"), {"company": "示範製造", "posting_date": "2026-10-01", "warehouse": "Stores - DM"})
		self.assertEqual(header[:2], ["company", "purpose"])
		self.assertEqual(out[0][:2], ["示範製造", "Opening Stock"])
		self.assertEqual(out[1][:2], ["", ""])
		self.assertIn("items.item_code", header)
		self.assertEqual(dict(zip(header, out[1]))["items.warehouse"], "Stores - DM")

	def test_every_mapping_loads_and_targets_a_doctype(self):
		for source, kinds in convert.available().items():
			for kind in kinds:
				m = convert.load_mapping(source, kind)
				self.assertTrue(m["doctype"], f"{source}/{kind}")
				for spec in m["fields"].values():
					self.assertIsInstance(spec.get("from", []), list)

	def test_templates_pass_their_own_checks(self):
		for kind in ("customers", "suppliers", "items", "opening_stock"):
			rows = convert.read_table(os.path.join(HERE, "templates", f"{kind}.csv"))
			_, out, report = convert.convert(rows, convert.load_mapping("excel", kind), {"company": "C", "posting_date": "2026-10-01", "warehouse": "W", "customer_group": "G", "supplier_group": "G", "territory": "T", "item_group": "I"})
			self.assertEqual(report["missing_columns"], [], kind)


class TestChecks(unittest.TestCase):
	def test_customers(self):
		header = ["customer_name", "tax_id", "email_id"]
		rows = [["甲", "12345675", "a@example.com"], ["乙", "11111111", "bad"], ["甲", "12345675", ""]]
		issues = checks.check("customers", header, rows)
		problems = {(i["row"], i["problem"]) for i in issues}
		self.assertIn((3, "統編檢查碼錯誤"), problems)
		self.assertIn((2, "重複"), problems)
		self.assertIn((2, "統編重複，可能是同一家"), problems)
		self.assertIn((3, "Email 格式不對"), problems)

	def test_opening_stock(self):
		header = ["items.item_code", "items.warehouse", "items.qty"]
		rows = [["A", "W", "-1"], ["A", "W", "x"], ["B", "W", "3"]]
		problems = [i["problem"] for i in checks.check("opening_stock", header, rows, known_items={"A"})]
		self.assertIn("期初數量是負的", problems)
		self.assertIn("數量不是數字", problems)
		self.assertIn("商品主檔裡沒有這個料號", problems)
		self.assertIn("同一個倉庫重複出現", problems)


class TestCli(unittest.TestCase):
	def test_import_refuses_files_with_errors(self):
		tmp = tempfile.mkdtemp()
		path = write(os.path.join(tmp, "c.csv"), "customer_name,tax_id\n甲,11111111\n")
		buf = io.StringIO()
		with redirect_stdout(buf), mock.patch("subprocess.run") as run:
			code = cli.main_code(["import", "--site", "s", "--kind", "customers", path])
		self.assertEqual(code, 1)
		run.assert_not_called()
		self.assertIn("統編檢查碼錯誤", buf.getvalue())

	def test_import_reports_bench_result(self):
		tmp = tempfile.mkdtemp()
		path = write(os.path.join(tmp, "c.csv"), "customer_name,tax_id\n甲,12345675\n")
		result = {"data_import": "DI-1", "status": "Partial Success", "imported": 1, "failed": [{"rows": [3], "messages": ["Territory 不存在"]}]}
		done = mock.Mock(returncode=0, stdout="noise\n" + json.dumps(result) + "\n", stderr="")
		buf = io.StringIO()
		with redirect_stdout(buf), mock.patch("subprocess.run", return_value=done) as run:
			code = cli.main_code(["import", "--site", "s", "--kind", "customers", path])
		self.assertEqual(code, 1)
		self.assertIn("dropout_core.provisioning.data_import", run.call_args[0][0])
		self.assertIn("Territory 不存在", buf.getvalue())


class TestProvision(unittest.TestCase):
	def args(self, **kw):
		base = dict(
			profile={"scene": "edu", "modules": ["chat"]}, site="edu.local", company="示範教育", abbr=None, admin_email="a@example.com",
			admin_password="x", db_root_password="y", bench_dir="/nope", bench="bench", erpnext_url=None, shell_url=None, glue_url=None,
			glue_admin_token=None, mail_from=None, chatwoot_url=None, chatwoot_platform_token=None, vexa_url=None,
			vexa_admin_token=None, calendars=None, state_dir=tempfile.mkdtemp(),
		)
		base.update(kw)
		return argparse.Namespace(**base)

	def test_dry_run_runs_nothing(self):
		lines = []
		with mock.patch("subprocess.run") as run:
			provision.Provisioner(self.args(), out=lines.append).run(apply=False)
		run.assert_not_called()
		self.assertIn("dropout_pack_edu", lines[0])
		self.assertTrue(any("預演" in ln for ln in lines))

	def test_optional_steps_appear_only_when_configured(self):
		labels = [s.label for s in provision.Provisioner(self.args()).steps()]
		self.assertEqual(labels, ["建站", "裝 app", "設定精靈", "同步帳號"])
		labels = [
			s.label
			for s in provision.Provisioner(
				self.args(profile={"scene": "edu", "modules": ["chat", "meetings"]}, shell_url="https://os", glue_url="https://g", chatwoot_url="https://c", chatwoot_platform_token="t", vexa_url="https://v", vexa_admin_token="t")
			).steps()
		]
		self.assertEqual(labels[-4:], ["殼登入", "登記到膠水", "對話帳號", "會議機器人"])

	def test_shell_login_step_prints_shell_env(self):
		lines = []
		a = self.args(shell_url="https://acme.os.dropout.tw/", erpnext_url="https://acme.erp")
		p = provision.Provisioner(a, out=lines.append)
		p.state["done"] = {"建站": True, "裝 app": True, "設定精靈": True, "同步帳號": True}
		with mock.patch.object(p, "execute", return_value={"client_id": "cid", "client_secret": "s"}) as execute:
			p.run(apply=True)
		execute.assert_called_once_with("dropout_core.provisioning.create_oauth_client", redirect_uri="https://acme.os.dropout.tw/api/auth/callback")
		self.assertIn("  ERPNEXT_OAUTH_CLIENT_ID=cid", lines)
		self.assertIn("  ERPNEXT_SITE=edu.local", lines)

	def test_state_file_never_keeps_api_secret_in_results(self):
		a = self.args()
		p = provision.Provisioner(a, out=lambda *_: None)
		with mock.patch.object(p, "site_exists", return_value=True), mock.patch.object(p, "bench", return_value="frappe\nerpnext\ndropout_core\ndropout_pack_edu\n"), mock.patch.object(
			p, "execute", side_effect=[{"status": "ok"}, {"user": "glue@x", "api_key": "k", "api_secret": "SECRET"}]
		):
			p.run(apply=True)
		with open(os.path.join(a.state_dir, "edu.local.json"), encoding="utf-8") as fh:
			saved = json.load(fh)
		self.assertEqual(saved["results"]["同步帳號"], {"user": "glue@x"})
		self.assertEqual(oct(os.stat(os.path.join(a.state_dir, "edu.local.json")).st_mode & 0o777), "0o600")
		self.assertEqual(set(saved["done"]), {"建站", "裝 app", "設定精靈", "同步帳號"})


class TestBootstrap(unittest.TestCase):
	def args(self, folder, **kw):
		base = TestProvision.args(TestProvision(), profile=None, company=None, site="demo.local")
		base.folder = folder
		for k, v in kw.items():
			setattr(base, k, v)
		return base

	def test_demo_companies_pass_their_checks(self):
		for name in ("make", "service", "edu"):
			lines = []
			code = bootstrap.Bootstrap(self.args(os.path.join(HERE, "examples", name)), out=lines.append).run(apply=False)
			self.assertEqual(code, 0, "\n".join(lines))
			self.assertFalse([ln for ln in lines if "錯誤" in ln], name)

	def test_apply_imports_in_order_once(self):
		folder = os.path.join(HERE, "examples", "make")
		a = self.args(folder)
		b = bootstrap.Bootstrap(a, out=lambda *_: None)
		b.prov.state["done"] = {"建站": True, "裝 app": True, "設定精靈": True, "同步帳號": True}
		calls = []

		def execute(method, **kw):
			calls.append(method if method != "dropout_core.provisioning.data_import" else f"{method}:{kw['doctype']}")
			if method.endswith("import_defaults"):
				return {"company": "琢奧精密製造", "warehouse": "Stores - ZAM", "customer_group": "Commercial", "supplier_group": "Services", "territory": "Taiwan", "item_group": "Products", "stock_uom": "Nos", "posting_date": "2026-10-11"}
			if method.endswith("data_import"):
				return {"data_import": "DI-1", "status": "Success", "imported": 3, "failed": []}
			if method.endswith("opening_stock"):
				with open(kw["file_path"], encoding="utf-8") as fh:
					self.assertIn("Stores - ZAM", fh.read())
				return {"status": "submitted", "documents": ["MAT-RECO-1"]}
			if method.endswith("setup_status"):
				return {"steps": [], "done": 10, "total": 10}
			return {}

		with mock.patch.object(b.prov, "execute", side_effect=execute):
			self.assertEqual(b.run(apply=True), 0)
		self.assertEqual(
			[c.rsplit(".", 1)[-1] for c in calls],
			["import_defaults", "data_import:Customer", "data_import:Supplier", "data_import:Item", "opening_stock", "make_opening_invoices", "make_opening_invoices", "setup_status"],
		)
		calls.clear()
		again = bootstrap.Bootstrap(a, out=lambda *_: None)
		with mock.patch.object(again.prov, "execute", side_effect=execute):
			self.assertEqual(again.run(apply=True), 0)
		self.assertEqual([c.rsplit(".", 1)[-1] for c in calls], ["import_defaults", "setup_status"])

	def test_stops_at_the_first_file_with_errors(self):
		tmp = tempfile.mkdtemp()
		write(os.path.join(tmp, "bootstrap.json"), json.dumps({"company": "甲", "profile": {"scene": "service"}, "files": {"customers": "c.csv", "items": "i.csv"}}))
		write(os.path.join(tmp, "c.csv"), "客人名稱,統一編號\n甲,11111111\n")
		write(os.path.join(tmp, "i.csv"), "料號,品名,售價\nA,甲,1\n")
		lines = []
		b = bootstrap.Bootstrap(self.args(tmp), out=lines.append)
		b.prov.state["done"] = {"建站": True, "裝 app": True, "設定精靈": True, "同步帳號": True}
		with mock.patch.object(b.prov, "execute", return_value={"company": "甲"}) as execute:
			self.assertEqual(b.run(apply=True), 1)
		self.assertEqual([c.args[0] for c in execute.call_args_list], ["dropout_core.provisioning.import_defaults"])
		self.assertTrue(any("統編檢查碼錯誤" in ln for ln in lines))

	def test_missing_file_is_reported_before_anything_runs(self):
		tmp = tempfile.mkdtemp()
		write(os.path.join(tmp, "bootstrap.json"), json.dumps({"company": "甲", "profile": {}, "files": {"customers": "nope.csv"}}))
		with self.assertRaises(SystemExit):
			bootstrap.load(tmp)


if __name__ == "__main__":
	unittest.main()
