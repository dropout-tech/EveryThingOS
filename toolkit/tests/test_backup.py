import argparse
import json
import os
import stat
import tempfile
import unittest
from datetime import datetime
from unittest import mock

from dropout_onboard import backup, cli
from dropout_onboard.r2 import R2
from fakes import R2_ENV, FakeHost, backup_set

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
		self.assertEqual(set(b["files"]), {"database", "public", "private", "config"})
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


class TestDrillFromR2(unittest.TestCase):
	def setUp(self):
		self.bench_dir = tempfile.mkdtemp()
		self.state_dir = tempfile.mkdtemp()
		os.makedirs(os.path.join(self.bench_dir, "sites", SITE))
		with open(os.path.join(self.bench_dir, "sites", SITE, "site_config.json"), "w") as fh:
			json.dump({"db_name": "_live"}, fh)
		objects = {**backup_set(SITE, "20261010_020000"), **backup_set(SITE, "20261011_020000", encrypted=True), "other.local/20261011_030000/20261011_030000-other_local-database.sql.gz": "no"}
		self.host = FakeHost(self.bench_dir, summaries={SITE: SOURCE, backup.scratch_name(SITE): RESTORED}, objects=objects)
		self.env = mock.patch.dict(os.environ, R2_ENV)
		self.env.start()
		self.addCleanup(self.env.stop)

	def args(self, **kw):
		base = dict(site=SITE, backup=None, with_files=True, bench_dir=self.bench_dir, bench="bench", db_root_password="ROOT-PW", state_dir=self.state_dir, apply=False,
			from_r2=True, backup_bucket="dropout-backups", backup_endpoint="https://acc.r2.cloudflarestorage.com", s3_python=None, encryption_key=None, keep_download=False)
		base.update(kw)
		return argparse.Namespace(**base)

	def drill(self, **kw):
		lines = []
		return backup.Drill(self.args(**kw), out=lines.append, runner=self.host, now=NOW), lines

	def test_file_names_frappe_writes(self):
		self.assertEqual(backup.file_kind("20261011_020000-a_b-database-enc.sql.gz"), "database")
		self.assertEqual(backup.file_kind("20261011_020000-a_b-partial-database.sql.gz"), "database")
		self.assertEqual(backup.file_kind("20261011_020000-a_b-private-files-enc.tar"), "private")
		self.assertEqual(backup.file_kind("20261011_020000-a_b-files.tgz"), "public")
		self.assertEqual(backup.file_kind("20261011_020000-a_b-site_config_backup-enc.json"), "config")
		self.assertIsNone(backup.file_kind("notes.txt"))
		sets = backup.remote_sets([{"key": k, "size": 1} for k in self.host.bucket], f"{SITE}/")
		self.assertEqual([s["stamp"] for s in sets], ["20261010_020000", "20261011_020000"])
		self.assertEqual(sets[-1]["bytes"], 4)

	def test_dry_run_lists_the_bucket_but_downloads_nothing(self):
		d, lines = self.drill()
		self.assertEqual(d.run(apply=False), 0)
		self.assertEqual([r["op"] for r in self.host.s3], ["list"])
		self.assertEqual(self.host.s3[0]["prefix"], f"{SITE}/")
		text = "\n".join(lines)
		self.assertIn("20261011_020000-demo-make_local-database-enc.sql.gz（7.0 小時前），有加密", text)
		self.assertEqual(self.host.calls, [])
		argv, env = self.host.envs[0]
		self.assertEqual(argv[0], os.path.join(self.bench_dir, "env", "bin", "python"))
		self.assertEqual((env["BACKUP_SECRET_ACCESS_KEY"], env["BACKUP_BUCKET"]), ("R2-SECRET-xyz", "dropout-backups"))
		self.assertNotIn("R2-SECRET-xyz", " ".join(argv))

	def test_apply_downloads_restores_with_the_backup_key_and_cleans_up(self):
		d, lines = self.drill(apply=True)
		self.assertEqual(d.run(apply=True), 0, "\n".join(lines))
		got = sorted(os.path.basename(r["key"]) for r in self.host.s3 if r["op"] == "get")
		self.assertEqual(got, sorted(os.path.basename(k) for k in backup_set(SITE, "20261011_020000", encrypted=True)))
		restore = next(c for c in self.host.calls if "restore" in c)
		self.assertIn("r2-downloads", restore[4])
		self.assertEqual(restore[restore.index("--encryption-key") + 1], "ENC-KEY-777")
		self.assertFalse(os.path.exists(os.path.join(self.state_dir, "r2-downloads", f"{SITE}-20261011_020000")))
		drop = self.host.calls[-1]
		self.assertIn("--archived-sites-path", drop)
		self.assertFalse(os.path.exists(drop[drop.index("--archived-sites-path") + 1]), "the archived copy of the scratch site must not stay on disk")
		path = os.path.join(self.state_dir, "restore-drills", os.listdir(os.path.join(self.state_dir, "restore-drills"))[0])
		with open(path, encoding="utf-8") as fh:
			text = fh.read()
		report = json.loads(text)
		self.assertEqual((report["from"], report["encrypted"], report["passed"]), ("r2", True, True))
		self.assertIn("download_minutes", report)
		for secret in ("ROOT-PW", "ENC-KEY-777", "R2-SECRET-xyz"):
			self.assertNotIn(secret, text)
			self.assertNotIn(secret, "\n".join(lines))

	def test_encrypted_backup_without_any_key_fails_before_touching_the_bench(self):
		for k in list(self.host.bucket):
			if k.endswith("-enc.json"):
				self.host.bucket[k] = json.dumps({"db_name": "_old"})
		d, lines = self.drill()
		self.assertEqual(d.run(apply=True), 1)
		self.assertEqual(self.host.calls, [])
		self.assertTrue(any("找不到金鑰" in ln for ln in lines))

	def test_key_from_the_environment_wins(self):
		d, _ = self.drill(encryption_key="GIVEN-KEY")
		self.assertEqual(d.run(apply=True), 0)
		restore = next(c for c in self.host.calls if "restore" in c)
		self.assertEqual(restore[restore.index("--encryption-key") + 1], "GIVEN-KEY")

	def test_r2_errors_are_reported_without_the_secret(self):
		self.host.fail = "s3:list"
		d, lines = self.drill()
		self.assertEqual(d.run(apply=False), 1)
		self.assertIn("R2 list 失敗", lines[-1])
		self.assertNotIn("R2-SECRET-xyz", lines[-1])

	def test_missing_r2_settings_are_named(self):
		with mock.patch.dict(os.environ, {"BACKUP_SECRET_ACCESS_KEY": ""}):
			d, lines = self.drill(backup_bucket=None)
			self.assertEqual(d.run(apply=False), 1)
		self.assertIn("--backup-bucket", lines[-1])
		self.assertIn("BACKUP_SECRET_ACCESS_KEY", lines[-1])
		self.assertEqual(self.host.s3, [])

	def test_cli_parses_from_r2(self):
		with mock.patch.dict(os.environ, {"BACKUP_BUCKET": "b", "BACKUP_ENDPOINT": "https://e", "BACKUP_ENCRYPTION_KEY": "k"}):
			a = cli.build_parser().parse_args(["backup", "verify", SITE, "--from-r2", "--with-files"])
		self.assertEqual((a.from_r2, a.backup_bucket, a.backup_endpoint, a.encryption_key, a.apply), (True, "b", "https://e", "k", False))
		self.assertIsInstance(R2.from_args(a), R2)


if __name__ == "__main__":
	unittest.main()
