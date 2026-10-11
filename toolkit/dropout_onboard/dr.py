"""整台主機壞掉：在新主機上從 R2 把每家公司還原回來.

`fleet restore-all --from-r2` picks the sites (--site, else every account in
the glue that is not purged, paying customers first, else every folder in the
bucket), and for each one that is not on this bench yet: downloads its newest
set, creates the site, carries the old site_config keys that are not about the
database (encryption_key above all, or saved passwords cannot be decrypted),
restores database and files, and migrates. One site at a time; a failure drops
the half-made site and moves on. Progress goes to a log and a state file under
<state-dir>/restore-all/, so a second run picks up where the first stopped.
"""

import json
import os
import secrets
import shutil
import subprocess
import time
from datetime import datetime

from dropout_onboard import fleet
from dropout_onboard.backup import RTO_HOURS, SITE_RE, TAIPEI, Bench, download, encryption_key, is_encrypted, mb, newest_remote, r2_prefix
from dropout_onboard.purge import FINAL_PREFIX
from dropout_onboard.r2 import R2, R2Error

DB_KEYS = ("db_name", "db_password", "db_type", "db_host", "db_port", "db_socket")
FIRST = ("active", "due_soon", "past_due", "trial", "read_only", "suspended", "cancelled")
NOT_SITES = (FINAL_PREFIX.rstrip("/"), "d1")


def carry_config(old_path, new_path):
	"""Merge the backed-up site_config into the new site's, keeping the new database credentials."""
	with open(old_path, encoding="utf-8") as fh:
		old = json.load(fh)
	with open(new_path, encoding="utf-8") as fh:
		new = json.load(fh)
	carried = sorted(k for k in old if k not in DB_KEYS)
	new.update({k: old[k] for k in carried})
	with open(new_path, "w", encoding="utf-8") as fh:
		json.dump(new, fh, indent=1)
	return carried


class RestoreAll:
	def __init__(self, a, out=print, runner=subprocess.run, r2=None, glue=None, now=None, clock=time.monotonic):
		self.a, self.clock = a, clock
		self.bench = Bench(a, runner)
		self.r2 = r2 or R2.from_args(a, runner)
		self.glue = glue or (lambda method, path, body=None: fleet._glue(a, method, path, body))
		self.now = now or datetime.now(TAIPEI)
		self.dir = os.path.join(os.path.expanduser(a.state_dir), "restore-all")
		self.state_path = os.path.join(self.dir, "state.json")
		self._out = out
		self.log = None

	def out(self, line):
		line = self.bench.mask(line)
		self._out(line)
		if self.log:
			self.log.write(f"{datetime.now(TAIPEI).strftime('%H:%M:%S')} {line}\n")
			self.log.flush()

	def sites(self):
		if self.a.sites:
			return list(self.a.sites), "指定"
		if getattr(self.a, "glue_url", None) and getattr(self.a, "glue_admin_token", None):
			accounts = [x for x in self.glue("GET", "/admin/accounts")["accounts"] if not x.get("purged_at")]
			rank = {s: i for i, s in enumerate(FIRST)}
			accounts.sort(key=lambda x: (rank.get(x["lifecycle"]["stage"], len(FIRST)), x["site"]))
			return [x["site"] for x in accounts], "膠水"
		return [f.rstrip("/") for f in self.r2.folders("") if f.rstrip("/") not in NOT_SITES], "R2"

	def _load(self):
		try:
			with open(self.state_path, encoding="utf-8") as fh:
				return json.load(fh)
		except (OSError, ValueError):
			return {"sites": {}}

	def _save(self, state):
		with open(self.state_path, "w", encoding="utf-8") as fh:
			json.dump(state, fh, ensure_ascii=False, indent=1)
		os.chmod(self.state_path, 0o600)

	def run(self, apply=False):
		a = self.a
		if self.r2.missing():
			self._out("R2 沒有設定：" + "、".join(self.r2.missing()))
			return 1
		try:
			sites, origin = self.sites()
			bad = [s for s in sites if not SITE_RE.match(s)]
			if bad:
				self._out("site 名稱不對：" + "、".join(bad))
				return 1
			plan = []
			for site in sites:
				if os.path.isdir(os.path.join(a.bench_dir, "sites", site)):
					plan.append((site, None, "已經在這台，略過"))
					continue
				b = newest_remote(self.r2, r2_prefix(site))
				if not b:
					plan.append((site, None, f"R2 的 {r2_prefix(site)} 沒有備份"))
					continue
				age = (self.now - b["taken_at"]).total_seconds() / 3600
				plan.append((site, b, f"{b['stamp']}（{age:.1f} 小時前，{mb(b['bytes'])}{'，有加密' if is_encrypted(b['files']) else ''}）"))
		except (R2Error, SystemExit) as e:
			self._out(self.bench.mask(f"列不出要還原的站台：{e}"))
			return 1
		todo = [p for p in plan if p[1]]
		total = sum(b["bytes"] for _, b, _ in todo)
		self._out(f"從 R2 還原整台主機：{len(sites)} 家（來源：{origin}），要還原 {len(todo)} 家，共 {mb(total)}")
		for site, b, note in plan:
			self._out(f"  {'→' if b else '·'} {site}：{note}")
		missing = [site for site, b, note in plan if not b and "略過" not in note]
		if not apply:
			self._out(f"每家：下載 → bench new-site → 帶回舊的 site_config（加密金鑰等，資料庫帳密用新的）→ bench restore（含附件）→ bench migrate → 刪下載檔")
			self._out(f"（預演。加 --apply 才會真的還原；目標 {RTO_HOURS} 小時內全部恢復）")
			return 1 if missing else 0
		if not a.db_root_password:
			self._out("要 --db-root-password 或環境變數 DB_ROOT_PASSWORD")
			return 1
		os.makedirs(self.dir, mode=0o700, exist_ok=True)
		log_path = os.path.join(self.dir, f"{self.now.strftime('%Y%m%d-%H%M%S')}.log")
		state = self._load()
		started = self.clock()
		failed = []
		with open(log_path, "a", encoding="utf-8") as self.log:
			os.chmod(log_path, 0o600)
			self.out(f"開始還原 {len(todo)} 家；紀錄 {log_path}")
			for i, (site, b, _) in enumerate(todo, 1):
				t0 = self.clock()
				self.out(f"[{i}/{len(todo)}] {site}")
				err = self._one(site, b)
				minutes = round((self.clock() - t0) / 60, 1)
				state["sites"][site] = {"status": "failed" if err else "done", "backup": b["stamp"], "minutes": minutes, "error": err, "at": datetime.now(TAIPEI).isoformat(timespec="seconds")}
				self._save(state)
				if err:
					failed.append(site)
					self.out(f"  ✗ {err}")
				else:
					self.out(f"  ✓ {minutes} 分鐘")
				spent = (self.clock() - started) / 3600
				left = spent / i * (len(todo) - i)
				self.out(f"  已花 {spent:.1f} 小時，估計還要 {left:.1f} 小時" + ("（會超過 RTO，考慮再開一台分著跑：--site 指定一部分）" if spent + left > RTO_HOURS else ""))
			hours = (self.clock() - started) / 3600
			self.out(f"完成 {len(todo) - len(failed)}／{len(todo)}，{hours:.1f} 小時（目標 {RTO_HOURS} 小時）")
			for site in failed + missing:
				self.out(f"  沒有還原：{site}" + ("（看上面的錯誤，修好後再跑一次）" if site in failed else "（R2 沒有備份）"))
			self.out("接著：確認 Tunnel 指到這台、膠水的 erpnext_url 不用改；用 dropout-onboard backup verify 抽查一家；在平台後台看每家的健康")
		self.log = None
		return 1 if failed or missing else 0

	def _one(self, site, b):
		a = self.a
		dest = os.path.join(self.dir, "downloads", f"{site}-{b['stamp']}")
		created = False
		step = "下載"
		try:
			self.out("  下載中…")
			got = download(self.r2, b, dest, ("database", "public", "private"))
			files = got["files"]
			key = encryption_key(files, None, getattr(a, "encryption_key", None))
			self.bench.hide(key)
			if is_encrypted(files) and not key:
				raise RuntimeError("備份有加密，但找不到金鑰（備份裡的 site_config_backup 沒有 backup_encryption_key；用 --encryption-key 指定）")
			step = "建站"
			cmd = ["new-site", site, "--admin-password", secrets.token_urlsafe(24), "--db-root-password", a.db_root_password]
			if getattr(a, "mariadb_user_host_login_scope", None):
				cmd += ["--mariadb-user-host-login-scope", a.mariadb_user_host_login_scope]
			self.bench(*cmd)
			created = True
			if "config" in files:
				step = "帶回設定"
				carried = carry_config(files["config"], os.path.join(a.bench_dir, "sites", site, "site_config.json"))
				self.out(f"  帶回設定 {len(carried)} 項")
			else:
				self.out("  ! 備份裡沒有 site_config_backup：存過的密碼（郵件、整合金鑰）要重新輸入")
			step = "還原"
			self.out("  還原中…")
			args = ["--site", site, "restore", files["database"], "--db-root-password", a.db_root_password, "--force"]
			if "public" in files:
				args += ["--with-public-files", files["public"]]
			if "private" in files:
				args += ["--with-private-files", files["private"]]
			if key:
				args += ["--encryption-key", key]
			self.bench(*args)
			step = "migrate"
			self.bench("--site", site, "migrate")
			return None
		except (RuntimeError, R2Error, OSError, ValueError) as e:
			if created:
				try:
					self.bench.drop_site(site)
				except RuntimeError as drop:
					return self.bench.mask(f"{step}失敗：{e}；做一半的站台也沒刪掉，請手動 bench drop-site {site}：{drop}")
			return self.bench.mask(f"{step}失敗：{e}")
		finally:
			shutil.rmtree(dest, ignore_errors=True)


def cmd_restore_all(a):
	return RestoreAll(a).run(apply=a.apply)
