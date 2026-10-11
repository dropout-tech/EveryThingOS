"""Many companies at once.

`fleet bootstrap` reads a CSV (one company per row) and runs `bootstrap` for
each in its own process, a few at a time, with one log file per company.
Passwords and tokens are passed through the environment only, never argv, so
they do not show up in `ps` or in the logs.

`fleet list|renew|suspend|resume` talk to the glue's account API: the same
actions as the platform console, for scripts.
"""

import csv
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REQUIRED = ("folder", "site", "admin_email")
OPTIONAL = ("company", "abbr", "shell_url", "renews_on", "trial_days", "calendar")
SHARED = ("bench_dir", "bench", "erpnext_url", "glue_url", "mail_from", "chatwoot_url", "vexa_url", "backup_bucket", "backup_endpoint", "state_dir")
SECRETS = {"glue_admin_token": "GLUE_ADMIN_TOKEN", "chatwoot_platform_token": "CHATWOOT_PLATFORM_TOKEN", "vexa_admin_token": "VEXA_ADMIN_TOKEN"}

STAGE = {"trial": "試用", "active": "使用中", "due_soon": "快到期", "past_due": "寬限中", "read_only": "只能看", "suspended": "暫停", "cancelled": "已解約"}


def read_rows(path):
	with open(path, encoding="utf-8-sig", newline="") as fh:
		rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(fh)]
	problems = []
	seen = set()
	base = os.path.dirname(os.path.abspath(path))
	for i, r in enumerate(rows, 2):
		for key in REQUIRED:
			if not r.get(key):
				problems.append(f"第 {i} 列缺 {key}")
		if r.get("site") in seen:
			problems.append(f"第 {i} 列 site {r['site']} 重複")
		seen.add(r.get("site"))
		if r.get("folder"):
			r["folder"] = r["folder"] if os.path.isabs(r["folder"]) else os.path.join(base, r["folder"])
			if not os.path.exists(os.path.join(r["folder"], "bootstrap.json")):
				problems.append(f"第 {i} 列資料夾 {r['folder']} 沒有 bootstrap.json")
	return rows, problems


def _argv(row, a, apply):
	argv = [sys.executable, "-m", "dropout_onboard", "bootstrap", row["folder"], "--site", row["site"], "--admin-email", row["admin_email"]]
	for key in ("company", "abbr", "shell_url", "renews_on", "trial_days"):
		if row.get(key):
			argv += [f"--{key.replace('_', '-')}", row[key]]
	for ics in row.get("calendar", "").split():
		argv += ["--calendar", ics]
	if a.shell_url_template and not row.get("shell_url"):
		argv += ["--shell-url", a.shell_url_template.format(slug=row["site"].split(".")[0], site=row["site"])]
	for key in SHARED:
		value = getattr(a, key, None)
		if value:
			argv += [f"--{key.replace('_', '-')}", str(value)]
	if apply:
		argv.append("--apply")
	return argv


def _env(a):
	env = dict(os.environ)
	for key, name in SECRETS.items():
		value = getattr(a, key, None)
		if value:
			env[name] = value
	return env


def _progress(log_path):
	try:
		with open(log_path, encoding="utf-8") as fh:
			lines = [ln.strip() for ln in fh if ln.strip()]
	except OSError:
		return ""
	marks = [ln for ln in lines if ln.startswith("== 導入進度")]
	return marks[-1].removeprefix("== ") if marks else (lines[-1][:120] if lines else "")


def bootstrap_many(a, out=print, runner=subprocess.run):
	rows, problems = read_rows(a.csv)
	if problems:
		for p in problems:
			out(f"  錯誤：{p}")
		return 1
	logs = os.path.join(os.path.expanduser(a.state_dir), "fleet-logs")
	os.makedirs(logs, exist_ok=True)
	env = _env(a)
	out(f"{len(rows)} 家公司，一次 {a.concurrency} 家{'' if a.apply else '（預演）'}；每家的紀錄在 {logs}/")

	def one(row):
		log_path = os.path.join(logs, f"{row['site']}.log")
		with open(log_path, "w", encoding="utf-8") as log:
			res = runner(_argv(row, a, a.apply), stdout=log, stderr=subprocess.STDOUT, env=env, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
		os.chmod(log_path, 0o600)
		return row, res.returncode, _progress(log_path)

	failed = 0
	with ThreadPoolExecutor(max_workers=max(1, a.concurrency)) as pool:
		for row, code, progress in pool.map(one, rows):
			failed += code != 0
			out(f"  {'✓' if code == 0 else '✗'} {row['site']}：{progress or ('完成' if code == 0 else '失敗，看紀錄')}")
	out(f"完成 {len(rows) - failed}／{len(rows)}" + ("；失敗的修好再跑一次，做過的步驟會略過" if failed else ""))
	return 1 if failed else 0


def _glue(a, method, path, body=None):
	if not a.glue_url or not a.glue_admin_token:
		raise SystemExit("要 --glue-url 與 GLUE_ADMIN_TOKEN")
	req = urllib.request.Request(
		f"{a.glue_url.rstrip('/')}{path}",
		data=json.dumps(body).encode() if body is not None else None,
		method=method,
		headers={"authorization": f"Bearer {a.glue_admin_token}", "content-type": "application/json", "x-actor": os.environ.get("USER", "dropout-onboard")},
	)
	try:
		with urllib.request.urlopen(req, timeout=30) as res:
			return json.loads(res.read().decode())
	except urllib.error.HTTPError as e:
		raise SystemExit(f"膠水回應 {e.code}：{e.read().decode()[:300]}") from e


def list_accounts(a, out=print):
	data = _glue(a, "GET", "/admin/accounts")
	out(f"今天 {data['today']}，{len(data['accounts'])} 家")
	for acc in data["accounts"]:
		life = acc["lifecycle"]
		usage = acc.get("usage") or {}
		out(f"  {acc['company']}（{acc['site']}）{STAGE.get(life['stage'], life['stage'])} 到 {life.get('ends') or '—'} · 帳號 {usage.get('users', '—')} · {' '.join(acc.get('hosts') or [])}")
	return 0


def change(a, out=print):
	site = a.site
	if a.fleet_cmd == "renew":
		data = _glue(a, "POST", f"/admin/accounts/{site}/renew", {"years": a.years, "reference": a.reference})
	else:
		state = {"suspend": "suspended", "resume": "active", "cancel": "cancelled"}[a.fleet_cmd]
		data = _glue(a, "POST", f"/admin/accounts/{site}/state", {"state": state, "reason": getattr(a, "reason", None)})
	acc = data["account"]
	out(f"{acc['company']}：{STAGE.get(acc['lifecycle']['stage'])}{'，' + acc['lifecycle']['message'] if acc['lifecycle']['message'] else ''}")
	return 0
