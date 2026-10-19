"""Taiwan deductions for HRMS salary slips.

HRMS evaluates salary component formulas against the slip's own fields, so
before the slip calculates we copy this year's rates (Taiwan Payroll Settings),
the employee's insured salary and the resulting amounts onto read-only slip
fields. The formulas in setup/salary_components.json only reference those
fields; no rate is written into a formula.

Labor, pension and occupational premiums use a 30-day month. Health insurance
is charged for the whole month or not at all. Bonus withholding and the
second-generation NHI supplement read Additional Salary for 獎金, because the
slip has not calculated that row yet.
"""

from decimal import Decimal

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from dropout_hr_tw.payroll_calc import (
	EMPLOYER_PAIRS,
	employer_journal_rows,
	half_up,
	health_month,
	insured_days,
	money_for_days,
	supplement_premium,
)

SETTINGS = "Taiwan Payroll Settings"
BONUS = "獎金"

__all__ = ["half_up", "insured_days", "fill_slip", "post_employer_journal", "cancel_employer_journal"]


def settings():
	return frappe.get_cached_doc(SETTINGS)


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


def basis(s, employee, wage, on_date):
	"""Everything the Taiwan formulas need for one employee and one month."""
	pct = lambda field: Decimal(repr(flt(s.get(field)))) / 100
	days = insured_days(employee.get("date_of_joining"), employee.get("relieving_date"), on_date)
	hi_months = health_month(employee.get("date_of_joining"), employee.get("relieving_date"), on_date)
	li_salary = flt(employee.get("tw_li_insured_salary")) or grade_for(wage, s.grades, "labor")
	hi_salary = flt(employee.get("tw_hi_insured_salary")) or grade_for(wage, s.grades, "health")
	pension_salary = flt(employee.get("tw_pension_insured_salary")) or grade_for(wage, s.grades, "pension")
	li_total = pct("labor_ordinary_rate") + (0 if cint(employee.get("tw_no_employment_insurance")) else pct("employment_insurance_rate"))
	dependents = max(cint(employee.get("tw_hi_dependents")), 0)
	if s.health_max_dependents:
		dependents = min(dependents, cint(s.health_max_dependents))
	voluntary = min(max(flt(employee.get("tw_pension_voluntary_rate")), 0), flt(s.pension_voluntary_max))
	li_employee_rate = li_total * pct("labor_employee_share")
	li_employer_rate = li_total * pct("labor_employer_share")
	hi_rate = pct("health_rate") * pct("health_employee_share")
	oc_rate = pct("occupational_accident_rate") + pct("commute_accident_rate")
	per_person = money_for_days(hi_salary, hi_rate, 30) if hi_months else 0
	employer_hi_rate = pct("health_rate") * pct("health_employer_share") * (1 + Decimal(repr(flt(s.health_avg_dependents))))
	return {
		"tw_rate_year": cint(s.effective_year),
		"tw_insured_days": days,
		"tw_li_salary": li_salary,
		"tw_li_rate": float(li_employee_rate),
		"tw_li_employee": money_for_days(li_salary, li_employee_rate, days),
		"tw_hi_salary": hi_salary,
		"tw_hi_rate": float(hi_rate),
		"tw_hi_persons": (1 + dependents) if hi_months else 0,
		"tw_hi_employee": per_person * ((1 + dependents) if hi_months else 0),
		"tw_pension_salary": pension_salary,
		"tw_pension_rate": voluntary / 100,
		"tw_pension_employee": money_for_days(pension_salary, Decimal(repr(voluntary)) / 100, days),
		"tw_tax_rate": float(pct("income_tax_rate")),
		"tw_tax_threshold": flt(s.income_tax_threshold),
		"tw_meal_cap": flt(s.meal_allowance_cap),
		"tw_employer_li": money_for_days(li_salary, li_employer_rate, days),
		"tw_employer_hi": money_for_days(hi_salary, employer_hi_rate, 30) if hi_months and s.health_avg_dependents else 0,
		"tw_employer_pension": money_for_days(pension_salary, pct("pension_employer_rate"), days),
		"tw_employer_oc": money_for_days(li_salary, oc_rate, days),
	}


def _period(doc):
	start = getdate(doc.start_date or doc.posting_date)
	end = getdate(doc.end_date or doc.posting_date)
	return start, end


def period_bonus(employee, start, end):
	"""Submitted one-shot 獎金 whose payroll date falls in this slip. Recurring rows are not included."""
	if not frappe.db.exists("Salary Component", BONUS):
		return 0
	total = frappe.db.sql(
		"""select coalesce(sum(amount), 0) from `tabAdditional Salary`
		   where employee = %s and salary_component = %s and docstatus = 1
		     and ifnull(disabled, 0) = 0 and payroll_date between %s and %s""",
		(employee, BONUS, start, end),
	)[0][0]
	return flt(total)


def ytd_bonus(employee, start):
	"""獎金 already paid on submitted slips earlier this year. This slip is still a draft."""
	year_start = getdate(start).replace(month=1, day=1)
	total = frappe.db.sql(
		"""select coalesce(sum(sd.amount), 0)
		   from `tabSalary Detail` sd
		   inner join `tabSalary Slip` ss on ss.name = sd.parent
		   where ss.employee = %s and ss.docstatus = 1
		     and ss.start_date >= %s and ss.end_date < %s
		     and sd.parenttype = 'Salary Slip' and sd.parentfield = 'earnings' and sd.abbr = 'TW_BONUS'""",
		(employee, year_start, start),
	)[0][0]
	return flt(total)


def fill_slip(doc, method=None):
	"""doc_events Salary Slip before_validate."""
	if not doc.employee or doc.docstatus != 0:
		return
	employee = frappe.get_cached_doc("Employee", doc.employee)
	start, end = _period(doc)
	values = basis(settings(), employee, monthly_wage(doc.employee, start), start)
	bonus = period_bonus(doc.employee, start, end)
	supplement_rate = Decimal(repr(flt(settings().supplementary_premium_rate))) / 100
	base, premium = supplement_premium(ytd_bonus(doc.employee, start), bonus, values["tw_hi_salary"], supplement_rate)
	values["tw_bonus_amount"] = bonus
	values["tw_supplement_base"] = base
	values["tw_supplement_employee"] = premium
	doc.update(values)


def _configured_accounts():
	s = settings()
	keys = [key for _amount, expense, payable, _label in EMPLOYER_PAIRS for key in (expense, payable)]
	return {key: s.get(key) for key in keys}


def post_employer_journal(doc, method=None):
	"""Salary Slip on_submit. Blank account pairs stay as figures on the slip only."""
	if doc.docstatus != 1:
		return
	existing = doc.get("tw_employer_journal")
	if existing and frappe.db.get_value("Journal Entry", existing, "docstatus") == 1:
		return
	amounts = {key: flt(doc.get(key)) for key, _expense, _payable, _label in EMPLOYER_PAIRS}
	lines, missing = employer_journal_rows(amounts, _configured_accounts())
	if missing:
		frappe.throw(_("{0} 的費用科目和應付科目要一起填，或一起留空。請到 Taiwan Payroll Settings 補上。").format("、".join(missing)))
	if not lines:
		return
	company = doc.company
	for line in lines:
		account_company = frappe.get_cached_value("Account", line["account"], "company")
		if account_company != company:
			frappe.throw(_("{0} 不是這家公司的科目").format(line["account"]))
	cost_center = frappe.get_cached_value("Company", company, "cost_center")
	if not cost_center:
		frappe.throw(_("公司還沒有預設成本中心，沒辦法入帳雇主負擔。請到公司主檔填上，或把 Taiwan Payroll Settings 的科目留空。"))
	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.company = company
	je.posting_date = doc.posting_date or doc.end_date
	je.user_remark = _("雇主負擔勞健保、勞退與職災 {0} {1}").format(doc.employee_name or doc.employee, doc.name)
	for line in lines:
		je.append(
			"accounts",
			{
				"account": line["account"],
				"debit_in_account_currency": line["debit"],
				"credit_in_account_currency": line["credit"],
				"cost_center": cost_center if line["debit"] else None,
				"user_remark": line["label"],
			},
		)
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	frappe.db.set_value("Salary Slip", doc.name, "tw_employer_journal", je.name, update_modified=False)
	doc.tw_employer_journal = je.name


def cancel_employer_journal(doc, method=None):
	"""Salary Slip on_cancel."""
	name = doc.get("tw_employer_journal")
	if not name or not frappe.db.exists("Journal Entry", name):
		return
	je = frappe.get_doc("Journal Entry", name)
	if je.docstatus == 1:
		je.flags.ignore_permissions = True
		je.cancel()
