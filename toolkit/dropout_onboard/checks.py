"""Offline checks on converted files, before anything touches ERPNext. Same
rules as `dropout_core.checks` (which re-checks live data after import)."""

from collections import Counter

from dropout_onboard.taiwan import is_valid_tax_id, normalize_email


def _col(header, name):
	for candidate in (name, f"items.{name}"):
		if candidate in header:
			return header.index(candidate)
	return None


def check(kind, header, rows, known_items=None):
	issues = []

	def add(row, field, value, problem, level="error"):
		issues.append({"row": row + 2, "field": field, "value": value, "problem": problem, "level": level})

	def col(name):
		idx = _col(header, name)
		return (lambda r: r[idx] if idx is not None and idx < len(r) else "") if idx is not None else None

	name_field = {"customers": "customer_name", "suppliers": "supplier_name", "items": "item_code"}.get(kind)
	if name_field:
		get_name = col(name_field)
		names = Counter(get_name(r) for r in rows) if get_name else Counter()
		for i, r in enumerate(rows):
			if get_name and not get_name(r):
				add(i, name_field, "", "必填欄位是空的")
			elif get_name and names[get_name(r)] > 1:
				add(i, name_field, get_name(r), "重複")

	if kind in ("customers", "suppliers"):
		get_tax = col("tax_id")
		if get_tax:
			taxes = Counter(get_tax(r) for r in rows if get_tax(r))
			for i, r in enumerate(rows):
				tax = get_tax(r)
				if tax and not is_valid_tax_id(tax):
					add(i, "tax_id", tax, "統編檢查碼錯誤")
				elif tax and taxes[tax] > 1:
					add(i, "tax_id", tax, "統編重複，可能是同一家", "warning")
		get_email = col("email_id")
		if get_email:
			for i, r in enumerate(rows):
				if get_email(r) and not normalize_email(get_email(r)):
					add(i, "email_id", get_email(r), "Email 格式不對", "warning")

	if kind == "items":
		get_rate = col("standard_rate")
		for field in ("item_group", "stock_uom"):
			get = col(field)
			for i, r in enumerate(rows):
				if get and not get(r):
					add(i, field, "", "必填欄位是空的")
		for i, r in enumerate(rows):
			if get_rate:
				rate = get_rate(r)
				try:
					if rate and float(rate) < 0:
						add(i, "standard_rate", rate, "售價是負的")
				except ValueError:
					add(i, "standard_rate", rate, "售價不是數字")
				if not rate:
					add(i, "standard_rate", "", "沒有售價，官網與報價會是 0 元", "warning")

	if kind == "opening_stock":
		get_item, get_wh, get_qty = col("item_code"), col("warehouse"), col("qty")
		seen = Counter((get_item(r), get_wh(r)) for r in rows) if get_item and get_wh else Counter()
		for i, r in enumerate(rows):
			qty = get_qty(r) if get_qty else ""
			try:
				if float(qty or 0) < 0:
					add(i, "qty", qty, "期初數量是負的")
			except ValueError:
				add(i, "qty", qty, "數量不是數字")
			if get_item and get_wh and seen[(get_item(r), get_wh(r))] > 1:
				add(i, "item_code", get_item(r), "同一個倉庫重複出現")
			if known_items is not None and get_item and get_item(r) not in known_items:
				add(i, "item_code", get_item(r), "商品主檔裡沒有這個料號")
	return issues
