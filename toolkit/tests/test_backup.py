import argparse
import json
import os
import stat
import tempfile
import unittest
from datetime import datetime
from unittest import mock

from dropout_onboard import backup, cli

SITE = "demo-make.local"
NOW = datetime(2026, 10, 11, 9, 0, tzinfo=backup.TAIPEI)
SOURCE = {"counts": {"Customer": 12, "Sales Invoice": 40, "GL Entry": 300, "File": 5}, "issues": 1, "by_check": {"統編重複": 1}}
RESTORED = {"counts": {"Customer": 12, "Sales Invoice": 38, "GL Entry": 290, "File": 6}, "issues": 1, "by_check": {"統編重複": 1}}


class FakeBench:
	"""Answers bench commands like a real bench, and keeps the scratch site folder in step with new-site / drop-site."""

	def __init__(self, bench_dir, fail=None, source=SOURCE, restored=RESTORED):
		self.bench_dir, self.fail, self.source, self.restored = bench_dir, fail, source, restored
		self.calls = []

	def __call__(self, argv, cwd, text, capture_output):
		self.calls.append(argv)
		cmd = argv[1:]
		ok = mock.Mock(returncode=0, stdout="", stderr="")
		if self.fail and self.fail in cmd:
			return mock.Mock(returncode=1, stdout="", stderr=f"boom {self.fail}")
		if cmd[0] == "new-site":
			os.makedirs(os.path.join(self.bench_dir, "sites", cmd[1]))
		elif cmd[0] == "drop-site":
			os.rmdir(os.path.join(self.bench_dir, "sites", cmd[1]))
		elif "execute" in cmd:
			site = cmd[cmd.index("--site") + 1]
			ok.stdout = "noise\n" + json.dumps(self.source if site == SITE else self.restored) + "\n"
		return ok


class TestRestoreDrill(unittest.TestCase):
	def setUp(self):
		self.bench_dir = tempfile.mkdtemp()
		self.state_dir = tempfile.mkdtemp()
		self.backups = os.path.join(self.bench_dir, "sites", SITE, "private", "backups")
		os.makedirs(self.backups)
		for name in ("20261009_020000-demo-make_local-database.sql.gz", "20261011_020000-demo-make_local-database.sql.gz", "20261011_020000-demo-make_local-files.tar", "20261011_020000-demo-make_local-private-files.tar", "20261011_020000-demo-make_local-site_config_backup.json"):
			open(os.path.join(self.backups, name), "w").close()

	def args(self, **kw):
		base = dict(site=SITE, backup=None, with_files=False, bench_dir=self.bench_dir, bench="bench", db_root_password="ROOT-PW", state_dir=self.state_dir, apply=False)
		base.update(kw)
		return argparse.Namespace(**base)

	def drill(self, runner, **kw):
		lines = []
		return backup.Drill(self.args(**kw), out=lines.append, runner=runner, now=NOW), lines

	def report(self):
		folder = os.path.join(self.state_dir, "restore-drills")
		[name] = os.listdir(folder)
		path = os.path.join(folder, name)
		with open(path, encoding="utf-8") as fh:
			return path, fh.read()

	def test_finds_the_latest_backup_and_its_files(self):
		b = backup.latest_backup(self.bench_dir, SITE)
		self.assertTrue(b["files"]["database"].endswith("20261011_020000-demo-make_local-database.sql.gz"))
		self.assertEqual(set(b["files"]), {"database", "public", "private"})
		self.assertEqual(b["taken_at"], datetime(2026, 10, 11, 2, 0, tzinfo=backup.TAIPEI))
		self.assertIsNone(backup.latest_backup(self.bench_dir, "nobody.local"))

	def test_dry_run_runs_nothing_and_never_prints_the_password(self):
		run = mock.Mock()
		d, lines = self.drill(run)
		self.assertEqual(d.run(apply=False), 0)
		run.assert_not_called()
		text = "\n".join(lines)
		self.assertIn("20261011_020000-demo-make_local-database.sql.gz（7.0 小時前）", text)
		self.assertIn("restore-drill.demo-make.local", text)
		self.assertIn("預演", text)
		self.assertNotIn("ROOT-PW", text)
		self.assertFalse(os.path.exists(os.path.join(self.state_dir, "restore-drills")))

	def test_apply_restores_into_scratch_compares_and_drops_it(self):
		bench = FakeBench(self.bench_dir)
		d, lines = self.drill(bench, with_files=True)
		self.assertEqual(d.run(apply=True), 0)
		steps = [c[1:4] for c in bench.calls]
		scratch = "restore-drill.demo-make.local"
		self.assertEqual(steps[0][:2], ["new-site", scratch])
		self.assertEqual(steps[1], ["--site", scratch, "set-config"])
		self.assertEqual(bench.calls[1][-3:], ["pause_scheduler", "1", "--parse"])
		self.assertEqual(bench.calls[2][-3:], ["mute_emails", "1", "--parse"])
		restore = bench.calls[3]
		self.assertEqual(restore[1:4], ["--site", scratch, "restore"])
		self.assertTrue(restore[4].endswith("20261011_020000-demo-make_local-database.sql.gz"))
		self.assertIn("--with-public-files", restore)
		self.assertIn("--with-private-files", restore)
		self.assertEqual([c[2] for c in bench.calls[4:6]], [SITE, scratch])
		self.assertEqual(bench.calls[-1][1:3], ["drop-site", scratch])
		self.assertIn("--no-backup", bench.calls[-1])
		for c in bench.calls:
			if c[1] in ("new-site", "drop-site"):
				self.assertEqual(c[2], scratch)
		self.assertFalse(os.path.exists(os.path.join(self.bench_dir, "sites", scratch)))

		path, text = self.report()
		self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
		report = json.loads(text)
		self.assertTrue(report["passed"])
		self.assertTrue(report["scratch_dropped"])
		self.assertEqual(report["backup_age_hours"], 7.0)
		self.assertIn("Sales Invoice：現在多 2 筆（備份之後新增）", report["notes"])
		self.assertIn("File：還原後 6 筆，比現在多 1 筆（備份之後有刪除）", report["notes"])
		self.assertNotIn("ROOT-PW", text)
		self.assertNotIn("ROOT-PW", "\n".join(lines))
		self.assertIn("通過", lines[-1])

	def test_a_failed_restore_still_drops_the_scratch_site_and_hides_the_password(self):
		bench = FakeBench(self.bench_dir, fail="restore")
		d, lines = self.drill(bench)
		self.assertEqual(d.run(apply=True), 1)
		self.assertEqual(bench.calls[-1][1], "drop-site")
		self.assertNotIn("--with-public-files", bench.calls[3])
		_, text = self.report()
		report = json.loads(text)
		self.assertFalse(report["passed"])
		self.assertTrue(report["problems"][0].startswith("還原失敗"))
		self.assertNotIn("ROOT-PW", text)
		self.assertIn("***", text)

	def test_stale_backup_and_empty_restore_fail(self):
		for name in os.listdir(self.backups):
			if name.startswith("20261011"):
				os.remove(os.path.join(self.backups, name))
		bench = FakeBench(self.bench_dir, restored={"counts": {"Customer": 0, "Sales Invoice": 0, "GL Entry": 0}, "issues": 0})
		d, lines = self.drill(bench)
		self.assertEqual(d.run(apply=True), 1)
		problems = json.loads(self.report()[1])["problems"]
		self.assertTrue(any("超過 24 小時" in p for p in problems))
		self.assertIn("還原後所有單據都是 0 筆", problems)
		self.assertIn("File：還原後找不到這種單據", problems)
		self.assertIn("Customer：現在 12 筆，還原後 0 筆", problems)

	def test_leftover_scratch_site_is_dropped_first(self):
		os.makedirs(os.path.join(self.bench_dir, "sites", "restore-drill.demo-make.local"))
		bench = FakeBench(self.bench_dir)
		d, lines = self.drill(bench)
		self.assertEqual(d.run(apply=True), 0)
		self.assertEqual(bench.calls[0][1], "drop-site")
		self.assertEqual(bench.calls[1][1], "new-site")

	def test_refuses_without_backup_site_or_password(self):
		run = mock.Mock()
		d, lines = self.drill(run, site="nobody.local")
		self.assertEqual(d.run(apply=True), 1)
		self.assertIn("找不到", lines[-1])
		d, lines = self.drill(run, site="../etc")
		self.assertEqual(d.run(apply=True), 1)
		d, lines = self.drill(run, backup="/nope/x-database.sql.gz")
		self.assertEqual(d.run(apply=True), 1)
		self.assertIn("沒有找到備份", lines[-1])
		d, lines = self.drill(run, db_root_password="")
		self.assertEqual(d.run(apply=True), 1)
		self.assertIn("DB_ROOT_PASSWORD", lines[-1])
		run.assert_not_called()

	def test_specific_backup_file(self):
		path = os.path.join(self.backups, "20261009_020000-demo-make_local-database.sql.gz")
		bench = FakeBench(self.bench_dir)
		d, lines = self.drill(bench, backup=path)
		self.assertEqual(d.run(apply=True), 1)
		self.assertEqual(bench.calls[3][4], path)
		self.assertTrue(any("超過 24 小時" in ln for ln in lines))

	def test_cli_parses_backup_verify(self):
		with mock.patch.dict(os.environ, {"DB_ROOT_PASSWORD": "from-env"}):
			a = cli.build_parser().parse_args(["backup", "verify", SITE, "--with-files", "--apply"])
		self.assertEqual((a.backup_cmd, a.site, a.with_files, a.apply, a.db_root_password), ("verify", SITE, True, True, "from-env"))
		self.assertIs(a.fn, backup.cmd_verify)


if __name__ == "__main__":
	unittest.main()
