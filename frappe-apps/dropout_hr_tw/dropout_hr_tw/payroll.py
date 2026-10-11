"""Taiwan deductions for HRMS salary slips.

HRMS evaluates salary component formulas against the slip's own fields, so
before the slip calculates we copy this year's rates (Taiwan Payroll Settings),
the employee's insured salary and the resulting amounts onto read-only slip
fields. The formulas in setup/salary_components.json only reference those
fields; no rate is written into a formula."""

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe.utils import cint, flt

SETTINGS = "Taiwan Payroll Settings"


def settings():
	return frappe.get_cached_doc(SETTINGS)


def half_up(value):
	"""元以下四捨五入. Python's round() rounds halves to even."""
	return int(Decimal(repr(flt(value))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def grade_for(wage, grades, column):
	"""Lowest grade at or above the wage; the top grade when the wage is above it.
	With no grades for that column the wage itself is used."""
	wage = flt(wage)
	if wage <= 0:
		return 0.0
	amounts = sorted(flt(g.get("insured_salary")) for g in grades if cint(g.get(column)))
	if not amounts:
		return wage
	return next((a for a in amounts if a >= wage), amounts[-1])


def monthly_wage(employee, on_date):
	return flt(
		frappe.db.get_value(
			"Salary Structure Assignment",
			{"employee": employee, "docstatus": 1, "from_date": ("<=", on_date)},
			"base",
			order_by="from_date desc",
		)
	)


def basis(s, employee, wage):
	"""Everything the Taiwan formulas need for one employee and one month."""
	pct = lambda field: Decimal(repr(flt(s.get(field)))) / 100
	li_salary = flt(employee.get("tw_li_insured_salary")) or grade_for(wage, s.grades, "labor")
	hi_salary = flt(employee.get("tw_hi_insured_salary")) or grade_for(wage, s.grades, "health")
	pension_salary = flt(employee.get("tw_pension_insured_salary")) or grade_for(wage, s.grades, "pension")
	li_total = pct("labor_ordinary_rate") + (0 if cint(employee.get("tw_no_employment_insurance")) else pct("employment_insurance_rate"))
	dependents = max(cint(employee.get("tw_hi_dependents")), 0)
	if s.health_max_dependents:
		dependents = min(dependents, cint(s.health_max_dependents))
	voluntary = min(max(flt(employee.get("tw_pension_voluntary_rate")), 0), flt(s.pension_voluntary_max))
	li_rate = li_total * pct("labor_employee_share")
	hi_rate = pct("health_rate") * pct("health_employee_share")
	money = lambda amount, rate: half_up(Decimal(repr(flt(amount))) * rate)
	return {
		"tw_rate_year": cint(s.effective_year),
		"tw_li_salary": li_salary,
		"tw_li_rate": float(li_rate),
		"tw_li_employee": money(li_salary, li_rate),
		"tw_hi_salary": hi_salary,
		"tw_hi_rate": float(hi_rate),
		"tw_hi_persons": 1 + dependents,
		"tw_hi_employee": money(hi_salary, hi_rate) * (1 + dependents),
		"tw_pension_salary": pension_salary,
		"tw_pension_rate": voluntary / 100,
		"tw_pension_employee": money(pension_salary, Decimal(repr(voluntary)) / 100),
		"tw_tax_rate": float(pct("income_tax_rate")),
		"tw_tax_threshold": flt(s.income_tax_threshold),
		"tw_meal_cap": flt(s.meal_allowance_cap),
		"tw_employer_li": money(li_salary, li_total * pct("labor_employer_share")),
		"tw_employer_hi": money(hi_salary, pct("health_rate") * pct("health_employer_share") * (1 + Decimal(repr(flt(s.health_avg_dependents))))) if s.health_avg_dependents else 0,
		"tw_employer_pension": money(pension_salary, pct("pension_employer_rate")),
	}


def fill_slip(doc, method=None):
	"""doc_events Salary Slip before_validate."""
	if not doc.employee or doc.docstatus != 0:
		return
	employee = frappe.get_cached_doc("Employee", doc.employee)
	doc.update(basis(settings(), employee, monthly_wage(doc.employee, doc.start_date or doc.posting_date)))
