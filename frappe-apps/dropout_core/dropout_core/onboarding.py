"""導入進度. Every step is computed from real records, so the checklist cannot
drift from what is actually in the site."""

import frappe


def _count(doctype, filters=None):
	return frappe.db.count(doctype, filters or {})


def steps():
	from dropout_core.checks import run_all

	has_stock_items = _count("Item", {"is_stock_item": 1, "disabled": 0}) > 0
	issues = run_all()
	data = [
		("company", "公司資料", _count("Company")),
		("accounts", "科目表", _count("Account", {"is_group": 0})),
		("customers", "客人與供應商", _count("Customer") + _count("Supplier")),
		("items", "商品與價格", min(_count("Item", {"disabled": 0}), _count("Item Price"))),
		(
			"opening_stock",
			"期初庫存",
			_count("Stock Reconciliation", {"purpose": "Opening Stock", "docstatus": 1}) if has_stock_items else 1,
		),
		("opening_balances", "期初應收應付", _count("Sales Invoice", {"is_opening": "Yes", "docstatus": 1}) + _count("Purchase Invoice", {"is_opening": "Yes", "docstatus": 1})),
		("checks", "資料檢查全綠", 0 if issues else 1),
		("channels", "對話通道", _count("DropOut Identity", {"channel": ["in", ["line", "ig", "fb", "web_chat"]]})),
		("glue", "系統同步", 1 if frappe.db.get_single_value("DropOut Settings", "glue_url") else 0),
		("first_sale", "第一筆真實生意", _count("Payment Entry", {"payment_type": "Receive", "docstatus": 1})),
	]
	out = [{"id": key, "label": label, "count": count, "done": count > 0} for key, label, count in data]
	return {"steps": out, "done": sum(s["done"] for s in out), "total": len(out), "issues": len(issues)}
