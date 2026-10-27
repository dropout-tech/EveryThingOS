"""Taiwan HR setup on top of Frappe HRMS. Runs on install-app, after the setup
wizard and on every migrate. Everything is "create if missing": a leave type,
salary component or job profile the company already edited is left alone."""

import json
import os

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import getdate

from dropout_hr_tw import labor_rules

SETTINGS = "Taiwan Payroll Settings"
STRUCTURE = "台灣月薪範本"

HR_PROFILE = ("人資", ("HR Manager", "HR User", "Leave Approver", "Employee"))
# Added once, on first install, to dropout_core's profiles so the owner sees payroll and
# managers can approve leave. Later edits by the company are not touched again.
EXTEND_PROFILES = {
	"老闆": ("HR Manager", "HR User", "Leave Approver", "Employee"),
	"主管": ("Leave Approver", "Employee"),
}

# Seed values only: every one of them must be checked against the year's official
# notices before the first payroll run (see docs/HR.md). Fields with no seed stay blank
# on purpose, and a blank rate means that deduction is not taken.
SEED = {
	"minimum_wage_monthly": 29500,
	"minimum_wage_hourly": 196,
	"meal_allowance_cap": 3000,
	"labor_ordinary_rate": 11.5,
	"employment_insurance_rate": 1,
	"labor_employee_share": 20,
	"labor_employer_share": 70,
	"health_rate": 5.17,
	"health_employee_share": 30,
	"health_employer_share": 60,
	"health_max_dependents": 3,
	"pension_employer_rate": 6,
	"pension_voluntary_max": 6,
	"income_tax_rate": 5,
}
LABOR_GRADES = (29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800)
PENSION_GRADES = LABOR_GRADES + (
	48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600,
	92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000,
)
HEALTH_GRADES = PENSION_GRADES + (156400, 162800, 169200, 175600, 182000, 189500, 197000, 204500, 212000, 219500)

_section = lambda fieldname, label, after: {"fieldname": fieldname, "fieldtype": "Section Break", "label": label, "insert_after": after, "collapsible": 1}
_basis = lambda fieldname, label, after, fieldtype="Currency": {"fieldname": fieldname, "fieldtype": fieldtype, "label": label, "insert_after": after, "read_only": 1, "no_copy": 1, **({"precision": "9"} if fieldtype == "Float" else {})}

CUSTOM_FIELDS = {
	"Employee": [
		_section("tw_insurance_section", "台灣勞健保與勞退", "ctc"),
		{"fieldname": "tw_li_insured_salary", "fieldtype": "Currency", "label": "勞保投保薪資", "insert_after": "tw_insurance_section", "description": "空白就依薪資結構指派的基本金額套分級表"},
		{"fieldname": "tw_hi_insured_salary", "fieldtype": "Currency", "label": "健保投保金額", "insert_after": "tw_li_insured_salary", "description": "空白就依分級表"},
		{"fieldname": "tw_pension_insured_salary", "fieldtype": "Currency", "label": "勞退月提繳工資", "insert_after": "tw_hi_insured_salary", "description": "空白就依分級表"},
		{"fieldname": "tw_insurance_column", "fieldtype": "Column Break", "insert_after": "tw_pension_insured_salary"},
		{"fieldname": "tw_hi_dependents", "fieldtype": "Int", "label": "健保眷屬人數", "insert_after": "tw_insurance_column", "non_negative": 1},
		{"fieldname": "tw_pension_voluntary_rate", "fieldtype": "Percent", "label": "勞退自提比例", "insert_after": "tw_hi_dependents", "non_negative": 1},
		{"fieldname": "tw_no_employment_insurance", "fieldtype": "Check", "label": "不參加就業保險", "insert_after": "tw_pension_voluntary_rate", "description": "例如已領老年給付或依法不適用的外籍人士"},
	],
	"Additional Salary": [
		_section("tw_ot_section", "加班紀錄", "amount"),
		{"fieldname": "tw_ot_kind", "fieldtype": "Data", "label": "加班種類", "insert_after": "tw_ot_section", "read_only": 1, "no_copy": 1},
		{"fieldname": "tw_ot_hours", "fieldtype": "Float", "label": "加班時數", "insert_after": "tw_ot_kind", "read_only": 1, "no_copy": 1},
		{"fieldname": "tw_ot_cap_hours", "fieldtype": "Float", "label": "計入每月上限的時數", "insert_after": "tw_ot_hours", "read_only": 1, "no_copy": 1},
		{"fieldname": "tw_ot_note", "fieldtype": "Small Text", "label": "倍數與依據", "insert_after": "tw_ot_cap_hours", "read_only": 1, "no_copy": 1},
	],
	"Salary Slip": [
		_section("tw_basis_section", "台灣扣繳基準", "deductions"),
		_basis("tw_rate_year", "費率年度", "tw_basis_section", "Int"),
		_basis("tw_li_salary", "勞保投保薪資", "tw_rate_year"),
		_basis("tw_li_rate", "勞保自付費率", "tw_li_salary", "Float"),
		_basis("tw_li_employee", "勞保自付額", "tw_li_rate"),
		_basis("tw_hi_salary", "健保投保金額", "tw_li_employee"),
		_basis("tw_hi_rate", "健保自付費率", "tw_hi_salary", "Float"),
		_basis("tw_hi_persons", "健保計費人數", "tw_hi_rate", "Int"),
		_basis("tw_hi_employee", "健保自付額", "tw_hi_persons"),
		_basis("tw_pension_salary", "勞退月提繳工資", "tw_hi_employee"),
		_basis("tw_pension_rate", "勞退自提率", "tw_pension_salary", "Float"),
		_basis("tw_pension_employee", "勞退自提額", "tw_pension_rate"),
		{"fieldname": "tw_basis_column", "fieldtype": "Column Break", "insert_after": "tw_pension_employee"},
		_basis("tw_tax_rate", "扣繳率", "tw_basis_column", "Float"),
		_basis("tw_tax_threshold", "每月起扣金額", "tw_tax_rate"),
		_basis("tw_meal_cap", "伙食津貼免稅額度", "tw_tax_threshold"),
		_basis("tw_insured_days", "勞保計費日數", "tw_meal_cap", "Int"),
		_basis("tw_employer_li", "雇主負擔勞保", "tw_insured_days"),
		_basis("tw_employer_hi", "雇主負擔健保", "tw_employer_li"),
		_basis("tw_employer_pension", "雇主提繳勞退", "tw_employer_hi"),
		_basis("tw_employer_oc", "雇主負擔職災", "tw_employer_pension"),
		_basis("tw_bonus_amount", "本期獎金", "tw_employer_oc"),
		_basis("tw_supplement_base", "補充保費費基", "tw_bonus_amount"),
		_basis("tw_supplement_employee", "二代健保補充保費", "tw_supplement_base"),
		{"fieldname": "tw_employer_journal", "fieldtype": "Link", "label": "雇主負擔傳票", "options": "Journal Entry", "insert_after": "tw_supplement_employee", "read_only": 1, "no_copy": 1},
	],
}

# Shipped formula. Upgrade only when a site still has the previous text, so a
# company that rewrote the formula keeps its version.
PREVIOUS_TAX_FORMULAS = (
	"floor(TW_BASE * tw_tax_rate + 0.5) if tw_tax_threshold and TW_BASE >= tw_tax_threshold else 0",
)
TAX_FORMULA = "(floor(TW_BASE * tw_tax_rate + 0.5) if tw_tax_threshold and TW_BASE >= tw_tax_threshold else 0) + (floor(tw_bonus_amount * tw_tax_rate + 0.5) if tw_bonus_amount else 0)"
TAX_DESCRIPTION = "本薪達到每月起扣金額時按扣繳率扣。獎金另按給付額乘扣繳率，不看起扣金額。加班費與伙食津貼免稅額度不在這裡扣。"
PREVIOUS_OT_DESCRIPTIONS = (
	"用「額外薪資（Additional Salary）」逐月登打。系統不從打卡自動算時數；每月 46 小時內免稅，超過的要另外併入薪資。",
)


def _load(name):
	with open(os.path.join(os.path.dirname(__file__), "setup", name), encoding="utf-8") as fh:
		return json.load(fh)


def after_install():
	ensure_setup()
	extend_profiles()
	frappe.db.commit()


def after_migrate():
	ensure_setup()
	frappe.db.commit()


def after_setup_wizard(args=None):
	ensure_setup()


def ensure_setup():
	create_custom_fields(CUSTOM_FIELDS, update=True)
	seed_settings()
	default_auto_annual_leave()
	created = {"salary_components": [], "leave_types": []}
	for row in _load("salary_components.json"):
		if not frappe.db.exists("Salary Component", row["salary_component"]):
			frappe.get_doc(row).insert(ignore_permissions=True)
			created["salary_components"].append(row["salary_component"])
	for row in _load("leave_types.json"):
		if not frappe.db.exists("Leave Type", row["leave_type_name"]):
			frappe.get_doc(row).insert(ignore_permissions=True)
			created["leave_types"].append(row["leave_type_name"])
	ensure_hr_profile()
	created["salary_structures"] = ensure_structures()
	upgrade_formulas()
	created["upgraded"] = upgrade_shipped_text()
	return created


def seed_settings():
	s = frappe.get_single(SETTINGS)
	if s.effective_year:
		return
	s.effective_year = getdate().year
	s.update(SEED)
	labor, pension = set(LABOR_GRADES), set(PENSION_GRADES)
	for amount in HEALTH_GRADES:
		s.append("grades", {"insured_salary": amount, "labor": int(amount in labor), "health": 1, "pension": int(amount in pension)})
	s.flags.ignore_permissions = True
	s.save()


def default_auto_annual_leave():
	"""Sites set up before the switch existed get it on once. A company that turned it off keeps it off."""
	stored = frappe.db.sql("select value from `tabSingles` where doctype = %s and field = 'auto_annual_leave'", SETTINGS)
	if not stored:
		frappe.db.set_single_value(SETTINGS, "auto_annual_leave", 1)


def _existing_roles():
	return set(frappe.get_all("Role", pluck="name"))


def ensure_hr_profile():
	name, roles = HR_PROFILE
	if frappe.db.exists("Role Profile", name):
		return
	existing = _existing_roles()
	doc = frappe.new_doc("Role Profile")
	doc.role_profile = name
	for role in roles:
		if role in existing:
			doc.append("roles", {"role": role})
	doc.insert(ignore_permissions=True)


def extend_profiles():
	existing = _existing_roles()
	for name, roles in EXTEND_PROFILES.items():
		if not frappe.db.exists("Role Profile", name):
			continue
		doc = frappe.get_doc("Role Profile", name)
		have = {r.role for r in doc.roles}
		missing = [r for r in roles if r in existing and r not in have]
		for role in missing:
			doc.append("roles", {"role": role})
		if missing:
			doc.save(ignore_permissions=True)


def upgrade_formulas():
	"""Point our old withholding formula at base pay plus bonus. Edited formulas stay."""
	if not frappe.db.exists("Salary Component", "所得稅扣繳"):
		return
	current = frappe.db.get_value("Salary Component", "所得稅扣繳", "formula")
	if current in PREVIOUS_TAX_FORMULAS:
		frappe.db.set_value("Salary Component", "所得稅扣繳", {"formula": TAX_FORMULA, "description": TAX_DESCRIPTION})
	for row in frappe.get_all(
		"Salary Detail",
		filters={"parenttype": "Salary Structure", "salary_component": "所得稅扣繳", "formula": ("in", PREVIOUS_TAX_FORMULAS)},
		fields=["name", "parent"],
	):
		if not frappe.db.exists("Salary Detail", {"parent": row.parent, "parenttype": "Salary Structure", "salary_component": "獎金"}):
			continue
		frappe.db.set_value("Salary Detail", row.name, "formula", TAX_FORMULA)


def upgrade_shipped_text():
	"""舊的法定文字才改。公司改過天數或說明就留著。"""
	changed = []
	if frappe.db.exists("Leave Type", "婚假"):
		current = {
			"max_leaves_allowed": frappe.db.get_value("Leave Type", "婚假", "max_leaves_allowed"),
			"description": frappe.db.get_value("Leave Type", "婚假", "description"),
		}
		update = labor_rules.leave_field_upgrade("婚假", current)
		if update:
			frappe.db.set_value("Leave Type", "婚假", update)
			changed.append("婚假")
	if frappe.db.exists("Salary Component", "加班費"):
		current = frappe.db.get_value("Salary Component", "加班費", "description")
		if current in PREVIOUS_OT_DESCRIPTIONS:
			replacement = next(row["description"] for row in _load("salary_components.json") if row["salary_component"] == "加班費")
			frappe.db.set_value("Salary Component", "加班費", "description", replacement)
			changed.append("加班費")
	return changed


def _structure_row(component):
	return {
		"salary_component": component.name,
		"abbr": component.salary_component_abbr,
		"amount_based_on_formula": component.amount_based_on_formula,
		"formula": component.formula,
		"depends_on_payment_days": component.depends_on_payment_days,
	}


def _append_missing_rows(doc, components):
	have = {row.salary_component for row in list(doc.earnings) + list(doc.deductions)}
	added = []
	for component in components:
		if component.name in have:
			continue
		parentfield = "earnings" if component.type == "Earning" else "deductions"
		row = doc.append(parentfield, _structure_row(component))
		added.append(row)
	if not added:
		return False
	if doc.docstatus == 1:
		for row in added:
			row.parent = doc.name
			row.parenttype = "Salary Structure"
			row.db_insert()
		return True
	doc.save(ignore_permissions=True)
	return True


def ensure_structures():
	"""A draft monthly structure per company with the Taiwan components. HR reviews,
	submits and assigns it; 加班費 comes in through Additional Salary instead."""
	if not frappe.is_setup_complete():
		return []
	names = [c["salary_component"] for c in _load("salary_components.json")]
	components = frappe.get_all(
		"Salary Component",
		filters={"name": ("in", names), "disabled": 0},
		fields=["name", "type", "salary_component_abbr", "formula", "depends_on_payment_days", "amount_based_on_formula"],
	)
	components.sort(key=lambda c: names.index(c.name))
	created = []
	for company, abbr, currency in frappe.get_all("Company", fields=["name", "abbr", "default_currency"], as_list=True):
		name = f"{STRUCTURE} - {abbr}"
		if frappe.db.exists("Salary Structure", name):
			_append_missing_rows(frappe.get_doc("Salary Structure", name), components)
			continue
		doc = frappe.get_doc({"doctype": "Salary Structure", "__newname": name, "company": company, "currency": currency or "TWD", "payroll_frequency": "Monthly", "is_active": "Yes"})
		for component in components:
			doc.append("earnings" if component.type == "Earning" else "deductions", _structure_row(component))
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
	return created
