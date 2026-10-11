"""還原演練. Restores a site's latest backup into a scratch site on the same
bench (scheduler paused, email muted), compares document totals and data
checks with the live site, then drops the scratch site and writes a report.
Every step is an upstream bench command; nothing touches the live site."""

import json
import os
import re
import secrets
import shlex
import subprocess
import time
from datetime import datetime, timedelta, timezone

RPO_HOURS = 24
RTO_HOURS = 8
TAIPEI = timezone(timedelta(hours=8))
SITE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]*$")
# Frappe names backups `<YYYYmmdd_HHMMSS>-<site_with_underscores>-database.sql.gz`, in the site's time zone (Asia/Taipei for ours).
DB_RE = re.compile(r"^(\d{8}_\d{6})-.+-database\.sql(\.gz)?$")


def scratch_name(site):
	return f"restore-drill.{site}"


def latest_backup(bench_dir, site):
	folder = os.path.join(bench_dir, "sites", site, "private", "backups")
	try:
		names = os.listdir(folder)
	except OSError:
		return None
	dbs = sorted(n for n in names if DB_RE.match(n))
	if not dbs:
		return None
	return backup_files(os.path.join(folder, dbs[-1]))


def backup_files(db_path):
	name = os.path.basename(db_path)
	m = DB_RE.match(name)
	taken = datetime.strptime(m.group(1), "%Y%m%d_%H%M%S").replace(tzinfo=TAIPEI) if m else None
	prefix = os.path.join(os.path.dirname(db_path), re.sub(r"-database\.sql(\.gz)?$", "", name))
	files = {"database": db_path}
	for kind, suffix in (("public", "-files.tar"), ("private", "-private-files.tar")):
		if os.path.exists(prefix + suffix):
			files[kind] = prefix + suffix
	return {"taken_at": taken, "files": files}


def compare(source, restored):
	"""Problems that fail the drill, and notes that do not. Newer documents on the live site are expected."""
	problems, notes = [], []
	src, dst = source.get("counts", {}), restored.get("counts", {})
	if not any(dst.values()):
		problems.append("還原後所有單據都是 0 筆")
	for doctype, live in src.items():
		got = dst.get(doctype)
		if got is None:
			problems.append(f"{doctype}：還原後找不到這種單據")
		elif live > 0 and got == 0:
			problems.append(f"{doctype}：現在 {live} 筆，還原後 0 筆")
		elif got > live:
			notes.append(f"{doctype}：還原後 {got} 筆，比現在多 {got - live} 筆（備份之後有刪除）")
		elif got < live:
			notes.append(f"{doctype}：現在多 {live - got} 筆（備份之後新增）")
	if restored.get("issues", 0) != source.get("issues", 0):
		notes.append(f"資料檢查：現在 {source.get('issues', 0)} 個問題，還原後 {restored.get('issues', 0)} 個")
	return problems, notes


class Drill:
	def __init__(self, args, out=print, runner=subprocess.run, now=None):
		self.a = args
		self.out = out
		self.runner = runner
		self.now = now or datetime.now(TAIPEI)
		self.scratch = scratch_name(args.site)
		self.secrets = [s for s in (args.db_root_password,) if s]

	def _mask(self, text):
		for s in self.secrets:
			text = text.replace(s, "***")
		return text

	def bench(self, *cmd):
		full = [self.a.bench, *cmd]
		res = self.runner(full, cwd=self.a.bench_dir, text=True, capture_output=True)
		if res.returncode != 0:
			raise RuntimeError(self._mask(f"{shlex.join(full)}\n{(res.stdout or '')[-1500:]}\n{(res.stderr or '')[-1500:]}"))
		return res.stdout or ""

	def summary(self, site):
		out = self.bench("--site", site, "execute", "dropout_core.checks.summary")
		lines = [ln for ln in out.splitlines() if ln.strip()]
		try:
			return json.loads(lines[-1])
		except (IndexError, json.JSONDecodeError) as e:
			raise RuntimeError(f"{site} 的 dropout_core.checks.summary 沒有回傳結果（dropout_core 要更新到有這個函式的版本）") from e

	def _backup(self):
		if getattr(self.a, "backup", None):
			return backup_files(os.path.abspath(self.a.backup)) if os.path.exists(self.a.backup) else None
		return latest_backup(self.a.bench_dir, self.a.site)

	def _restore_args(self, backup):
		args = ["--site", self.scratch, "restore", backup["files"]["database"], "--db-root-password", self.a.db_root_password or "", "--force"]
		if self.a.with_files:
			if "public" in backup["files"]:
				args += ["--with-public-files", backup["files"]["public"]]
			if "private" in backup["files"]:
				args += ["--with-private-files", backup["files"]["private"]]
		return args

	def run(self, apply=False):
		a = self.a
		if not SITE_RE.match(a.site or ""):
			self.out(f"site 名稱不對：{a.site}")
			return 1
		if not os.path.isdir(os.path.join(a.bench_dir, "sites", a.site)):
			self.out(f"找不到 {a.bench_dir}/sites/{a.site}")
			return 1
		backup = self._backup()
		if not backup:
			self.out(f"{a.site} 沒有找到備份。先跑 bench --site {a.site} backup，或用 --backup 指定檔案（例：從 R2 下載的 *-database.sql.gz）")
			return 1
		age = (self.now - backup["taken_at"]).total_seconds() / 3600 if backup["taken_at"] else None
		files = " + ".join(os.path.basename(p) for p in backup["files"].values()) if a.with_files else os.path.basename(backup["files"]["database"])
		steps = [
			f"最新備份：{os.path.basename(backup['files']['database'])}" + (f"（{age:.1f} 小時前）" if age is not None else ""),
			f"建暫存站 {self.scratch}，排程暫停、不寄信",
			f"還原 {files} 到暫存站",
			f"比對 {a.site} 與暫存站的單據筆數、資料檢查",
			f"刪掉暫存站（bench drop-site {self.scratch} --no-backup）",
			f"寫報告到 {self._report_dir()}/",
		]
		self.out(f"還原演練：{a.site}")
		for i, s in enumerate(steps, 1):
			self.out(f"{i}. {s}")
		if not apply:
			self.out("（預演。加 --apply 才會真的執行）")
			return 0
		if not a.db_root_password:
			self.out("要 --db-root-password 或環境變數 DB_ROOT_PASSWORD")
			return 1
		return self._apply(backup, age)

	def _apply(self, backup, age):
		a = self.a
		report = {
			"site": a.site,
			"scratch_site": self.scratch,
			"started_at": self.now.isoformat(timespec="seconds"),
			"backup": {k: os.path.basename(v) for k, v in backup["files"].items()},
			"backup_taken_at": backup["taken_at"].isoformat(timespec="seconds") if backup["taken_at"] else None,
			"backup_age_hours": round(age, 1) if age is not None else None,
			"rpo_hours": RPO_HOURS,
			"rto_hours": RTO_HOURS,
		}
		problems, notes = [], []
		if age is not None and age > RPO_HOURS:
			problems.append(f"最新備份是 {age:.1f} 小時前，超過 {RPO_HOURS} 小時（每日備份沒有跑）")
		created = False
		step = "建暫存站"
		try:
			if os.path.isdir(os.path.join(a.bench_dir, "sites", self.scratch)):
				self.out(f"  上次的暫存站還在，先刪掉 {self.scratch}")
				self._drop()
			started = time.monotonic()
			self.bench("new-site", self.scratch, "--admin-password", secrets.token_urlsafe(24), "--db-root-password", a.db_root_password)
			created = True
			self.bench("--site", self.scratch, "set-config", "pause_scheduler", "1", "--parse")
			self.bench("--site", self.scratch, "set-config", "mute_emails", "1", "--parse")
			step = "還原"
			self.out("  還原中…")
			self.bench(*self._restore_args(backup))
			report["restore_minutes"] = round((time.monotonic() - started) / 60, 1)
			step = "比對"
			source, restored = self.summary(a.site), self.summary(self.scratch)
			report["source"], report["restored"] = source, restored
			p, n = compare(source, restored)
			problems += p
			notes += n
		except RuntimeError as e:
			problems.append(f"{step}失敗：{e}")
		finally:
			if created:
				try:
					self._drop()
					report["scratch_dropped"] = True
				except RuntimeError as e:
					report["scratch_dropped"] = False
					problems.append(f"暫存站沒有刪掉，請手動 bench drop-site {self.scratch}：{e}")
		report["problems"], report["notes"], report["passed"] = problems, notes, not problems
		path = self._write(report)
		for line in notes:
			self.out(f"  提醒：{line}")
		for line in problems:
			self.out(f"  ✗ {line}")
		if "restore_minutes" in report:
			self.out(f"  還原花了 {report['restore_minutes']} 分鐘（目標 {RTO_HOURS} 小時內恢復服務）")
		self.out(f"{'通過' if not problems else '沒有通過'}。報告：{path}")
		return 0 if not problems else 1

	def _drop(self):
		self.bench("drop-site", self.scratch, "--db-root-password", self.a.db_root_password, "--no-backup", "--force")

	def _report_dir(self):
		return os.path.join(os.path.expanduser(self.a.state_dir), "restore-drills")

	def _write(self, report):
		folder = self._report_dir()
		os.makedirs(folder, exist_ok=True)
		path = os.path.join(folder, f"{self.a.site}-{self.now.strftime('%Y%m%d-%H%M%S')}.json")
		with open(path, "w", encoding="utf-8") as fh:
			fh.write(self._mask(json.dumps(report, ensure_ascii=False, indent=1)))
		os.chmod(path, 0o600)
		return path


def cmd_verify(a):
	return Drill(a).run(apply=a.apply)
