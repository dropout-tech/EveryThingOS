import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, nowdate

PERCENT_FIELDS = (
	"labor_ordinary_rate",
	"employment_insurance_rate",
	"labor_employee_share",
	"labor_employer_share",
	"health_rate",
	"health_employee_share",
	"health_employer_share",
	"pension_employer_rate",
	"pension_voluntary_max",
	"occupational_accident_rate",
	"commute_accident_rate",
	"supplementary_premium_rate",
	"income_tax_rate",
)

ACCOUNT_PAIRS = (
	("li_expense_account", "li_payable_account", "勞保"),
	("hi_expense_account", "hi_payable_account", "健保"),
	("pension_expense_account", "pension_payable_account", "勞退"),
	("oc_expense_account", "oc_payable_account", "職災"),
)
RATE_FIELDS = (*PERCENT_FIELDS, "minimum_wage_monthly", "minimum_wage_hourly", "meal_allowance_cap", "health_max_dependents", "health_avg_dependents", "income_tax_threshold")


class TaiwanPayrollSettings(Document):
	def validate(self):
		if not 2000 <= cint(self.effective_year) <= 2100:
			frappe.throw(_("適用年度要寫西元年，例如 {0}").format(frappe.utils.getdate().year))
		if self.get("overtime_quarter_start_month") not in (None, "") and not 1 <= cint(self.overtime_quarter_start_month) <= 12:
			frappe.throw(_("三個月 138 小時起算月份要在 1 到 12 之間"))
		for field in PERCENT_FIELDS:
			if not 0 <= flt(self.get(field)) <= 100:
				frappe.throw(_("{0} 要在 0 到 100 之間").format(_(self.meta.get_label(field))))
		for expense, payable, label in ACCOUNT_PAIRS:
			if bool(self.get(expense)) != bool(self.get(payable)):
				frappe.throw(_("{0} 的費用科目和應付科目要一起填，或一起留空").format(label))
		self.grades.sort(key=lambda row: flt(row.insured_salary))
		seen = set()
		for i, row in enumerate(self.grades, 1):
			row.idx = i
			if flt(row.insured_salary) <= 0:
				frappe.throw(_("分級表第 {0} 列的金額要大於 0").format(i))
			if flt(row.insured_salary) in seen:
				frappe.throw(_("分級表有重複的金額 {0}").format(row.insured_salary))
			seen.add(flt(row.insured_salary))
		self._track_verification()

	def _track_verification(self):
		before = self.get_doc_before_save()
		changed = bool(before) and (
			cint(before.effective_year) != cint(self.effective_year)
			or any(flt(before.get(f)) != flt(self.get(f)) for f in RATE_FIELDS)
			or [(flt(r.insured_salary), r.labor, r.health, r.pension) for r in before.grades] != [(flt(r.insured_salary), r.labor, r.health, r.pension) for r in self.grades]
		)
		if changed and before.verified and self.verified:
			self.verified = 0
		if self.verified and not (before and before.verified):
			self.verified_by = frappe.session.user
			self.verified_on = nowdate()
		if not self.verified:
			self.verified_by = None
			self.verified_on = None
