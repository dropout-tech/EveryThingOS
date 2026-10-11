"""Taiwan HR setup on top of Frappe HRMS. Runs on install-app, after the setup
wizard and on every migrate. Everything is "create if missing": a leave type,
salary component or job profile the company already edited is left alone."""

import json
import os

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import getdate

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
		_basis("tw_employer_li", "雇主負擔勞保（估）", "tw_meal_cap"),
		_basis("tw_employer_hi", "雇主負擔健保（估）", "tw_employer_li"),
		_basis("tw_employer_pension", "雇主提繳勞退", "tw_employer_hi"),
	],
}


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


def ensure_structures():
	"""A draft monthly structure per company with the Taiwan components. HR reviews,
	submits and assigns it; 加班費 comes in through Additional Salary instead."""
	if not frappe.is_setup_complete():
		return []
	names = [c["salary_component"] for c in _load("salary_components.json")]
	components = frappe.get_all(
		"Salary Component",
		filters={"name": ("in", names), "amount_based_on_formula": 1, "disabled": 0},
		fields=["name", "type", "salary_component_abbr", "formula", "depends_on_payment_days"],
	)
	components.sort(key=lambda c: names.index(c.name))
	created = []
	for company, abbr, currency in frappe.get_all("Company", fields=["name", "abbr", "default_currency"], as_list=True):
		name = f"{STRUCTURE} - {abbr}"
		if frappe.db.exists("Salary Structure", name):
			continue
		doc = frappe.get_doc({"doctype": "Salary Structure", "__newname": name, "company": company, "currency": currency or "TWD", "payroll_frequency": "Monthly", "is_active": "Yes"})
		for c in components:
			doc.append(
				"earnings" if c.type == "Earning" else "deductions",
				{"salary_component": c.name, "abbr": c.salary_component_abbr, "amount_based_on_formula": 1, "formula": c.formula, "depends_on_payment_days": c.depends_on_payment_days},
			)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
	return created
