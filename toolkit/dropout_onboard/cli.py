import argparse
import json
import os
import subprocess
import sys

from dropout_onboard import checks, convert, fleet, plan as plan_mod
from dropout_onboard.bootstrap import Bootstrap
from dropout_onboard.provision import Provisioner


def _profile(path):
	with open(path, encoding="utf-8") as fh:
		data = json.load(fh)
	return data.get("profile", data)


def cmd_plan(a):
	print(json.dumps(plan_mod.plan(_profile(a.profile)), ensure_ascii=False, indent=1))


def cmd_mappings(_a):
	for source, kinds in convert.available().items():
		print(f"{source}: {', '.join(kinds)}")


def cmd_convert(a):
	mapping = convert.load_mapping(a.source, a.kind)
	rows = convert.read_table(a.input)
	defaults = dict(kv.split("=", 1) for kv in a.default or [])
	header, out, report = convert.convert(rows, mapping, defaults)
	convert.write_csv(a.output, header, out)
	print(f"{report['rows']} 筆 → {a.output}（{mapping['doctype']}）")
	if report["missing_columns"]:
		print(f"找不到必填欄位的來源表頭：{', '.join(report['missing_columns'])}。在 mappings/{a.source}/{a.kind}.json 的 from 補上實際表頭。")
	if report["unmapped_columns"]:
		print(f"沒有用到的欄位：{', '.join(report['unmapped_columns'])}")
	issues = checks.check(a.kind, header, out)
	_print_issues(issues)
	return 1 if report["missing_columns"] or any(i["level"] == "error" for i in issues) else 0


def _print_issues(issues):
	errors = [i for i in issues if i["level"] == "error"]
	warnings = [i for i in issues if i["level"] != "error"]
	for i in issues[:200]:
		print(f"  {'錯誤' if i['level'] == 'error' else '提醒'} 第 {i['row']} 列 {i['field']}「{i['value']}」：{i['problem']}")
	print(f"檢查：{len(errors)} 個錯誤、{len(warnings)} 個提醒" if issues else "檢查：全部通過")


def cmd_check(a):
	rows = convert.read_table(a.input)
	header = list(rows[0].keys()) if rows else []
	known = None
	if a.items:
		known = {r.get("item_code") for r in convert.read_table(a.items)}
	issues = checks.check(a.kind, header, [list(r.values()) for r in rows], known_items=known)
	_print_issues(issues)
	return 1 if any(i["level"] == "error" for i in issues) else 0


def _execute(a, method, kwargs):
	"""`bench execute` prints the return value as JSON on its last line.

	On an exception it retries the path through eval and reports a NameError
	instead, so the real error is only in the site's error log."""
	res = subprocess.run([a.bench, "--site", a.site, "execute", method, "--kwargs", json.dumps(kwargs, ensure_ascii=False)], cwd=a.bench_dir, text=True, capture_output=True)
	lines = [ln for ln in res.stdout.splitlines() if ln.strip()]
	if res.returncode != 0 or not lines:
		print(res.stdout[-2000:], res.stderr[-2000:])
		print(f"失敗。實際錯誤在 {a.bench_dir}/sites/{a.site}/logs 或後台 Error Log。")
		return None
	return json.loads(lines[-1])


DOCTYPE_FOR_KIND = {"customers": "Customer", "suppliers": "Supplier", "items": "Item", "opening_stock": "Stock Reconciliation"}


def cmd_import(a):
	"""Checks first, then a Data Import document (or, for opening stock, an Opening Stock reconciliation)."""
	rows = convert.read_table(a.input)
	header = list(rows[0].keys()) if rows else []
	issues = checks.check(a.kind, header, [list(r.values()) for r in rows])
	if any(i["level"] == "error" for i in issues):
		_print_issues(issues)
		print("有錯誤，先修好再匯入。")
		return 1
	if a.kind == "opening_stock":
		result = _execute(a, "dropout_core.provisioning.opening_stock", {"file_path": os.path.abspath(a.input)})
		if result is None:
			return 1
		print(f"期初庫存：{'已經匯過，略過' if result['status'] == 'already_done' else '已送出'} {', '.join(result['documents'])}")
		return 0
	kwargs = {"doctype": DOCTYPE_FOR_KIND[a.kind], "file_path": os.path.abspath(a.input), "import_type": a.type}
	result = _execute(a, "dropout_core.provisioning.data_import", kwargs)
	if result is None:
		return 1
	print(f"{result['data_import']}：{result['status']}，成功 {result['imported']} 筆")
	for f in result["failed"]:
		print(f"  第 {', '.join(str(r) for r in f['rows'])} 列：{'；'.join(str(m) for m in f['messages'])}")
	return 0 if not result["failed"] else 1


def cmd_opening(a):
	rows = convert.read_table(a.input)
	invoices = [
		{
			"party": r.get("party") or r.get("客人") or r.get("供應商"),
			"outstanding_amount": float((r.get("outstanding_amount") or r.get("未收金額") or r.get("未付金額") or "0").replace(",", "")),
			"posting_date": convert._transform(r.get("posting_date") or r.get("日期") or "", "date"),
			"due_date": convert._transform(r.get("due_date") or r.get("到期日") or "", "date"),
			"item_name": r.get("item_name") or "期初餘額",
		}
		for r in rows
	]
	kwargs = json.dumps({"company": a.company, "rows": invoices, "invoice_type": a.type}, ensure_ascii=False)
	cmd = [a.bench, "--site", a.site, "execute", "dropout_core.provisioning.make_opening_invoices", "--kwargs", kwargs]
	return subprocess.run(cmd, cwd=a.bench_dir).returncode


def cmd_provision(a):
	a.profile = _profile(a.profile)
	Provisioner(a).run(apply=a.apply)


def cmd_bootstrap(a):
	return Bootstrap(a).run(apply=a.apply)


def _provision_args(s, company_required=True):
	s.add_argument("--site", required=True)
	s.add_argument("--company", required=company_required)
	s.add_argument("--abbr")
	s.add_argument("--admin-email", required=True)
	s.add_argument("--admin-password", default=os.environ.get("ADMIN_PASSWORD", ""))
	s.add_argument("--db-root-password", default=os.environ.get("DB_ROOT_PASSWORD", ""))
	s.add_argument("--bench-dir", default=os.environ.get("BENCH_DIR", "/home/frappe/frappe-bench"))
	s.add_argument("--bench", default=os.environ.get("BENCH", "bench"))
	s.add_argument("--erpnext-url", help="膠水呼叫 ERPNext 用的網址（通常是 Tunnel 網址）")
	s.add_argument("--shell-url", default=os.environ.get("SHELL_URL"), help="這家公司的 DropOut OS 網址，用來設定 ERPNext 登入")
	s.add_argument("--glue-url", default=os.environ.get("GLUE_URL"))
	s.add_argument("--glue-admin-token", default=os.environ.get("GLUE_ADMIN_TOKEN"))
	s.add_argument("--mail-from")
	s.add_argument("--chatwoot-url", default=os.environ.get("CHATWOOT_URL"))
	s.add_argument("--chatwoot-platform-token", default=os.environ.get("CHATWOOT_PLATFORM_TOKEN"))
	s.add_argument("--vexa-url", default=os.environ.get("VEXA_URL"))
	s.add_argument("--vexa-admin-token", default=os.environ.get("VEXA_ADMIN_TOKEN"))
	s.add_argument("--calendar", dest="calendars", action="append", help="公司行事曆 ICS 網址，可多個")
	s.add_argument("--trial-days", type=int, default=30, help="第一次登記時的試用天數")
	s.add_argument("--renews-on", help="已簽年約時填到期日（YYYY-MM-DD），就不算試用")
	s.add_argument("--backup-bucket", default=os.environ.get("BACKUP_BUCKET"), help="R2／S3 bucket；金鑰用環境變數 BACKUP_ACCESS_KEY_ID、BACKUP_SECRET_ACCESS_KEY")
	s.add_argument("--backup-endpoint", default=os.environ.get("BACKUP_ENDPOINT"), help="例：https://<account>.r2.cloudflarestorage.com")
	s.add_argument("--state-dir", default=os.path.expanduser("~/.dropout-onboard"))
	s.add_argument("--apply", action="store_true")


def build_parser():
	p = argparse.ArgumentParser(prog="dropout-onboard", description="DropOut OS 導入工具：開站、搬家、檢查")
	sub = p.add_subparsers(dest="cmd", required=True)

	s = sub.add_parser("plan", help="依殼裡選的現場、規模、功能，列出要裝的 app 與搬家順序")
	s.add_argument("profile", help="ShopProfile JSON（殼的 /api/shop/profile 下載）")
	s.set_defaults(fn=cmd_plan)

	s = sub.add_parser("mappings", help="列出內建的欄位對照表")
	s.set_defaults(fn=cmd_mappings)

	s = sub.add_parser("convert", help="舊系統匯出檔 → ERPNext Data Import 檔，順便檢查")
	s.add_argument("--source", required=True, help="a1、ecount、excel")
	s.add_argument("--kind", required=True, choices=["customers", "suppliers", "items", "opening_stock"])
	s.add_argument("input")
	s.add_argument("output")
	s.add_argument("--default", action="append", help="例：customer_group=Commercial territory=Taiwan company=示範製造 warehouse='Stores - DM'")
	s.set_defaults(fn=cmd_convert)

	s = sub.add_parser("check", help="檢查已轉好的 Data Import 檔")
	s.add_argument("--kind", required=True, choices=["customers", "suppliers", "items", "opening_stock"])
	s.add_argument("input")
	s.add_argument("--items", help="商品檔，用來檢查期初庫存的料號")
	s.set_defaults(fn=cmd_check)

	for name, fn, help_text in (("import", cmd_import, "檢查通過後交給 ERPNext Data Import（留紀錄、可在後台看每列錯誤）"), ("opening-balances", cmd_opening, "期初應收應付：交給 ERPNext Opening Invoice Creation Tool")):
		s = sub.add_parser(name, help=help_text)
		s.add_argument("--site", required=True)
		s.add_argument("--bench-dir", default=os.environ.get("BENCH_DIR", "/home/frappe/frappe-bench"))
		s.add_argument("--bench", default=os.environ.get("BENCH", "bench"))
		s.add_argument("input")
		if name == "import":
			s.add_argument("--kind", required=True, choices=list(DOCTYPE_FOR_KIND))
			s.add_argument("--type", default="Insert", choices=["Insert", "Update"])
		else:
			s.add_argument("--company", required=True)
			s.add_argument("--type", default="Sales", choices=["Sales", "Purchase"])
		s.set_defaults(fn=fn)

	s = sub.add_parser("provision", help="開一家新公司（預設只預演）")
	s.add_argument("profile")
	_provision_args(s)
	s.set_defaults(fn=cmd_provision)

	s = sub.add_parser("bootstrap", help="一個指令導入一家公司：開站＋照順序匯入資料夾裡的檔案（預設只預演）")
	s.add_argument("folder", help="有 bootstrap.json 的資料夾，例：examples/service")
	_provision_args(s, company_required=False)
	s.set_defaults(fn=cmd_bootstrap)

	s = sub.add_parser("fleet", help="很多家公司：批次導入、列出、續約、暫停")
	fs = s.add_subparsers(dest="fleet_cmd", required=True)
	f = fs.add_parser("bootstrap", help="CSV 一列一家（folder,site,admin_email[,company,abbr,shell_url,renews_on,trial_days,calendar]），幾家同時跑")
	f.add_argument("csv")
	f.add_argument("--concurrency", type=int, default=2, help="同時開幾家（建站很吃 CPU，預設 2）")
	f.add_argument("--shell-url-template", help="例：https://{slug}.os.dropout.tw（slug 是 site 的第一段）")
	_shared_args(f)
	f.add_argument("--apply", action="store_true")
	f.set_defaults(fn=lambda a: fleet.bootstrap_many(a))
	f = fs.add_parser("list", help="所有公司的狀態、到期日、帳號數")
	_glue_args(f)
	f.set_defaults(fn=lambda a: fleet.list_accounts(a))
	f = fs.add_parser("renew", help="續約")
	f.add_argument("site")
	f.add_argument("--years", type=int, default=1)
	f.add_argument("--reference", help="收款單號，記在紀錄裡")
	_glue_args(f)
	f.set_defaults(fn=lambda a: fleet.change(a))
	for name, text in (("suspend", "暫停（只能看、能匯出）"), ("resume", "恢復"), ("cancel", "解約（資料保留、只能看）")):
		f = fs.add_parser(name, help=text)
		f.add_argument("site")
		f.add_argument("--reason")
		_glue_args(f)
		f.set_defaults(fn=lambda a: fleet.change(a))
	return p


def _glue_args(s):
	s.add_argument("--glue-url", default=os.environ.get("GLUE_URL"))
	s.add_argument("--glue-admin-token", default=os.environ.get("GLUE_ADMIN_TOKEN"))


def _shared_args(s):
	s.add_argument("--bench-dir", default=os.environ.get("BENCH_DIR", "/home/frappe/frappe-bench"))
	s.add_argument("--bench", default=os.environ.get("BENCH", "bench"))
	s.add_argument("--erpnext-url")
	s.add_argument("--mail-from")
	s.add_argument("--chatwoot-url", default=os.environ.get("CHATWOOT_URL"))
	s.add_argument("--chatwoot-platform-token", default=os.environ.get("CHATWOOT_PLATFORM_TOKEN"))
	s.add_argument("--vexa-url", default=os.environ.get("VEXA_URL"))
	s.add_argument("--vexa-admin-token", default=os.environ.get("VEXA_ADMIN_TOKEN"))
	s.add_argument("--backup-bucket", default=os.environ.get("BACKUP_BUCKET"))
	s.add_argument("--backup-endpoint", default=os.environ.get("BACKUP_ENDPOINT"))
	s.add_argument("--state-dir", default=os.path.expanduser("~/.dropout-onboard"))
	_glue_args(s)


def main_code(argv=None):
	args = build_parser().parse_args(argv)
	return args.fn(args) or 0


def main(argv=None):
	sys.exit(main_code(argv))


if __name__ == "__main__":
	main()
