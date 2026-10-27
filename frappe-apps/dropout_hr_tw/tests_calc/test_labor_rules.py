"""Statutory leave and overtime. No Frappe, no yearly rate notices."""

import datetime as dt
import json
import pathlib
import unittest
from decimal import Decimal

from dropout_hr_tw.labor_rules import (
	EXTENSION_HOURS_PER_MONTH,
	WEDDING_LEAVE_DAYS,
	annual_leave_days,
	funeral_leave_days,
	hourly_from_monthly,
	leave_field_upgrade,
	maternity_leave,
	overtime_pay,
	overtime_tax_split,
	unused_annual_leave_wage,
)
from dropout_hr_tw.payroll_calc import employer_supplement


class AnnualLeave(unittest.TestCase):
	def test_service_steps(self):
		join = "2024-01-15"
		self.assertEqual(annual_leave_days(join, "2024-07-14"), 0)
		self.assertEqual(annual_leave_days(join, "2024-07-15"), 3)
		self.assertEqual(annual_leave_days(join, "2025-01-14"), 3)
		self.assertEqual(annual_leave_days(join, "2025-01-15"), 7)
		self.assertEqual(annual_leave_days(join, "2026-01-15"), 10)
		self.assertEqual(annual_leave_days(join, "2027-01-15"), 14)
		self.assertEqual(annual_leave_days(join, "2028-01-15"), 14)
		self.assertEqual(annual_leave_days(join, "2029-01-15"), 15)
		self.assertEqual(annual_leave_days(join, "2033-01-15"), 15)
		self.assertEqual(annual_leave_days(join, "2034-01-15"), 16)
		self.assertEqual(annual_leave_days(join, "2048-01-15"), 30)
		self.assertEqual(annual_leave_days(join, "2049-01-15"), 30)

	def test_month_end_anniversary(self):
		self.assertEqual(annual_leave_days("2024-08-31", "2025-02-27"), 0)
		self.assertEqual(annual_leave_days("2024-08-31", "2025-02-28"), 3)
		self.assertEqual(annual_leave_days(dt.date(2024, 1, 31), dt.date(2024, 7, 31)), 3)

	def test_unused_days_are_wage_over_thirty(self):
		self.assertEqual(unused_annual_leave_wage(36_000, 5), 6_000)
		self.assertEqual(unused_annual_leave_wage(40_100, 1), 1_337)
		self.assertEqual(unused_annual_leave_wage(36_000, 0), 0)


class Overtime(unittest.TestCase):
	def test_weekday_and_rest_match_published_examples(self):
		self.assertEqual(hourly_from_monthly(36_000), 150)
		# 月薪 36,000、時薪 150。平日 3 小時：前 2 小時 4/3、再 1 小時 5/3。
		self.assertEqual(overtime_pay(150, 3, "weekday")["extra"], 650)
		# 臺北市政府：休息日 6 小時加給 1,400；10 小時加給 2,700。
		self.assertEqual(overtime_pay(150, 6, "rest")["extra"], 1_400)
		self.assertEqual(overtime_pay(150, 10, "rest")["extra"], 2_700)
		self.assertEqual(overtime_pay(150, 1, "rest")["extra"], 200)

	def test_caps_and_holiday(self):
		weekday = overtime_pay(150, 5, "weekday")
		self.assertEqual(weekday["extra"], 150 * 4 // 3 * 2 + 150 * 5 // 3 * 2)
		self.assertEqual(weekday["uncounted_hours"], "1")
		self.assertTrue(weekday["over_daily_cap"])
		self.assertEqual(weekday["hours_in_monthly_cap"], "5")
		holiday = overtime_pay(150, 10, "holiday")
		self.assertEqual(holiday["extra"], 1_200 + 400)
		self.assertEqual(holiday["hours_in_monthly_cap"], "2")
		self.assertFalse(holiday["over_daily_cap"])
		stopped = overtime_pay(150, 10, "regular_off")
		self.assertEqual(stopped["extra"], 1_200)
		self.assertEqual(stopped["uncounted_hours"], "2")
		self.assertFalse(stopped["over_daily_cap"])

	def test_disaster_is_double_and_outside_the_monthly_cap(self):
		self.assertEqual(overtime_pay(150, 3, "disaster")["extra"], 900)
		self.assertEqual(overtime_pay(150, 3, "disaster")["hours_in_monthly_cap"], "0")
		self.assertEqual(overtime_pay(150, 6, "rest_disaster")["extra"], 1_400)
		self.assertEqual(overtime_pay(150, 6, "rest_disaster")["hours_in_monthly_cap"], "0")

	def test_odd_hourly_rounds_once(self):
		# 30,000 ÷ 240 = 125。平日 3 小時 = 541 又 2/3，進位成 542。
		pay = overtime_pay(hourly_from_monthly(30_000), 3, "weekday")
		self.assertEqual(pay["exact"], "541.6666666666666666666666666")
		self.assertEqual(pay["extra"], 542)

	def test_rejects_unknown_and_negative(self):
		self.assertEqual(overtime_pay(150, 0, "weekday")["extra"], 0)
		with self.assertRaises(ValueError):
			overtime_pay(150, 1, "sunday")
		with self.assertRaises(ValueError):
			overtime_pay(150, -1, "weekday")


class OvertimeTax(unittest.TestCase):
	def test_forty_six_and_a_holiday(self):
		# 稅務入口網：平日 49 小時，46 免稅、3 課稅；國定假日 8 小時仍免稅、不併入。
		split = overtime_tax_split(49, 8)
		self.assertEqual(split["monthly_cap"], EXTENSION_HOURS_PER_MONTH)
		self.assertEqual(split["extension_tax_free_hours"], "46")
		self.assertEqual(split["taxable_hours"], "3")
		self.assertEqual(split["holiday_tax_free_hours"], "8")
		self.assertTrue(split["over_labor_cap"])

	def test_holiday_past_eight_joins_the_pool(self):
		# 中區國稅局：平日 48、假日 10 → 應稅 48 + (10-8) - 46 = 4。
		split = overtime_tax_split(48, 10)
		self.assertEqual(split["holiday_tax_free_hours"], "8")
		self.assertEqual(split["taxable_hours"], "4")

	def test_consent_uses_fifty_four_and_the_quarter(self):
		self.assertEqual(overtime_tax_split(49, consented=True)["taxable_hours"], "0")
		self.assertEqual(overtime_tax_split(49, consented=True)["monthly_cap"], 54)
		# 這個月 50，三個月已含這個月共 140：138 只剩 48 可免稅。
		split = overtime_tax_split(50, consented=True, quarter_extension_hours=140)
		self.assertEqual(split["extension_tax_free_hours"], "48")
		self.assertEqual(split["taxable_hours"], "2")
		self.assertTrue(split["quarter_applied"])


class LeaveDays(unittest.TestCase):
	def test_funeral_and_maternity(self):
		self.assertEqual(WEDDING_LEAVE_DAYS, 14)
		self.assertEqual(funeral_leave_days("配偶"), 8)
		self.assertEqual(funeral_leave_days("配偶之養父母"), 6)
		self.assertEqual(funeral_leave_days("兄弟姊妹"), 3)
		with self.assertRaises(ValueError):
			funeral_leave_days("朋友")
		full = maternity_leave("birth", 6)
		self.assertEqual(full["days"], 56)
		self.assertEqual(full["wage_fraction"], 1)
		self.assertEqual(maternity_leave("miscarriage_12w", 5)["wage_fraction"], Decimal("0.5"))
		under = maternity_leave("miscarriage_under_8w", 12)
		self.assertEqual(under["days"], 5)
		self.assertIsNone(under["wage_fraction"])

	def test_wedding_seed_and_upgrade(self):
		path = pathlib.Path(__file__).resolve().parents[1] / "dropout_hr_tw" / "setup" / "leave_types.json"
		rows = {row["leave_type_name"]: row for row in json.loads(path.read_text(encoding="utf-8"))}
		self.assertEqual(rows["婚假"]["max_leaves_allowed"], 14)
		self.assertEqual(rows["產檢假"]["max_leaves_allowed"], 7)
		self.assertIn("公傷病假", rows)
		self.assertIn("公假", rows)
		old = {"max_leaves_allowed": 8, "description": "勞工請假規則第2條。8 日，工資照給。"}
		upgraded = leave_field_upgrade("婚假", old)
		self.assertEqual(upgraded["max_leaves_allowed"], 14)
		self.assertIsNone(leave_field_upgrade("婚假", {**old, "max_leaves_allowed": 10}))
		self.assertIsNone(leave_field_upgrade("婚假", {**old, "max_leaves_allowed": "8.0", "description": "公司自訂"}))
		self.assertEqual(leave_field_upgrade("婚假", {**old, "max_leaves_allowed": "8.0"})["max_leaves_allowed"], 14)


class EmployerSupplement(unittest.TestCase):
	def test_blank_rate_and_the_bureau_arithmetic(self):
		self.assertEqual(employer_supplement(1_500_000, 1_200_000, None), 0)
		self.assertEqual(employer_supplement(1_500_000, 1_200_000, 0), 0)
		self.assertEqual(employer_supplement(1_000_000, 1_200_000, "0.0211"), 0)
		self.assertEqual(employer_supplement(1_500_000, 1_200_000, "0.0211"), 6_330)
		# 衛福部爭議審議：差額 953,300、費率 1.91% → 18,208。費率由呼叫端傳入。
		self.assertEqual(employer_supplement(1_299_000, 345_700, "0.0191"), 18_208)


if __name__ == "__main__":
	unittest.main()


class LeaveYear(unittest.TestCase):
	def test_before_six_months_nothing(self):
		from dropout_hr_tw.labor_rules import annual_leave_period
		self.assertIsNone(annual_leave_period("2026-01-15", "2026-07-14"))

	def test_six_month_period_is_three_days_until_first_anniversary(self):
		from dropout_hr_tw.labor_rules import annual_leave_period
		self.assertEqual(annual_leave_period("2026-01-15", "2026-07-15"), (dt.date(2026, 7, 15), dt.date(2027, 1, 14), 3))

	def test_anniversary_years(self):
		from dropout_hr_tw.labor_rules import annual_leave_period
		self.assertEqual(annual_leave_period("2024-01-15", "2025-01-15"), (dt.date(2025, 1, 15), dt.date(2026, 1, 14), 7))
		self.assertEqual(annual_leave_period("2024-01-15", "2026-10-27"), (dt.date(2026, 1, 15), dt.date(2027, 1, 14), 10))
		self.assertEqual(annual_leave_period("2016-03-01", "2026-03-01")[2], 16)

	def test_month_end_join_clamps(self):
		from dropout_hr_tw.labor_rules import annual_leave_period
		self.assertEqual(annual_leave_period("2025-08-31", "2026-02-28")[0], dt.date(2026, 2, 28))


class OvertimeRefusal(unittest.TestCase):
	def test_inside_cap_is_fine(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		self.assertIsNone(overtime_refusal(overtime_pay(125, 2, "weekday"), 40))

	def test_daily_cap(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		self.assertIn("12 小時", overtime_refusal(overtime_pay(125, 5, "weekday"), 0))

	def test_monthly_cap_and_consent(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		result = overtime_pay(125, 4, "weekday")
		self.assertIn("46", overtime_refusal(result, 44))
		self.assertIsNone(overtime_refusal(result, 44, consented=True))
		self.assertIn("54", overtime_refusal(result, 52, consented=True))

	def test_holiday_first_eight_hours_outside_cap(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		self.assertIsNone(overtime_refusal(overtime_pay(125, 8, "holiday"), 46))
		self.assertIn("46", overtime_refusal(overtime_pay(125, 10, "holiday"), 46))

	def test_disaster_outside_cap(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		self.assertIsNone(overtime_refusal(overtime_pay(125, 6, "disaster"), 46))

	def test_regular_off_past_eight_refused(self):
		from dropout_hr_tw.labor_rules import overtime_refusal
		self.assertIn("沒有法定倍數", overtime_refusal(overtime_pay(125, 10, "regular_off"), 0))
