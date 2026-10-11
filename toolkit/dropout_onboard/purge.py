"""解約滿 90 天後刪除一家公司.

`fleet purge <site>` asks the glue whether the account is due (cancelled 90+
days ago), takes one last backup to `purged/<site>/<stamp>/` in R2, drops the
site (no archived copy left), deletes the site's daily backups under `<site>/`,
then marks the account purged in the glue. Every step is posted to the glue so
it lands in the account history. Dry-run unless --apply, and --apply asks for
the site name unless --yes.

`fleet purge-sweep` deletes final backups older than the retention window
(default 30 days) and records that in the glue too. The bucket's lifecycle
rule on `purged/` is the backstop if nobody runs it.
"""

import json
import os
import subprocess
from datetime import datetime

from dropout_onboard import fleet
from dropout_onboard.backup import SITE_RE, TAIPEI, Bench, latest_backup, mb, r2_prefix, remote_sets
from dropout_onboard.r2 import R2, R2Error

FINAL_PREFIX = "purged/"
FINAL_DAYS = 30


def final_prefix(site):
	return f"{FINAL_PREFIX}{site}/"


class Stop(Exception):
	pass


class Purge:
	def __init__(self, a, out=print, runner=subprocess.run, r2=None, glue=None, ask=input, now=None):
		self.a, self.out, self.ask = a, out, ask
		self.bench = Bench(a, runner)
		self.r2 = r2 or R2.from_args(a, runner)
		self.glue = glue or (lambda method, path, body=None: fleet._glue(a, method, path, body))
		self.now = now or datetime.now(TAIPEI)
		self.report = {"site": a.site, "started_at": self.now.isoformat(timespec="seconds"), "steps": []}

	def _site_dir(self):
		return os.path.join(self.a.bench_dir, "sites", self.a.site)

	def _step(self, step, detail):
		self.glue("POST", f"/admin/accounts/{self.a.site}/purge", {"step": step, "detail": detail})
		self.report["steps"].append({"step": step, "detail": detail, "at": datetime.now(TAIPEI).isoformat(timespec="seconds")})
		self.out(f"  ✓ {detail}")

	def _account(self):
		try:
			data = self.glue("GET", f"/admin/accounts/{self.a.site}")
		except SystemExit as e:
			raise Stop(f"膠水查不到 {self.a.site}：{e}") from e
		return data["account"]

	def run(self, apply=False):
		a = self.a
		if not SITE_RE.match(a.site or "") or a.site in ("purged", "d1"):
			self.out(f"site 名稱不對：{a.site}")
			return 1
		if self.r2.missing():
			self.out("R2 沒有設定：" + "、".join(self.r2.missing()))
			return 1
		try:
			acc = self._account()
			p = acc.get("purge") or {}
			if acc.get("state") != "cancelled":
				raise Stop(f"{a.site} 還沒解約（{acc.get('state')}），不能刪除")
			if not p.get("due") and not p.get("purged_at"):
				raise Stop(f"{a.site} 解約還沒滿 90 天，{p.get('due_on') or '—'} 起才能刪除；這段期間客戶還能匯出資料")
			daily = self.r2.list(r2_prefix(a.site))
			finals = remote_sets(self.r2.list(final_prefix(a.site)), final_prefix(a.site))
		except (Stop, R2Error) as e:
			self.out(self.bench.mask(str(e)))
			return 1
		exists = os.path.isdir(self._site_dir())
		if p.get("purged_at") and not exists and not daily:
			self.out(f"{a.site} 在 {p['purged_at'][:10]} 已經刪除；最後備份還有 {len(finals)} 份（purge-sweep 會在 {FINAL_DAYS} 天後刪）")
			return 0
		self.out(f"刪除 {acc.get('company') or a.site}（{a.site}），解約日 {(acc.get('cancelled_at') or '—')[:10]}，{p.get('due_on')} 起可刪")
		steps = []
		if exists:
			steps.append(f"最後備份：bench --site {a.site} backup --with-files，上傳到 R2 的 {final_prefix(a.site)}<時間>/，保留 {FINAL_DAYS} 天")
			steps.append(f"刪除站台：bench drop-site {a.site} --no-backup（資料庫與檔案，不留封存）")
		else:
			steps.append(f"站台已經不在本機；最後備份 {len(finals)} 份" + ("" if finals else "（沒有，不會繼續）"))
		steps.append(f"刪除 R2 的 {r2_prefix(a.site)} 每日備份：{len(daily)} 個檔，{mb(sum(o.get('size') or 0 for o in daily))}")
		steps.append("膠水標記已刪除：清掉網址、設定與用量，留下帳戶紀錄")
		for i, s in enumerate(steps, 1):
			self.out(f"{i}. {s}")
		if not apply:
			self.out("（預演。加 --apply 才會真的刪除）")
			return 0
		if exists and not a.db_root_password:
			self.out("要 --db-root-password 或環境變數 DB_ROOT_PASSWORD")
			return 1
		if not exists and not finals:
			self.out(f"本機沒有 {a.site}，R2 也沒有最後備份；不刪 R2 的每日備份。確認站台在哪裡後再跑")
			return 1
		if not getattr(a, "yes", False):
			typed = self.ask(f"這會永久刪除 {a.site} 的資料。輸入站台名稱確認：").strip()
			if typed != a.site:
				self.out("名稱不符，沒有刪除")
				return 1
		code = self._apply(exists, daily)
		path = self._write()
		self.out(f"{'完成' if code == 0 else '沒有做完，修好後再跑一次，做過的步驟會略過'}。紀錄：{path}")
		return code

	def _apply(self, exists, daily):
		a = self.a
		step = "開始"
		try:
			self._step("started", f"{a.site}：開始刪除")
			if exists:
				step = "最後備份"
				self.bench("--site", a.site, "backup", "--with-files")
				b = latest_backup(a.bench_dir, a.site)
				if not b:
					raise Stop("備份跑完卻找不到檔案")
				stamp = b["taken_at"].strftime("%Y%m%d_%H%M%S")
				dest = f"{final_prefix(a.site)}{stamp}/"
				sizes = {}
				for path in b["files"].values():
					self.r2.put(path, dest + os.path.basename(path))
					sizes[dest + os.path.basename(path)] = os.path.getsize(path)
				got = {o["key"]: o.get("size") for o in self.r2.list(dest)}
				short = [k for k, n in sizes.items() if got.get(k) != n]
				if short:
					raise Stop("最後備份上傳不完整：" + "、".join(os.path.basename(k) for k in short))
				self.report["final_backup"] = dest
				self._step("final_backup", f"最後備份 {dest}（{len(sizes)} 個檔，{mb(sum(sizes.values()))}），保留 {FINAL_DAYS} 天")
				step = "刪除站台"
				self.bench.drop_site(a.site)
				self._step("dropped", f"刪除站台 {a.site}（資料庫與檔案）")
			step = "刪除 R2 備份"
			daily = self.r2.list(r2_prefix(a.site))
			res = self.r2.delete([o["key"] for o in daily])
			if res.get("errors"):
				raise Stop(f"R2 有 {len(res['errors'])} 個檔沒刪掉：{res['errors'][0]}")
			self._step("r2_deleted", f"刪除 R2 的 {r2_prefix(a.site)}：{res.get('deleted', 0)} 個檔")
			step = "膠水"
			self._step("done", f"{a.site} 已刪除")
			return 0
		except (Stop, RuntimeError, R2Error, SystemExit) as e:
			msg = self.bench.mask(f"{step}失敗：{e}")
			self.report["error"] = msg
			self.out(f"  ✗ {msg}")
			return 1

	def _write(self):
		folder = os.path.join(os.path.expanduser(self.a.state_dir), "purges")
		os.makedirs(folder, exist_ok=True)
		path = os.path.join(folder, f"{self.a.site}-{self.now.strftime('%Y%m%d-%H%M%S')}.json")
		with open(path, "w", encoding="utf-8") as fh:
			fh.write(self.bench.mask(json.dumps(self.report, ensure_ascii=False, indent=1)))
		os.chmod(path, 0o600)
		return path


def sweep(a, out=print, runner=subprocess.run, r2=None, glue=None, ask=input, now=None):
	"""Delete final backups older than --older-than-days under purged/."""
	r2 = r2 or R2.from_args(a, runner)
	glue = glue or (lambda method, path, body=None: fleet._glue(a, method, path, body))
	now = now or datetime.now(TAIPEI)
	if r2.missing():
		out("R2 沒有設定：" + "、".join(r2.missing()))
		return 1
	try:
		folders = [f[len(FINAL_PREFIX) :].rstrip("/") for f in r2.folders(FINAL_PREFIX)]
		due = []
		for site in folders:
			for s in remote_sets(r2.list(final_prefix(site)), final_prefix(site)):
				days = (now - s["taken_at"]).days
				if days >= a.older_than_days:
					due.append((site, s, days))
	except R2Error as e:
		out(str(e))
		return 1
	out(f"R2 的 {FINAL_PREFIX} 有 {len(folders)} 家；超過 {a.older_than_days} 天的最後備份 {len(due)} 份")
	for site, s, days in due:
		out(f"  {site}：{s['stamp']}（{days} 天前，{mb(s['bytes'])}）")
	if not due:
		return 0
	if not a.apply:
		out("（預演。加 --apply 才會真的刪除）")
		return 0
	if not getattr(a, "yes", False) and ask(f"永久刪除這 {len(due)} 份最後備份？輸入 delete 確認：").strip() != "delete":
		out("沒有刪除")
		return 1
	failed = 0
	for site, s, _ in due:
		try:
			res = r2.delete(s["keys"])
			if res.get("errors"):
				raise R2Error(res["errors"][0])
		except R2Error as e:
			failed += 1
			out(f"  ✗ {site}：{e}")
			continue
		try:
			glue("POST", f"/admin/accounts/{site}/purge", {"step": "final_deleted", "detail": f"刪除最後備份 {final_prefix(site)}{s['stamp']}/"})
			out(f"  ✓ {site}：刪除 {s['stamp']}")
		except SystemExit as e:
			failed += 1
			out(f"  ✗ {site}：R2 已刪，但膠水沒有記到：{e}")
	return 1 if failed else 0
