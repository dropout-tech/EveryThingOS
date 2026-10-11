"""還原演練. Restores a site's latest backup (local, or the newest set in R2)
into a scratch site on the same bench (scheduler paused, email muted), compares
document totals and data checks with the live site, then drops the scratch site
and writes a report. Every step is an upstream bench command; nothing touches
the live site."""

import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone

from dropout_onboard.r2 import R2, R2Error

RPO_HOURS = 24
RTO_HOURS = 8
TAIPEI = timezone(timedelta(hours=8))
SITE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]*$")
STAMP_RE = re.compile(r"^\d{8}_\d{6}$")
# Frappe names backups `<YYYYmmdd_HHMMSS>-<site_with_underscores>[-partial]-database[-enc].sql.gz`, in the
# site's time zone (Asia/Taipei for ours). `-enc` marks System Settings → Encrypt Backups (gpg, v15).
DB_RE = re.compile(r"^(\d{8}_\d{6})-.+-database(-enc)?\.sql(\.gz)?$")
KINDS = (
	("private", re.compile(r"-private-files(-enc)?\.(tar|tgz)$")),
	("public", re.compile(r"-files(-enc)?\.(tar|tgz)$")),
	("config", re.compile(r"-site_config_backup(-enc)?\.json$")),
	("database", re.compile(r"-database(-enc)?\.sql(\.gz)?$")),
)
RESTORED = ("database", "public", "private")


def file_kind(name):
	for kind, rx in KINDS:
		if rx.search(name):
			return kind
	return None


def stamp_time(stamp):
	return datetime.strptime(stamp, "%Y%m%d_%H%M%S").replace(tzinfo=TAIPEI)


def scratch_name(site):
	return f"restore-drill.{site}"


def r2_prefix(site):
	"""Same folder as dropout_core.provisioning.configure_backups sets in S3 Backup Settings."""
	return f"{site}/"


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
	folder, name = os.path.split(db_path)
	m = DB_RE.match(name)
	base = re.sub(r"-database(-enc)?\.sql(\.gz)?$", "", name)
	files = {"database": db_path}
	try:
		siblings = sorted(os.listdir(folder))
	except OSError:
		siblings = []
	for n in siblings:
		kind = file_kind(n)
		if n.startswith(base + "-") and kind and kind != "database":
			files.setdefault(kind, os.path.join(folder, n))
	return {"taken_at": stamp_time(m.group(1)) if m else None, "files": files}


def remote_sets(objects, prefix):
	"""Backup sets in the bucket under `prefix`, oldest first. Frappe uploads each run to `<prefix><stamp>/`."""
	sets = {}
	for o in objects or []:
		rest = o["key"][len(prefix) :].split("/")
		if not o["key"].startswith(prefix) or len(rest) != 2 or not STAMP_RE.match(rest[0]) or not rest[1]:
			continue
		s = sets.setdefault(rest[0], {"stamp": rest[0], "taken_at": stamp_time(rest[0]), "files": {}, "keys": [], "bytes": 0})
		s["keys"].append(o["key"])
		s["bytes"] += o.get("size") or 0
		kind = file_kind(rest[1])
		if kind:
			s["files"].setdefault(kind, o["key"])
	return [sets[k] for k in sorted(sets) if "database" in sets[k]["files"]]


def newest_remote(r2, prefix):
	sets = remote_sets(r2.list(prefix), prefix)
	return sets[-1] if sets else None


def download(r2, backup, dest, kinds):
	"""Fetch the chosen files of a remote set into `dest` (mode 700). The config copy comes along when present: it holds the encryption key."""
	os.makedirs(dest, mode=0o700, exist_ok=True)
	os.chmod(dest, 0o700)
	files = {}
	for kind, key in backup["files"].items():
		if kind in kinds or kind == "config":
			path = os.path.join(dest, os.path.basename(key))
			r2.get(key, path)
			files[kind] = path
	return {**backup, "files": files, "remote": backup["files"]}


def is_encrypted(files):
	return "-enc" in os.path.basename(files.get("database", ""))


def encryption_key(files, site_config=None, given=None):
	"""Frappe v15 encrypts with gpg using `backup_encryption_key` from site_config.json; a fresh site would make a new one, so pass it explicitly."""
	if given:
		return given
	for path in (files.get("config"), site_config):
		if not path or not os.path.exists(path):
			continue
		try:
			with open(path, encoding="utf-8") as fh:
				key = json.load(fh).get("backup_encryption_key")
		except (OSError, ValueError):
			key = None
		if key:
			return key
	return None


def mb(n):
	return f"{(n or 0) / 1048576:.1f} MB"


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


class Bench:
	"""Runs bench commands and keeps every secret that appears in their output out of messages and reports."""

	def __init__(self, a, runner=subprocess.run):
		self.a, self.runner = a, runner
		self.secrets = [s for s in (getattr(a, "db_root_password", None), *(os.environ.get(k) for k in ("BACKUP_ACCESS_KEY_ID", "BACKUP_SECRET_ACCESS_KEY"))) if s]

	def hide(self, value):
		if value and value not in self.secrets:
			self.secrets.append(value)

	def mask(self, text):
		for s in self.secrets:
			text = text.replace(s, "***")
		return text

	def __call__(self, *cmd):
		full = [self.a.bench, *cmd]
		res = self.runner(full, cwd=self.a.bench_dir, text=True, capture_output=True)
		if res.returncode != 0:
			raise RuntimeError(self.mask(f"{shlex.join(full)}\n{(res.stdout or '')[-1500:]}\n{(res.stderr or '')[-1500:]}"))
		return res.stdout or ""

	def drop_site(self, site):
		"""`bench drop-site` moves the folder (files, backups) to archived/sites even with --no-backup; archive into a temp dir and delete it so no copy is left behind."""
		archive = tempfile.mkdtemp(prefix="dropout-drop-")
		try:
			self("drop-site", site, "--db-root-password", self.a.db_root_password, "--no-backup", "--force", "--archived-sites-path", archive)
		finally:
			shutil.rmtree(archive, ignore_errors=True)


class Drill:
	def __init__(self, args, out=print, runner=subprocess.run, now=None, r2=None):
		self.a = args
		self.out = out
		self.runner = runner
		self.now = now or datetime.now(TAIPEI)
		self.scratch = scratch_name(args.site)
		self.bench = Bench(args, runner)
		self.r2 = r2 or (R2.from_args(args, runner) if getattr(args, "from_r2", False) else None)

	@property
	def secrets(self):
		return self.bench.secrets

	def _mask(self, text):
		return self.bench.mask(text)

	def summary(self, site):
		out = self.bench("--site", site, "execute", "dropout_core.checks.summary")
		lines = [ln for ln in out.splitlines() if ln.strip()]
		try:
			return json.loads(lines[-1])
		except (IndexError, json.JSONDecodeError) as e:
			raise RuntimeError(f"{site} 的 dropout_core.checks.summary 沒有回傳結果（dropout_core 要更新到有這個函式的版本）") from e

	def _backup(self):
		if self.r2:
			return newest_remote(self.r2, r2_prefix(self.a.site))
		if getattr(self.a, "backup", None):
			return backup_files(os.path.abspath(self.a.backup)) if os.path.exists(self.a.backup) else None
		return latest_backup(self.a.bench_dir, self.a.site)

	def _kinds(self):
		return RESTORED if self.a.with_files else ("database",)

	def _restore_args(self, backup, key=None):
		args = ["--site", self.scratch, "restore", backup["files"]["database"], "--db-root-password", self.a.db_root_password or "", "--force"]
		if self.a.with_files:
			if "public" in backup["files"]:
				args += ["--with-public-files", backup["files"]["public"]]
			if "private" in backup["files"]:
				args += ["--with-private-files", backup["files"]["private"]]
		if key:
			args += ["--encryption-key", key]
		return args

	def _download_dir(self, backup):
		return os.path.join(os.path.expanduser(self.a.state_dir), "r2-downloads", f"{self.a.site}-{backup['stamp']}")

	def run(self, apply=False):
		a = self.a
		if not SITE_RE.match(a.site or ""):
			self.out(f"site 名稱不對：{a.site}")
			return 1
		if not os.path.isdir(os.path.join(a.bench_dir, "sites", a.site)):
			self.out(f"找不到 {a.bench_dir}/sites/{a.site}")
			return 1
		if self.r2 and self.r2.missing():
			self.out("R2 沒有設定：" + "、".join(self.r2.missing()))
			return 1
		try:
			backup = self._backup()
		except R2Error as e:
			self.out(self._mask(str(e)))
			return 1
		if not backup:
			where = f"R2 的 {r2_prefix(a.site)}" if self.r2 else f"sites/{a.site}/private/backups"
			self.out(f"{a.site} 在 {where} 沒有找到備份。先跑 bench --site {a.site} backup，或用 --backup 指定檔案")
			return 1
		age = (self.now - backup["taken_at"]).total_seconds() / 3600 if backup["taken_at"] else None
		names = [os.path.basename(backup["files"][k]) for k in self._kinds() if k in backup["files"]]
		steps = []
		if self.r2:
			steps.append(f"從 R2 下載 {r2_prefix(a.site)}{backup['stamp']}/ 的 {len(names)} 個檔（整份 {mb(backup['bytes'])}）到 {self._download_dir(backup)}/，做完刪掉")
		steps += [
			f"最新備份：{os.path.basename(backup['files']['database'])}" + (f"（{age:.1f} 小時前）" if age is not None else "") + ("，有加密" if is_encrypted(backup["files"]) else ""),
			f"建暫存站 {self.scratch}，排程暫停、不寄信",
			f"還原 {' + '.join(names)} 到暫存站",
			f"比對 {a.site} 與暫存站的單據筆數、資料檢查",
			f"刪掉暫存站（bench drop-site {self.scratch} --no-backup，封存資料夾也刪掉）",
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
			"from": "r2" if self.r2 else "local",
			"started_at": self.now.isoformat(timespec="seconds"),
			"backup": {k: os.path.basename(v) for k, v in backup["files"].items()},
			"backup_taken_at": backup["taken_at"].isoformat(timespec="seconds") if backup["taken_at"] else None,
			"backup_age_hours": round(age, 1) if age is not None else None,
			"encrypted": is_encrypted(backup["files"]),
			"rpo_hours": RPO_HOURS,
			"rto_hours": RTO_HOURS,
		}
		problems, notes = [], []
		if age is not None and age > RPO_HOURS:
			problems.append(f"最新備份是 {age:.1f} 小時前，超過 {RPO_HOURS} 小時（每日備份沒有跑）")
		created = False
		downloaded = None
		step = "下載" if self.r2 else "建暫存站"
		started = time.monotonic()
		try:
			if self.r2:
				self.out("  從 R2 下載中…")
				downloaded = self._download_dir(backup)
				backup = download(self.r2, backup, downloaded, self._kinds())
				report["download_minutes"] = round((time.monotonic() - started) / 60, 1)
			key = encryption_key(backup["files"], os.path.join(a.bench_dir, "sites", a.site, "site_config.json"), getattr(a, "encryption_key", None))
			self.bench.hide(key)
			if report["encrypted"] and not key:
				raise RuntimeError("備份有加密，但找不到金鑰：設定 BACKUP_ENCRYPTION_KEY，或確認備份裡的 site_config_backup 或正式站的 site_config.json 有 backup_encryption_key")
			step = "建暫存站"
			if os.path.isdir(os.path.join(a.bench_dir, "sites", self.scratch)):
				self.out(f"  上次的暫存站還在，先刪掉 {self.scratch}")
				self._drop()
			self.bench("new-site", self.scratch, "--admin-password", secrets.token_urlsafe(24), "--db-root-password", a.db_root_password)
			created = True
			self.bench("--site", self.scratch, "set-config", "pause_scheduler", "1", "--parse")
			self.bench("--site", self.scratch, "set-config", "mute_emails", "1", "--parse")
			step = "還原"
			self.out("  還原中…")
			self.bench(*self._restore_args(backup, key))
			report["restore_minutes"] = round((time.monotonic() - started) / 60, 1)
			step = "比對"
			source, restored = self.summary(a.site), self.summary(self.scratch)
			report["source"], report["restored"] = source, restored
			p, n = compare(source, restored)
			problems += p
			notes += n
		except (RuntimeError, R2Error) as e:
			problems.append(self._mask(f"{step}失敗：{e}"))
		finally:
			if created:
				try:
					self._drop()
					report["scratch_dropped"] = True
				except RuntimeError as e:
					report["scratch_dropped"] = False
					problems.append(f"暫存站沒有刪掉，請手動 bench drop-site {self.scratch}：{e}")
			if downloaded and not getattr(a, "keep_download", False):
				shutil.rmtree(downloaded, ignore_errors=True)
		report["problems"], report["notes"], report["passed"] = problems, notes, not problems
		path = self._write(report)
		for line in notes:
			self.out(f"  提醒：{line}")
		for line in problems:
			self.out(f"  ✗ {line}")
		if "restore_minutes" in report:
			self.out(f"  {'下載加' if self.r2 else ''}還原花了 {report['restore_minutes']} 分鐘（目標 {RTO_HOURS} 小時內恢復服務）")
		self.out(f"{'通過' if not problems else '沒有通過'}。報告：{path}")
		return 0 if not problems else 1

	def _drop(self):
		self.bench.drop_site(self.scratch)

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
