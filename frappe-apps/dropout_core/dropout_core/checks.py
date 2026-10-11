"""Data checks run after every import step. Same rules as the offline toolkit
(`toolkit/dropout_onboard/checks.py`), but against live ERPNext data."""

import frappe
from frappe import _

from dropout_core.taiwan import is_valid_tax_id


def run_all():
	issues = []
	for check in (invalid_tax_ids, duplicate_tax_ids, duplicate_customer_names, items_without_price, negative_stock):
		issues.extend(check())
	return issues


def _issue(check, doctype, name, detail):
	return {"check": check, "reference_doctype": doctype, "reference_name": name, "detail": detail}


def invalid_tax_ids():
	rows = frappe.get_all("Customer", filters={"tax_id": ["is", "set"], "disabled": 0}, fields=["name", "tax_id"])
	return [_issue(_("統編檢查碼錯誤"), "Customer", r.name, r.tax_id) for r in rows if not is_valid_tax_id(r.tax_id)]


def duplicate_tax_ids():
	rows = frappe.db.sql(
		"""select tax_id, group_concat(name separator ', ') names from `tabCustomer`
		where ifnull(tax_id, '') != '' and disabled = 0 group by tax_id having count(*) > 1""",
		as_dict=True,
	)
	return [_issue(_("統編重複"), "Customer", r.names.split(", ")[0], f"{r.tax_id}: {r.names}") for r in rows]


def duplicate_customer_names():
	rows = frappe.db.sql(
		"""select customer_name, group_concat(name separator ', ') names from `tabCustomer`
		where disabled = 0 group by customer_name having count(*) > 1""",
		as_dict=True,
	)
	return [_issue(_("客人名稱重複"), "Customer", r.names.split(", ")[0], r.names) for r in rows]


def items_without_price():
	price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
	if not price_list:
		return [_issue(_("沒有預設售價表"), "Selling Settings", "Selling Settings", "")]
	rows = frappe.db.sql(
		"""select i.name from `tabItem` i
		where i.is_sales_item = 1 and i.disabled = 0 and i.has_variants = 0
		and not exists (select 1 from `tabItem Price` p where p.item_code = i.name and p.price_list = %s)""",
		price_list,
		as_dict=True,
	)
	return [_issue(_("商品沒有售價"), "Item", r.name, price_list) for r in rows]


def negative_stock():
	rows = frappe.get_all("Bin", filters={"actual_qty": ["<", 0]}, fields=["item_code", "warehouse", "actual_qty"])
	return [_issue(_("負庫存"), "Item", r.item_code, f"{r.warehouse}: {r.actual_qty}") for r in rows]
