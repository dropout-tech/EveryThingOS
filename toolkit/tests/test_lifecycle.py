import argparse
import json
import os
import stat
import tempfile
import unittest
from datetime import datetime
from unittest import mock

from dropout_onboard import backup, cli, dr, purge
from fakes import R2_ENV, FakeHost, backup_set

SITE = "gone-shop.local"
NOW = datetime(2026, 10, 11, 9, 0, tzinfo=backup.TAIPEI)
R2_ARGS = dict(backup_bucket="dropout-backups", backup_endpoint="https://acc.r2.cloudflarestorage.com", s3_python=None)


class FakeGlue:
	def __init__(self, accounts=None, fail_step=None):
		self.accounts = accounts or {}
		self.fail_step = fail_step
		self.posts = []

	def __call__(self, method, path, body=None):
		parts = path.strip("/").split("/")
		if method == "GET" and len(parts) == 2:
			return {"today": "2026-10-11", "accounts": list(self.accounts.values())}
		acc = self.accounts.get(parts[2])
		if not acc:
			raise SystemExit("膠水回應 404：not found")
		if method == "GET":
			return {"account": acc, "events": []}
		if body["step"] == self.fail_step:
			raise SystemExit("膠水回應 500：down")
		self.posts.append((parts[2], body["step"], body["detail"]))
		if body["step"] == "done":
			acc["purged_at"] = "2026-10-11T01:00:00Z"
			acc["purge"] = {**acc["purge"], "purged_at": acc["purged_at"], "due": False}
		return {"ok": True, "account": acc}


def account(site, state="cancelled", due=True, stage=None):
	return {"site": site, "company": "倒閉小店", "state": state, "cancelled_at": "2026-06-01T00:00:00Z", "purged_at": None,
		"purge": {"due_on": "2026-08-30", "due": due, "purged_at": None}, "lifecycle": {"stage": stage or state}}


class TestPurge(unittest.TestCase):
	def setUp(self):
		self.bench_dir = tempfile.mkdtemp()
		self.state_dir = tempfile.mkdtemp()
		os.makedirs(os.path.join(self.bench_dir, "sites", SITE))
		objects = {**backup_set(SITE, "20261009_020000"), **backup_set(SITE, "20261010_020000"), **backup_set("keep.local", "20261010_020000")}
		self.host = FakeHost(self.bench_dir, objects=objects)
		self.glue = FakeGlue({SITE: account(SITE)})
		self.env = mock.patch.dict(os.environ, R2_ENV)
		self.env.start()
		self.addCleanup(self.env.stop)

	def args(self, **kw):
		base = dict(site=SITE, bench_dir=self.bench_dir, bench="bench", db_root_password="ROOT-PW", state_dir=self.state_dir, yes=False, glue_url="https://glue", glue_admin_token="t", **R2_ARGS)
		base.update(kw)
		return argparse.Namespace(**base)

	def purge(self, answer=SITE, **kw):
		lines = []
		p = purge.Purge(self.args(**kw), out=lines.append, runner=self.host, glue=self.glue, ask=lambda _q: answer, now=NOW)
		return p, lines

	def test_dry_run_touches_nothing(self):
		p, lines = self.purge()
		self.assertEqual(p.run(apply=False), 0, "\n".join(lines))
		self.assertEqual(self.host.calls, [])
		self.assertEqual(self.glue.posts, [])
		self.assertEqual({r["op"] for r in self.host.s3}, {"list"})
		self.assertIn("8 個檔", "\n".join(lines))
		self.assertIn("預演", lines[-1])

	def test_refuses_before_90_days_or_when_not_cancelled(self):
		self.glue.accounts[SITE] = account(SITE, due=False)
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 1)
		self.assertIn("2026-08-30 起才能刪除", lines[-1])
		self.glue.accounts[SITE] = account(SITE, state="active", due=False)
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 1)
		self.assertIn("還沒解約", lines[-1])
		self.assertEqual(self.host.calls, [])
		self.assertTrue(os.path.isdir(os.path.join(self.bench_dir, "sites", SITE)))

	def test_wrong_name_typed_stops(self):
		p, lines = self.purge(answer="gone-shop")
		self.assertEqual(p.run(apply=True), 1)
		self.assertIn("名稱不符", lines[-1])
		self.assertEqual(self.host.calls, [])
		self.assertEqual(self.glue.posts, [])

	def test_apply_final_backup_then_drop_then_delete_then_mark(self):
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 0, "\n".join(lines))
		self.assertEqual([s for _, s, _ in self.glue.posts], ["started", "final_backup", "dropped", "r2_deleted", "done"])
		final = [k for k in self.host.bucket if k.startswith(f"purged/{SITE}/20261231_235959/")]
		self.assertEqual(len(final), 4)
		self.assertFalse([k for k in self.host.bucket if k.startswith(f"{SITE}/")])
		self.assertEqual(len([k for k in self.host.bucket if k.startswith("keep.local/")]), 4)
		self.assertFalse(os.path.exists(os.path.join(self.bench_dir, "sites", SITE)))
		self.assertFalse(os.path.exists(os.path.join(self.bench_dir, "archived")))
		order = [c[1] if c[1] != "--site" else c[3] for c in self.host.calls]
		self.assertEqual(order, ["backup", "drop-site"])
		folder = os.path.join(self.state_dir, "purges")
		path = os.path.join(folder, os.listdir(folder)[0])
		self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
		with open(path, encoding="utf-8") as fh:
			text = fh.read()
		self.assertNotIn("ROOT-PW", text)
		self.assertEqual(json.loads(text)["final_backup"], f"purged/{SITE}/20261231_235959/")

	def test_yes_skips_the_prompt(self):
		p, lines = self.purge(answer="nope", yes=True)
		self.assertEqual(p.run(apply=True), 0, "\n".join(lines))

	def test_upload_failure_keeps_the_site_and_daily_backups(self):
		self.host.fail = "s3:put"
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 1)
		self.assertTrue(os.path.isdir(os.path.join(self.bench_dir, "sites", SITE)))
		self.assertEqual(len([k for k in self.host.bucket if k.startswith(f"{SITE}/")]), 8)
		self.assertEqual([s for _, s, _ in self.glue.posts], ["started"])
		text = "\n".join(lines)
		self.assertIn("最後備份失敗", text)
		self.assertNotIn("R2-SECRET-xyz", text)

	def test_rerun_after_drop_finishes_without_a_new_backup(self):
		self.glue.fail_step = "r2_deleted"
		p, _ = self.purge()
		self.assertEqual(p.run(apply=True), 1)
		self.assertFalse(os.path.exists(os.path.join(self.bench_dir, "sites", SITE)))
		self.glue.fail_step = None
		self.host.calls.clear()
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 0, "\n".join(lines))
		self.assertEqual(self.host.calls, [])
		self.assertEqual(self.glue.posts[-1][1], "done")
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 0)
		self.assertIn("已經刪除", lines[-1])

	def test_no_site_and_no_final_backup_refuses_to_delete_r2(self):
		os.rmdir(os.path.join(self.bench_dir, "sites", SITE))
		p, lines = self.purge()
		self.assertEqual(p.run(apply=True), 1)
		self.assertEqual(len([k for k in self.host.bucket if k.startswith(f"{SITE}/")]), 8)
		self.assertIn("不刪 R2", lines[-1])

	def test_cli_wires_purge(self):
		a = cli.build_parser().parse_args(["fleet", "purge", SITE, "--apply", "--yes"])
		self.assertTrue(a.apply and a.yes)
		a = cli.build_parser().parse_args(["fleet", "purge-sweep"])
		self.assertEqual((a.older_than_days, a.apply), (30, False))


class TestSweep(unittest.TestCase):
	def setUp(self):
		objects = {}
		for site, stamp in ((SITE, "20260901_020000"), ("recent.local", "20261005_020000")):
			for k, v in backup_set(site, stamp).items():
				objects["purged/" + k] = v
		objects.update(backup_set(SITE, "20260901_020000"))
		self.host = FakeHost(tempfile.mkdtemp(), objects=objects)
		self.glue = FakeGlue({SITE: {**account(SITE), "purged_at": "2026-09-01T00:00:00Z"}})
		self.env = mock.patch.dict(os.environ, R2_ENV)
		self.env.start()
		self.addCleanup(self.env.stop)

	def sweep(self, apply, answer="delete", **kw):
		a = argparse.Namespace(bench_dir=self.host.bench_dir, older_than_days=30, apply=apply, yes=False, glue_url="https://glue", glue_admin_token="t", **R2_ARGS, **kw)
		lines = []
		return purge.sweep(a, out=lines.append, runner=self.host, glue=self.glue, ask=lambda _q: answer, now=NOW), lines

	def test_dry_run_lists_only_old_final_backups(self):
		code, lines = self.sweep(False)
		self.assertEqual(code, 0)
		self.assertIn("超過 30 天的最後備份 1 份", lines[0])
		self.assertIn(SITE, lines[1])
		self.assertFalse([r for r in self.host.s3 if r["op"] == "delete"])

	def test_apply_deletes_only_the_old_set_and_records_it(self):
		code, lines = self.sweep(True)
		self.assertEqual(code, 0, "\n".join(lines))
		left = sorted({k.split("/")[1] for k in self.host.bucket if k.startswith("purged/")})
		self.assertEqual(left, ["recent.local"])
		self.assertEqual(len([k for k in self.host.bucket if k.startswith(f"{SITE}/")]), 4, "only purged/ is swept")
		self.assertEqual(self.glue.posts, [(SITE, "final_deleted", f"刪除最後備份 purged/{SITE}/20260901_020000/")])

	def test_apply_needs_the_word(self):
		code, _ = self.sweep(True, answer="yes")
		self.assertEqual(code, 1)
		self.assertEqual(len([k for k in self.host.bucket if k.startswith("purged/")]), 8)


class TestRestoreAll(unittest.TestCase):
	def setUp(self):
		self.bench_dir = tempfile.mkdtemp()
		self.state_dir = tempfile.mkdtemp()
		os.makedirs(os.path.join(self.bench_dir, "sites", "here.local"))
		objects = {
			**backup_set("a.local", "20261010_020000"),
			**backup_set("a.local", "20261011_020000", encrypted=True, extra_config={"host_name": "https://a.example"}),
			**backup_set("b.local", "20261011_020000"),
			**backup_set("here.local", "20261011_020000"),
			**{"purged/" + k: v for k, v in backup_set("old.local", "20261001_020000").items()},
			"d1/dropout-glue/20261011.sql": "sql",
		}
		self.host = FakeHost(self.bench_dir, objects=objects)
		self.glue = FakeGlue({
			"b.local": account("b.local", state="active", stage="active"),
			"a.local": account("a.local", state="cancelled"),
			"here.local": account("here.local", state="active", stage="trial"),
			"old.local": {**account("old.local"), "purged_at": "2026-10-01T00:00:00Z"},
			"none.local": account("none.local", state="active", stage="active"),
		})
		self.env = mock.patch.dict(os.environ, R2_ENV)
		self.env.start()
		self.addCleanup(self.env.stop)

	def run_all(self, apply, **kw):
		base = dict(sites=None, bench_dir=self.bench_dir, bench="bench", db_root_password="ROOT-PW", state_dir=self.state_dir, encryption_key=None,
			mariadb_user_host_login_scope=None, glue_url="https://glue", glue_admin_token="t", **R2_ARGS)
		base.update(kw)
		lines = []
		r = dr.RestoreAll(argparse.Namespace(**base), out=lines.append, runner=self.host, glue=self.glue, now=NOW)
		return r.run(apply=apply), lines

	def test_dry_run_orders_paying_first_and_skips_what_is_here(self):
		code, lines = self.run_all(False)
		self.assertEqual(code, 1, "none.local has no backup")
		self.assertEqual(self.host.calls, [])
		text = "\n".join(lines)
		self.assertLess(text.index("b.local"), text.index("a.local"))
		self.assertIn("here.local：已經在這台，略過", text)
		self.assertIn("none.local：R2 的 none.local/ 沒有備份", text)
		self.assertNotIn("old.local", text)
		self.assertIn("有加密", text)

	def test_without_glue_uses_bucket_folders(self):
		code, lines = self.run_all(False, glue_url=None)
		self.assertEqual(code, 0)
		text = "\n".join(lines)
		self.assertIn("來源：R2", text)
		self.assertNotIn("purged", text)
		self.assertNotIn("d1", text)

	def test_apply_restores_each_site_and_keeps_the_old_keys(self):
		code, lines = self.run_all(True, sites=["a.local", "b.local"], mariadb_user_host_login_scope="%")
		self.assertEqual(code, 0, "\n".join(lines))
		with open(os.path.join(self.bench_dir, "sites", "a.local", "site_config.json")) as fh:
			cfg = json.load(fh)
		self.assertEqual((cfg["db_name"], cfg["db_password"]), ("_new", "new-db-pw"))
		self.assertEqual((cfg["encryption_key"], cfg["backup_encryption_key"], cfg["host_name"]), ("FERNET-KEY", "ENC-KEY-777", "https://a.example"))
		new_site = next(c for c in self.host.calls if c[1] == "new-site")
		self.assertEqual(new_site[new_site.index("--mariadb-user-host-login-scope") + 1], "%")
		restore = next(c for c in self.host.calls if "restore" in c and "a.local" in c)
		self.assertEqual(restore[restore.index("--encryption-key") + 1], "ENC-KEY-777")
		self.assertIn("--with-private-files", restore)
		self.assertIn(["bench", "--site", "b.local", "migrate"], self.host.calls)
		self.assertFalse(os.listdir(os.path.join(self.state_dir, "restore-all", "downloads")))
		folder = os.path.join(self.state_dir, "restore-all")
		with open(os.path.join(folder, "state.json")) as fh:
			state = json.load(fh)
		self.assertEqual({k: v["status"] for k, v in state["sites"].items()}, {"a.local": "done", "b.local": "done"})
		log = next(f for f in os.listdir(folder) if f.endswith(".log"))
		with open(os.path.join(folder, log), encoding="utf-8") as fh:
			text = fh.read()
		self.assertIn("[2/2] b.local", text)
		self.assertNotIn("ENC-KEY-777", text)
		self.assertNotIn("ROOT-PW", text)

	def test_a_failed_site_is_dropped_and_the_rest_continue(self):
		self.host.fail = "migrate"
		code, lines = self.run_all(True, sites=["a.local", "b.local"])
		self.assertEqual(code, 1)
		self.assertFalse(os.path.exists(os.path.join(self.bench_dir, "sites", "a.local")))
		self.assertEqual(len([c for c in self.host.calls if c[1] == "new-site"]), 2)
		self.assertIn("migrate失敗", "\n".join(lines))
		self.host.fail = None
		code, lines = self.run_all(True, sites=["a.local", "b.local"])
		self.assertEqual(code, 0, "\n".join(lines))

	def test_cli_requires_from_r2(self):
		with self.assertRaises(SystemExit), mock.patch("sys.stderr"):
			cli.build_parser().parse_args(["fleet", "restore-all"])
		a = cli.build_parser().parse_args(["fleet", "restore-all", "--from-r2", "--site", "a.local"])
		self.assertEqual((a.sites, a.apply), (["a.local"], False))


if __name__ == "__main__":
	unittest.main()
