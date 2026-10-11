"""Rename and normalise columns from an old system's export into an ERPNext
Data Import file. It never writes to ERPNext; `import` hands the file to a
Data Import document, so validation and per-row errors are Frappe's own."""

import csv
import io
import json
import os
import re

from dropout_onboard.taiwan import normalize_email, normalize_phone

MAPPINGS_DIR = os.path.join(os.path.dirname(__file__), "mappings")

ENCODINGS = ("utf-8-sig", "cp950", "big5hkscs", "utf-16")


def load_mapping(source, kind):
	path = os.path.join(MAPPINGS_DIR, source, f"{kind}.json")
	if not os.path.exists(path):
		raise SystemExit(f"沒有 {source}/{kind} 的對照表：{path}")
	with open(path, encoding="utf-8") as fh:
		return json.load(fh)


def available():
	return {s: sorted(f[:-5] for f in os.listdir(os.path.join(MAPPINGS_DIR, s))) for s in sorted(os.listdir(MAPPINGS_DIR))}


def read_table(path):
	"""CSV in UTF-8 or Big5 (舊系統常見), or XLSX when openpyxl is installed."""
	if path.lower().endswith((".xlsx", ".xlsm")):
		try:
			import openpyxl
		except ImportError as exc:
			raise SystemExit("讀 Excel 需要 openpyxl（pip install openpyxl），或先另存成 CSV") from exc
		ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
		rows = [["" if v is None else str(v).strip() for v in row] for row in ws.iter_rows(values_only=True)]
		header, body = rows[0], rows[1:]
		return [dict(zip(header, r)) for r in body if any(r)]
	with open(path, "rb") as fh:
		raw = fh.read()
	for enc in ENCODINGS:
		try:
			text = raw.decode(enc)
			break
		except UnicodeDecodeError:
			continue
	else:
		raise SystemExit(f"看不懂 {path} 的編碼，請另存成 UTF-8 CSV")
	reader = csv.DictReader(io.StringIO(text))
	return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader if any((v or "").strip() for v in row.values())]


def _transform(value, kind):
	if value in (None, ""):
		return value
	if kind == "tax_id":
		return re.sub(r"\D", "", value)
	if kind == "email":
		return normalize_email(value) or value
	if kind == "phone":
		return normalize_phone(value) or value
	if kind == "number":
		return re.sub(r"[,\s$NT元]", "", value)
	if kind == "check":
		return "1" if value.strip().lower() in ("1", "y", "yes", "true", "是", "v", "✓") else "0"
	if kind == "date":
		m = re.match(r"(\d{2,4})[/.-](\d{1,2})[/.-](\d{1,2})", value)
		if not m:
			return value
		y = int(m.group(1))
		y = y + 1911 if y < 1000 else y  # 民國年
		return f"{y:04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
	return value


def _value(row, spec, defaults):
	value = ""
	for header in spec.get("from", []):
		if row.get(header):
			value = row[header]
			break
	value = _transform(value, spec.get("transform"))
	if value and spec.get("map"):
		value = spec["map"].get(value, value)
	if not value and "default" in spec:
		value = str(spec["default"]).format(**defaults) if isinstance(spec["default"], str) else spec["default"]
	return value


def convert(rows, mapping, defaults=None):
	"""Returns (header, out_rows, report)."""
	defaults = {"company": "", "posting_date": "", "warehouse": "", "customer_group": "", "supplier_group": "", "territory": "", "item_group": "", "stock_uom": "Nos", **(defaults or {})}
	fields = mapping["fields"]
	parent = mapping.get("parent", {})
	table = mapping.get("child_table")
	header = list(parent) + [f"{table}.{f}" if table else f for f in fields]

	used = {h for spec in list(fields.values()) + list(parent.values()) for h in spec.get("from", [])}
	present = set(rows[0]) if rows else set()
	report = {
		"rows": len(rows),
		"unmapped_columns": sorted(present - used),
		"missing_columns": sorted(f for f, spec in fields.items() if spec.get("required") and spec.get("from") and not (present & set(spec["from"])) and "default" not in spec),
	}

	out = []
	for i, row in enumerate(rows):
		parent_values = [(_value(row, spec, defaults) if i == 0 else "") for spec in parent.values()]
		out.append(parent_values + [_value(row, spec, defaults) for spec in fields.values()])
	return header, out, report


def write_csv(path, header, rows):
	with open(path, "w", encoding="utf-8", newline="") as fh:
		w = csv.writer(fh)
		w.writerow(header)
		w.writerows(rows)
