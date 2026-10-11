"""一個指令導入一家公司：開站，再把資料夾裡的檔案照搬家順序匯進去.

A company folder holds `bootstrap.json` plus the files it names:

	{
	  "company": "安安顧問", "abbr": "AAC",
	  "profile": {"scene": "service", "size": "small", "modules": ["crm", "sales", "finance"]},
	  "source": "excel",
	  "files": {"customers": "customers.csv", "items": "items.csv", ...},
	  "opening_receivables": "ar.csv", "opening_payables": "ap.csv"
	}

Every step is recorded in the provisioner's state file under the file's hash,
so running the same folder again only does what is new."""

import hashlib
import json
import os

from dropout_onboard import checks, convert
from dropout_onboard.provision import Provisioner

KINDS = ["customers", "suppliers", "items", "opening_stock"]
DOCTYPE = {"customers": "Customer", "suppliers": "Supplier", "items": "Item"}
OPENING = {"opening_receivables": "Sales", "opening_payables": "Purchase"}
LABEL = {"customers": "客人", "suppliers": "供應商", "items": "商品與售價", "opening_stock": "期初庫存", "opening_receivables": "期初應收", "opening_payables": "期初應付"}
PLACEHOLDER = "（導入時由 ERPNext 設定決定）"


def load(folder):
	path = os.path.join(folder, "bootstrap.json")
	if not os.path.exists(path):
		raise SystemExit(f"{folder} 裡沒有 bootstrap.json")
	with open(path, encoding="utf-8") as fh:
		spec = json.load(fh)
	for key in ("company", "profile"):
		if key not in spec:
			raise SystemExit(f"bootstrap.json 少了 {key}")
	for name in list(spec.get("files", {}).values()) + [spec[k] for k in OPENING if spec.get(k)]:
		if not os.path.exists(os.path.join(folder, name)):
			raise SystemExit(f"bootstrap.json 寫了 {name}，但資料夾裡沒有這個檔")
	return spec


def _sha(path):
	with open(path, "rb") as fh:
		return hashlib.sha256(fh.read()).hexdigest()[:16]


def _opening_rows(path):
	rows = convert.read_table(path)
	return [
		{
			"party": r.get("party") or r.get("客人") or r.get("供應商"),
			"outstanding_amount": float((r.get("outstanding_amount") or r.get("未收金額") or r.get("未付金額") or "0").replace(",", "")),
			"posting_date": convert._transform(r.get("posting_date") or r.get("日期") or "", "date"),
			"due_date": convert._transform(r.get("due_date") or r.get("到期日") or "", "date"),
			"item_name": r.get("item_name") or "期初餘額",
		}
		for r in rows
	]


class Bootstrap:
	def __init__(self, args, out=print):
		self.a, self.out = args, out
		self.folder = os.path.abspath(args.folder)
		self.spec = load(self.folder)
		args.profile = self.spec["profile"]
		args.company = args.company or self.spec["company"]
		args.abbr = args.abbr or self.spec.get("abbr")
		self.prov = Provisioner(args, out)
		self.work = os.path.join(args.state_dir, f"{args.site}-files")

	def _convert(self, kind, defaults):
		src = os.path.join(self.folder, self.spec["files"][kind])
		mapping = convert.load_mapping(self.spec.get("source", "excel"), kind)
		header, rows, report = convert.convert(convert.read_table(src), mapping, defaults)
		issues = checks.check(kind, header, rows)
		if report["missing_columns"]:
			issues.insert(0, {"level": "error", "row": 0, "field": "表頭", "value": "、".join(report["missing_columns"]), "problem": "找不到必填欄位"})
		os.makedirs(self.work, exist_ok=True)
		dst = os.path.join(self.work, f"{kind}.csv")
		convert.write_csv(dst, header, rows)
		return src, dst, len(rows), issues

	def _report(self, kind, issues):
		errors = [i for i in issues if i["level"] == "error"]
		for i in issues[:50]:
			self.out(f"    {'錯誤' if i['level'] == 'error' else '提醒'} 第 {i['row']} 列 {i['field']}「{i['value']}」：{i['problem']}")
		return not errors

	def run(self, apply=False):
		self.out(f"== {self.a.company}：開站")
		self.prov.run(apply=apply)
		files = self.spec.get("files", {})
		self.out(f"== {self.a.company}：搬家")
		if not apply:
			ok = True
			for kind in KINDS:
				if kind in files:
					_src, _dst, n, issues = self._convert(kind, {k: PLACEHOLDER for k in ("company", "warehouse", "customer_group", "supplier_group", "territory", "item_group", "posting_date")})
					good = self._report(kind, issues)
					ok = ok and good
					self.out(f"  {LABEL[kind]}：{n} 筆 {'檢查通過' if good else '有錯誤'}")
			for key in OPENING:
				if self.spec.get(key):
					self.out(f"  {LABEL[key]}：{len(_opening_rows(os.path.join(self.folder, self.spec[key])))} 筆")
			self.out("（預演。加 --apply 才會真的匯入）")
			return 0 if ok else 1

		done = self.prov.state.setdefault("imports", {})
		defaults = self.prov.execute("dropout_core.provisioning.import_defaults", company=self.a.company)
		for kind in KINDS:
			if kind not in files:
				continue
			src, dst, n, issues = self._convert(kind, defaults)
			key = f"{kind}:{_sha(src)}"
			if done.get(key):
				self.out(f"  ✓ {LABEL[kind]}：已經匯過")
				continue
			if not self._report(kind, issues):
				self.out(f"  ✗ {LABEL[kind]}：有錯誤，先修好 {src} 再跑一次")
				return 1
			if kind == "opening_stock":
				result = self.prov.execute("dropout_core.provisioning.opening_stock", file_path=dst)
				self.out(f"  ✓ {LABEL[kind]}：{'、'.join(result['documents'])}")
			else:
				result = self.prov.execute("dropout_core.provisioning.data_import", doctype=DOCTYPE[kind], file_path=dst, import_type="Insert")
				self.out(f"  {'✓' if not result['failed'] else '!'} {LABEL[kind]}：成功 {result['imported']}／{n}（{result['data_import']}）")
				for f in result["failed"][:20]:
					self.out(f"    第 {', '.join(str(r) for r in f['rows'])} 列：{'；'.join(str(m) for m in f['messages'])}")
				if result["failed"]:
					self.out(f"  ✗ 有 {len(result['failed'])} 列沒進去。修好後到後台的 {result['data_import']} 重跑失敗的列，或改檔案再跑一次。")
					return 1
			done[key] = True
			self.prov.save()
		for key, invoice_type in OPENING.items():
			if not self.spec.get(key):
				continue
			src = os.path.join(self.folder, self.spec[key])
			mark = f"{key}:{_sha(src)}"
			if done.get(mark):
				self.out(f"  ✓ {LABEL[key]}：已經匯過")
				continue
			self.prov.execute("dropout_core.provisioning.make_opening_invoices", company=self.a.company, rows=_opening_rows(src), invoice_type=invoice_type)
			self.out(f"  ✓ {LABEL[key]}：已交給 Opening Invoice Creation Tool")
			done[mark] = True
			self.prov.save()
		status = self.prov.execute("dropout_core.api.setup_status")
		if isinstance(status, dict):
			left = [s["label"] for s in status["steps"] if not s["done"]]
			self.out(f"== 導入進度 {status['done']}／{status['total']}" + (f"；還沒做：{'、'.join(left)}" if left else ""))
		return 0
