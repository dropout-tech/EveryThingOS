"""Day-count and premium rules, without a Frappe bench."""

import datetime as dt
import unittest

from dropout_hr_tw.payroll_calc import (
	employer_journal_rows,
	health_month,
	insured_days,
	money_for_days,
	supplement_premium,
)


class InsuredDays(unittest.TestCase):
	def test_bureau_examples(self):
		# 勞保局／常見說明：一個月 30 日，30 與 31 日同等，2 月 28 日加保 3 日、退保 28 日。
		self.assertEqual(insured_days("2026-01-15", None, "2026-01-01"), 16)
		self.assertEqual(insured_days("2026-01-30", None, "2026-01-01"), 1)
		self.assertEqual(insured_days("2026-01-31", None, "2026-01-01"), 1)
		self.assertEqual(insured_days("2026-02-08", None, "2026-02-01"), 23)
		self.assertEqual(insured_days("2026-02-28", None, "2026-02-01"), 3)
		self.assertEqual(insured_days("2026-03-28", None, "2026-03-01"), 3)
		self.assertEqual(insured_days("2025-01-01", "2026-01-15", "2026-01-01"), 15)
		self.assertEqual(insured_days("2025-01-01", "2026-01-30", "2026-01-01"), 30)
		self.assertEqual(insured_days("2025-01-01", "2026-01-31", "2026-01-01"), 30)
		self.assertEqual(insured_days("2025-01-01", "2026-02-08", "2026-02-01"), 8)
		self.assertEqual(insured_days("2025-01-01", "2026-02-28", "2026-02-01"), 28)
		self.assertEqual(insured_days("2026-01-05", "2026-01-20", "2026-01-01"), 16)
		self.assertEqual(insured_days("2026-01-20", "2026-01-31", "2026-01-01"), 11)
		self.assertEqual(insured_days("2026-02-03", "2026-02-18", "2026-02-01"), 16)
		self.assertEqual(insured_days("2026-02-18", "2026-02-28", "2026-02-01"), 11)
		self.assertEqual(insured_days("2026-01-30", "2026-01-31", "2026-01-01"), 1)
		self.assertEqual(insured_days("2024-02-29", None, "2024-02-01"), 2)

	def test_full_month_and_outside_the_month(self):
		self.assertEqual(insured_days("2025-06-01", None, "2026-10-12"), 30)
		self.assertEqual(insured_days(None, None, "2026-02-01"), 30)
		self.assertEqual(insured_days("2026-11-01", None, "2026-10-01"), 0)
		self.assertEqual(insured_days("2025-01-01", "2026-09-30", "2026-10-01"), 0)
		self.assertEqual(insured_days("2026-02-01", "2026-01-31", "2026-02-01"), 0)
		self.assertEqual(insured_days(dt.date(2026, 1, 1), None, dt.date(2026, 4, 2)), 30)


class HealthMonth(unittest.TestCase):
	def test_full_month_rules(self):
		self.assertEqual(health_month("2026-01-15", None, "2026-01-20"), 1)
		self.assertEqual(health_month("2025-01-01", "2026-01-15", "2026-01-01"), 0)
		self.assertEqual(health_month("2025-01-01", "2026-01-31", "2026-01-01"), 1)
		self.assertEqual(health_month("2026-01-05", "2026-01-20", "2026-01-01"), 1)
		self.assertEqual(health_month("2025-01-01", "2026-02-28", "2026-02-01"), 1)
		self.assertEqual(health_month("2025-01-01", "2026-02-27", "2026-02-01"), 0)
		self.assertEqual(health_month("2023-01-01", "2024-02-29", "2024-02-01"), 1)
		self.assertEqual(health_month("2026-03-01", None, "2026-02-01"), 0)
		self.assertEqual(health_month(None, None, "2026-05-01"), 1)


class Premiums(unittest.TestCase):
	def test_money_rounds_once(self):
		self.assertEqual(money_for_days(40100, "0.025", 30), 1003)
		self.assertEqual(money_for_days(40100, "0.025", 15), 501)
		self.assertEqual(money_for_days(40100, "0.025", 0), 0)
		self.assertEqual(money_for_days(0, "0.025", 30), 0)

	def test_bonus_supplement_matches_the_bureau_example(self):
		# 投保 30,300。第一次 100,000 未過 4 倍；第二次再 100,000，累計超過後扣 1,663。
		self.assertEqual(supplement_premium(0, 100_000, 30_300, "0.0211"), (0, 0))
		self.assertEqual(supplement_premium(100_000, 100_000, 30_300, "0.0211"), (78_800, 1_663))
		self.assertEqual(supplement_premium(0, 200_000, 40_100, 0), (0, 0))
		base, premium = supplement_premium(0, 20_000_000, 30_300, "0.0211")
		self.assertEqual(base, 10_000_000)
		self.assertEqual(premium, 211_000)

	def test_journal_rows_skip_blanks_and_report_half_pairs(self):
		amounts = {"tw_employer_li": 1000, "tw_employer_hi": 0, "tw_employer_pension": 500, "tw_employer_oc": 200}
		lines, missing = employer_journal_rows(amounts, {})
		self.assertEqual(lines, [])
		self.assertEqual(missing, [])
		lines, missing = employer_journal_rows(
			amounts,
			{"li_expense_account": "勞保費", "li_payable_account": "應付勞保", "pension_expense_account": "勞退費"},
		)
		self.assertEqual(missing, ["勞退"])
		self.assertEqual([(r["account"], r["debit"], r["credit"]) for r in lines], [("勞保費", 1000, 0), ("應付勞保", 0, 1000)])


if __name__ == "__main__":
	unittest.main()
