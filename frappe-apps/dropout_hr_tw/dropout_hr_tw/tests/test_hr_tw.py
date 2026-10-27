from decimal import Decimal

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, add_months, get_first_day, getdate, nowdate

from dropout_hr_tw import install, payroll, shell
from dropout_hr_tw.payroll_calc import money_for_days

HOLIDAYS = "DO HR TW 測試假日"
STRUCTURE = "DO HR TW 測試薪資"


def company():
	return frappe.defaults.get_global_default("company") or frappe.get_all("Company", pluck="name")[0]


def holiday_list():
	year = getdate().year
	if not frappe.db.exists("Holiday List", HOLIDAYS):
		frappe.get_doc({"doctype": "Holiday List", "holiday_list_name": HOLIDAYS, "from_date": f"{year - 1}-01-01", "to_date": f"{year + 1}-12-31"}).insert()
	frappe.db.set_value("Company", company(), "default_holiday_list", HOLIDAYS)
	return HOLIDAYS


def make_user(email, *roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0, "user_type": "System User"}).insert()
	user = frappe.get_doc("User", email)
	user.remove_roles(*[r.role for r in user.roles])
	if roles:
		user.add_roles(*roles)
	return email


def make_employee(first_name, user=None, **extra):
	name = frappe.db.get_value("Employee", {"first_name": first_name, "company": company()})
	if name:
		frappe.db.set_value("Employee", name, {"user_id": user, **extra})
		frappe.clear_document_cache("Employee", name)
		return name
	return frappe.get_doc(
		{
			"doctype": "Employee",
			"first_name": first_name,
			"gender": "Female",
			"date_of_birth": "1990-01-01",
			"date_of_joining": add_months(get_first_day(nowdate()), -6),
			"company": company(),
			"status": "Active",
			"user_id": user,
			"holiday_list": holiday_list(),
			**extra,
		}
	).insert().name


def submitted_structure():
	install.ensure_setup()
	if not frappe.db.exists("Salary Structure", STRUCTURE):
		template = frappe.get_doc("Salary Structure", frappe.db.get_value("Salary Structure", {"company": company(), "name": ("like", f"{install.STRUCTURE}%")}))
		doc = frappe.copy_doc(template)
		doc.update({"__newname": STRUCTURE})
		doc.insert()
		doc.submit()
	return STRUCTURE


def assign(employee, base):
	if frappe.db.exists("Salary Structure Assignment", {"employee": employee, "docstatus": 1}):
		return
	frappe.get_doc(
		{
			"doctype": "Salary Structure Assignment",
			"employee": employee,
			"salary_structure": submitted_structure(),
			"company": company(),
			"from_date": add_months(get_first_day(nowdate()), -1),
			"base": base,
			"currency": frappe.get_cached_value("Company", company(), "default_currency"),
		}
	).submit()


def slip(employee):
	from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

	doc = make_salary_slip(submitted_structure(), employee=employee, posting_date=nowdate())
	doc.insert()
	return doc


def amount(doc, abbr):
	return next((row.amount for row in doc.earnings + doc.deductions if row.abbr == abbr), 0)


def set_rates(**values):
	s = frappe.get_single(payroll.SETTINGS)
	s.update(values)
	s.save()
	frappe.clear_document_cache(payroll.SETTINGS, payroll.SETTINGS)


class TestSetup(FrappeTestCase):
	def test_setup_is_idempotent_and_keeps_edits(self):
		install.ensure_setup()
		frappe.db.set_value("Leave Type", "事假", "max_leaves_allowed", 10)
		frappe.db.set_value("Salary Component", "伙食津貼", "formula", "2400")
		again = install.ensure_setup()
		self.assertEqual(again["leave_types"], [])
		self.assertEqual(again["salary_components"], [])
		self.assertEqual(frappe.db.get_value("Leave Type", "事假", "max_leaves_allowed"), 10)
		self.assertEqual(frappe.db.get_value("Salary Component", "伙食津貼", "formula"), "2400")
		for name in ("特休", "病假", "事假", "婚假", "喪假", "產假", "陪產假", "生理假", "家庭照顧假", "產檢假", "公假", "公傷病假"):
			self.assertTrue(frappe.db.exists("Leave Type", name), name)
		self.assertEqual(frappe.db.get_value("Leave Type", "婚假", "max_leaves_allowed"), 14)
		self.assertEqual(frappe.db.get_value("Leave Type", "事假", "is_lwp"), 1)
		self.assertEqual(frappe.db.get_value("Leave Type", "病假", "fraction_of_daily_salary_per_leave"), 0.5)
		self.assertTrue(frappe.db.exists("Salary Structure", {"company": company(), "name": ("like", f"{install.STRUCTURE}%")}))
		template = frappe.db.get_value("Salary Structure", {"company": company(), "name": ("like", f"{install.STRUCTURE}%")})
		self.assertEqual(frappe.db.count("Salary Detail", {"parent": template, "salary_component": "獎金"}), 1)
		self.assertEqual(frappe.db.get_value("Salary Component", "所得稅扣繳", "formula"), install.TAX_FORMULA)
		install.ensure_setup()
		self.assertEqual(frappe.db.count("Salary Detail", {"parent": template, "salary_component": "獎金"}), 1)
		roles = set(frappe.get_all("Has Role", filters={"parenttype": "Role Profile", "parent": "人資"}, pluck="role"))
		self.assertTrue({"HR Manager", "HR User", "Leave Approver", "Employee"} <= roles)

	def test_settings_seed_does_not_overwrite(self):
		set_rates(health_rate=5.5)
		install.seed_settings()
		self.assertEqual(frappe.db.get_single_value(payroll.SETTINGS, "health_rate"), 5.5)

	def test_tax_formula_upgrades_only_our_previous_text(self):
		install.ensure_setup()
		name = "所得稅扣繳"
		original = frappe.db.get_value("Salary Component", name, "formula")
		details = frappe.get_all("Salary Detail", filters={"salary_component": name}, fields=["name", "formula"])
		try:
			frappe.db.set_value("Salary Component", name, "formula", install.PREVIOUS_TAX_FORMULAS[0])
			install.upgrade_formulas()
			self.assertEqual(frappe.db.get_value("Salary Component", name, "formula"), install.TAX_FORMULA)
			frappe.db.set_value("Salary Component", name, "formula", "TW_BASE")
			install.upgrade_formulas()
			self.assertEqual(frappe.db.get_value("Salary Component", name, "formula"), "TW_BASE")
		finally:
			frappe.db.set_value("Salary Component", name, "formula", original)
			for row in details:
				frappe.db.set_value("Salary Detail", row.name, "formula", row.formula)

	def test_account_pair_must_be_complete(self):
		account = frappe.get_all("Account", filters={"company": company(), "is_group": 0}, limit=1)[0].name
		self.assertRaises(frappe.ValidationError, set_rates, li_expense_account=account)
		frappe.clear_document_cache(payroll.SETTINGS, payroll.SETTINGS)

	def test_verified_is_cleared_when_rates_change(self):
		set_rates(verified=1)
		self.assertTrue(frappe.db.get_single_value(payroll.SETTINGS, "verified_by"))
		set_rates(labor_ordinary_rate=13)
		self.assertEqual(frappe.db.get_single_value(payroll.SETTINGS, "verified"), 0)
		self.assertRaises(frappe.ValidationError, set_rates, health_employee_share=130)


class TestPayroll(FrappeTestCase):
	def setUp(self):
		install.ensure_setup()
		set_rates(
			labor_ordinary_rate=11.5, employment_insurance_rate=1, labor_employee_share=20, labor_employer_share=70,
			health_rate=5.17, health_employee_share=30, health_max_dependents=3, pension_employer_rate=6, pension_voluntary_max=6,
			income_tax_rate=5, income_tax_threshold=0, meal_allowance_cap=3000,
			occupational_accident_rate=0, commute_accident_rate=0, supplementary_premium_rate=0,
		)

	def test_grade_lookup(self):
		grades = [{"insured_salary": a, "labor": 1} for a in (30300, 31800, 45800)]
		self.assertEqual(payroll.grade_for(30000, grades, "labor"), 30300)
		self.assertEqual(payroll.grade_for(31800, grades, "labor"), 31800)
		self.assertEqual(payroll.grade_for(90000, grades, "labor"), 45800)
		self.assertEqual(payroll.grade_for(12345, [], "labor"), 12345)
		self.assertEqual(payroll.half_up(1002.5), 1003)

	def test_settings_drive_deductions(self):
		emp = make_employee("薪資測試", tw_hi_dependents=5, tw_pension_voluntary_rate=6)
		assign(emp, 40000)
		first = slip(emp)
		self.assertEqual(first.tw_li_salary, 40100)
		self.assertEqual(amount(first, "TW_LI"), payroll.half_up(40100 * 0.125 * 0.2))
		self.assertEqual(first.tw_hi_persons, 4)
		self.assertEqual(amount(first, "TW_HI"), payroll.half_up(40100 * 0.0517 * 0.3) * 4)
		self.assertEqual(amount(first, "TW_PEN"), payroll.half_up(40100 * 0.06))
		self.assertEqual(amount(first, "TW_MEAL"), 3000)
		self.assertEqual(amount(first, "TW_TAX"), 0)

		set_rates(health_rate=6, meal_allowance_cap=2400, income_tax_threshold=30000)
		first.delete()
		second = slip(emp)
		self.assertEqual(amount(second, "TW_HI"), payroll.half_up(40100 * 0.06 * 0.3) * 4)
		self.assertEqual(amount(second, "TW_MEAL"), 2400)
		self.assertEqual(amount(second, "TW_TAX"), payroll.half_up(amount(second, "TW_BASE") * 0.05))

	def test_employee_override_and_no_employment_insurance(self):
		emp = make_employee("投保測試", tw_li_insured_salary=45800, tw_no_employment_insurance=1)
		assign(emp, 40000)
		doc = slip(emp)
		self.assertEqual(doc.tw_li_salary, 45800)
		self.assertEqual(amount(doc, "TW_LI"), payroll.half_up(45800 * 0.115 * 0.2))

	def test_mid_month_join_prorates_labor_not_health(self):
		start = get_first_day(nowdate())
		emp = make_employee("月中到職", date_of_joining=add_days(start, 15))
		assign(emp, 40000)
		doc = slip(emp)
		self.assertEqual(doc.tw_insured_days, 15)
		self.assertEqual(amount(doc, "TW_LI"), money_for_days(40100, Decimal("0.025"), 15))
		self.assertEqual(amount(doc, "TW_PEN"), 0)
		self.assertEqual(amount(doc, "TW_HI"), payroll.half_up(40100 * 0.0517 * 0.3))
		self.assertEqual(doc.tw_hi_persons, 1)

	def test_mid_month_leave_drops_health(self):
		start = get_first_day(nowdate())
		emp = make_employee("月中離職", date_of_joining=add_months(start, -8))
		frappe.db.set_value("Employee", emp, "relieving_date", add_days(start, 9))
		frappe.clear_document_cache("Employee", emp)
		assign(emp, 40000)
		doc = slip(emp)
		self.assertEqual(doc.tw_insured_days, 10)
		self.assertEqual(amount(doc, "TW_LI"), money_for_days(40100, Decimal("0.025"), 10))
		self.assertEqual(amount(doc, "TW_HI"), 0)
		self.assertEqual(doc.tw_employer_hi, 0)

	def test_occupational_and_bonus_supplement(self):
		set_rates(occupational_accident_rate=0.2, commute_accident_rate=0.04, supplementary_premium_rate=2.11, income_tax_rate=5, income_tax_threshold=0)
		emp = make_employee("獎金測試", tw_hi_insured_salary=30300, tw_li_insured_salary=30300)
		assign(emp, 30300)
		start = get_first_day(nowdate())
		frappe.get_doc(
			{
				"doctype": "Additional Salary",
				"naming_series": "HR-ADS-.YY.-.MM.-",
				"employee": emp,
				"company": company(),
				"salary_component": "獎金",
				"amount": 200000,
				"payroll_date": start,
				"currency": frappe.get_cached_value("Company", company(), "default_currency") or "TWD",
			}
		).submit()
		doc = slip(emp)
		self.assertEqual(doc.tw_employer_oc, money_for_days(30300, Decimal("0.0024"), 30))
		self.assertEqual(doc.tw_bonus_amount, 200000)
		self.assertEqual(amount(doc, "TW_BONUS"), 200000)
		self.assertEqual(doc.tw_supplement_base, 78800)
		self.assertEqual(amount(doc, "TW_NHI2"), 1663)
		self.assertEqual(amount(doc, "TW_TAX"), 10000)


class TestShell(FrappeTestCase):
	def setUp(self):
		install.ensure_setup()
		holiday_list()
		self.approver = make_user("approver@hr.example.com", "Leave Approver", "Employee")
		self.staff = make_user("staff@hr.example.com", "Employee")
		self.outsider = make_user("outsider@hr.example.com", "Sales User")
		self.approver_emp = make_employee("核准人", self.approver)
		self.staff_emp = make_employee("請假人", self.staff, leave_approver=self.approver)

	def tearDown(self):
		frappe.set_user("Administrator")

	def leave(self, day_offset=1):
		day = add_days(nowdate(), day_offset)
		return frappe.get_doc(
			{"doctype": "Leave Application", "employee": self.staff_emp, "leave_type": "事假", "from_date": day, "to_date": day, "company": company(), "leave_approver": self.approver, "status": "Open"}
		).insert(ignore_permissions=True)

	def test_approver_approves_and_sees_it(self):
		app = self.leave(3)
		frappe.set_user(self.approver)
		today = shell.today()
		self.assertIn(app.name, [a["name"] for a in today["approvals"]])
		self.assertIsNone(today["payroll"])
		self.assertIn("payroll", today["denied"])
		shell.decide_leave(app.name, "approve")
		self.assertEqual(frappe.db.get_value("Leave Application", app.name, ["status", "docstatus"]), ("Approved", 1))
		self.assertRaises(frappe.ValidationError, shell.decide_leave, app.name, "reject")

	def test_who_is_on_leave_today(self):
		app = self.leave(0)
		frappe.set_user(self.approver)
		shell.decide_leave(app.name, "approve")
		self.assertIn("請假人", [r["name"] for r in shell.today()["on_leave"]])

	def test_permission_checks(self):
		app = self.leave(5)
		frappe.set_user(self.outsider)
		self.assertRaises(frappe.PermissionError, shell.decide_leave, app.name, "approve")
		today = shell.today()
		self.assertEqual(today["approvals"], [])
		self.assertIn("on_leave", today["denied"])
		self.assertIsNone(today["me"]["employee"])
		self.assertRaises(frappe.ValidationError, shell.check_in, "IN")

		frappe.set_user(self.staff)
		self.assertRaises(frappe.PermissionError, shell.decide_leave, app.name, "approve")
		self.assertRaises(frappe.ValidationError, shell.decide_leave, app.name, "maybe")
		self.assertRaises(frappe.ValidationError, shell.decide_leave, "no-such-leave", "approve")

		frappe.set_user("Guest")
		self.assertRaises(frappe.PermissionError, shell.today)

	def test_cannot_approve_own_leave(self):
		day = add_days(nowdate(), 9)
		own = frappe.get_doc(
			{"doctype": "Leave Application", "employee": self.approver_emp, "leave_type": "事假", "from_date": day, "to_date": day, "company": company(), "leave_approver": self.approver, "status": "Open"}
		).insert(ignore_permissions=True)
		frappe.set_user(self.approver)
		self.assertNotIn(own.name, [a["name"] for a in shell.today()["approvals"]])
		self.assertRaises(frappe.PermissionError, shell.decide_leave, own.name, "approve")

	def test_check_in_for_myself(self):
		frappe.db.delete("Employee Checkin", {"employee": self.staff_emp})
		frappe.set_user(self.staff)
		self.assertRaises(frappe.ValidationError, shell.check_in, "LUNCH")
		self.assertRaises(frappe.ValidationError, shell.check_in, "IN", latitude=200, longitude=0)
		result = shell.check_in("in")
		self.assertTrue(result["ok"])
		self.assertRaises(frappe.ValidationError, shell.check_in, "OUT")
		me = shell.today()["me"]
		self.assertEqual(me["employee"], self.staff_emp)
		self.assertEqual([l["type"] for l in me["logs"]], ["IN"])
		self.assertEqual(me["next"], "OUT")


class TestOvertime(FrappeTestCase):
	def setUp(self):
		install.ensure_setup()
		frappe.set_user("Administrator")
		self.employee = make_employee("加班測試")
		assign(self.employee, 30000)
		frappe.db.set_single_value(payroll.SETTINGS, "overtime_consent", 0)

	def test_weekday_overtime_lands_on_the_slip(self):
		from dropout_hr_tw import overtime

		out = overtime.record(self.employee, nowdate(), 2, "weekday")
		# 30000 / 240 = 125；前 2 小時 4/3 → 333.33… → 333
		self.assertEqual(out["amount"], 333)
		doc = frappe.get_doc("Additional Salary", out["name"])
		self.assertEqual(doc.docstatus, 1)
		self.assertEqual(doc.salary_component, overtime.COMPONENT)
		self.assertEqual(doc.tw_ot_cap_hours, 2)

	def test_daily_and_monthly_caps(self):
		from dropout_hr_tw import overtime

		with self.assertRaises(frappe.ValidationError):
			overtime.record(self.employee, nowdate(), 5, "weekday")
		for _i in range(11):
			overtime.record(self.employee, nowdate(), 4, "weekday")
		with self.assertRaises(frappe.ValidationError):
			overtime.record(self.employee, nowdate(), 4, "weekday")
		frappe.db.set_single_value(payroll.SETTINGS, "overtime_consent", 1)
		overtime.record(self.employee, nowdate(), 4, "weekday")

	def test_only_hr_records(self):
		from dropout_hr_tw import overtime

		frappe.set_user(make_user("ot-staff@example.com", "Employee"))
		try:
			with self.assertRaises(frappe.PermissionError):
				overtime.record(self.employee, nowdate(), 1, "weekday")
		finally:
			frappe.set_user("Administrator")


class TestAnnualLeave(FrappeTestCase):
	def test_allocates_once_per_leave_year(self):
		from dropout_hr_tw import annual_leave

		install.ensure_setup()
		frappe.db.set_single_value(payroll.SETTINGS, "auto_annual_leave", 1)
		joining = add_months(getdate(nowdate()), -13)
		employee = make_employee("特休測試", date_of_joining=joining)
		frappe.db.delete("Leave Allocation", {"employee": employee})
		first = annual_leave.allocate_for(employee, joining, nowdate())
		self.assertTrue(first)
		self.assertEqual(frappe.db.get_value("Leave Allocation", first, "new_leaves_allocated"), 7)
		self.assertIsNone(annual_leave.allocate_for(employee, joining, nowdate()))

	def test_switch_off_does_nothing(self):
		from dropout_hr_tw import annual_leave

		frappe.db.set_single_value(payroll.SETTINGS, "auto_annual_leave", 0)
		self.assertEqual(annual_leave.allocate_due(), [])
