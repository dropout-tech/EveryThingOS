"""Taiwan payroll amounts that do not need Frappe.

Rates stay in Taiwan Payroll Settings. These functions only apply the
published day-count and rounding rules to numbers the caller already chose.
"""

import datetime as dt
from decimal import ROUND_HALF_UP, Decimal

# 超過投保金額四倍的獎金，單次補充保險費費基上限（健保署）。
SUPPLEMENT_CAP = 10_000_000

EMPLOYER_PAIRS = (
	("tw_employer_li", "li_expense_account", "li_payable_account", "勞保"),
	("tw_employer_hi", "hi_expense_account", "hi_payable_account", "健保"),
	("tw_employer_pension", "pension_expense_account", "pension_payable_account", "勞退"),
	("tw_employer_oc", "oc_expense_account", "oc_payable_account", "職災"),
)


def as_date(value):
	if value is None or value == "":
		return None
	if isinstance(value, dt.datetime):
		return value.date()
	if isinstance(value, dt.date):
		return value
	return dt.date.fromisoformat(str(value)[:10])


def month_bounds(on_date):
	day = as_date(on_date)
	start = day.replace(day=1)
	if start.month == 12:
		nxt = start.replace(year=start.year + 1, month=1)
	else:
		nxt = start.replace(month=start.month + 1)
	return start, nxt - dt.timedelta(days=1)


def _dec(value) -> Decimal:
	if isinstance(value, Decimal):
		return value
	if isinstance(value, float):
		return Decimal(repr(value))
	return Decimal(str(value or 0))


def half_up(value) -> int:
	"""元以下四捨五入. Python's round() rounds halves to even."""
	return int(_dec(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def insured_days(joining, relieving, on_date) -> int:
	"""勞保、勞退、職災的計費日數。一個月一律 30 日，算到退保當日（含）。

	勞保局：30 日與 31 日加保都算 1 日；30 日與 31 日退保都算 30 日；
	2 月 28 日加保算 3 日，2 月 28 日退保算 28 日。整月在保算 30 日。
	`joining` 是加保日（到職日），`relieving` 是退保日（離職日，當天仍在保）。
	沒有到職日就維持整月，跟改這段之前一樣。
	"""
	start, end = month_bounds(on_date)
	join = as_date(joining)
	if join is None:
		return 30
	if join > end:
		return 0
	relieve = as_date(relieving)
	if relieve is not None and (relieve < start or relieve < join):
		return 0
	enrolled_here = start <= join <= end
	left_here = relieve is not None and start <= relieve <= end
	if not enrolled_here and not left_here:
		return 30
	join_day = min(join.day, 30) if enrolled_here else 1
	if left_here:
		return max(0, min(relieve.day, 30) - join_day + 1)
	return max(0, 30 - join_day + 1)


def health_month(joining, relieving, on_date) -> int:
	"""健保這個月收不收整月。0 或 1，不按日拆。

	健保法第 30 條：投保當月繳全月，退保當月免繳。
	離職日是該月最後一天時，退保生效日是次月 1 日，這個月仍收。
	同月到職又離職仍收全月，避免加保的月份沒人繳。
	"""
	start, end = month_bounds(on_date)
	join = as_date(joining)
	relieve = as_date(relieving)
	if join is not None and join > end:
		return 0
	if relieve is not None and (relieve < start or (join is not None and relieve < join)):
		return 0
	joined_this_month = join is not None and start <= join <= end
	left_before_month_end = relieve is not None and start <= relieve < end
	if left_before_month_end and not joined_this_month:
		return 0
	return 1


def money_for_days(principal, rate, days) -> int:
	"""月投保金額 × 費率 × 日數 / 30，只四捨五入一次。"""
	days = int(days or 0)
	if days <= 0:
		return 0
	days = min(days, 30)
	principal, rate = _dec(principal), _dec(rate)
	if principal <= 0 or rate <= 0:
		return 0
	return half_up(principal * rate * Decimal(days) / Decimal(30))


def supplement_premium(ytd_before, this_bonus, insured_salary, rate):
	"""獎金的二代健保補充保費。回傳 (費基, 應扣金額)。

	同一投保單位全年累計獎金，超過「當月投保金額 × 4」的部分才計費，
	單次費基不超過這次獎金，也不超過 1,000 萬。費率空白或 0 就不扣。
	"""
	this_bonus = _dec(this_bonus)
	rate = _dec(rate)
	insured = _dec(insured_salary)
	if this_bonus <= 0 or rate <= 0 or insured <= 0:
		return 0, 0
	cap = insured * 4
	ytd = _dec(ytd_before)
	excess_now = max(Decimal(0), ytd + this_bonus - cap)
	excess_before = max(Decimal(0), ytd - cap)
	base = min(excess_now - excess_before, this_bonus, Decimal(SUPPLEMENT_CAP))
	if base <= 0:
		return 0, 0
	return int(base), half_up(base * rate)


def employer_supplement(salary_total, insured_total, rate) -> int:
	"""投保單位的補充保險費。全民健康保險法第34條，費率用第33條的公告比率。

	費基是當月薪資所得總額減受僱者當月投保金額總額。薪資所得總額依施行細則第55條，
	是所得稅法第14條第1項第3類（所得格式代號 50）。差額不大於 0、或費率空白，就回傳 0。
	費率不寫死：呼叫端要把核對過的公告比率傳進來。角以下四捨五入一次（施行細則第52條）。
	"""
	base = _dec(salary_total) - _dec(insured_total)
	rate = _dec(rate)
	if base <= 0 or rate <= 0:
		return 0
	return half_up(base * rate)


def employer_journal_rows(amounts, accounts):
	"""雇主負擔的借貸。金額是 0，或兩邊科目都空白，就略過。

	只填了一邊的科目放進 missing，呼叫端應擋下送出，避免少記一半。
	"""
	lines = []
	missing = []
	for amount_key, expense_key, payable_key, label in EMPLOYER_PAIRS:
		amount = int(amounts.get(amount_key) or 0)
		expense, payable = accounts.get(expense_key), accounts.get(payable_key)
		if amount <= 0:
			continue
		if not expense and not payable:
			continue
		if not expense or not payable:
			missing.append(label)
			continue
		lines.append({"account": expense, "debit": amount, "credit": 0, "label": label})
		lines.append({"account": payable, "debit": 0, "credit": amount, "label": label})
	return lines, missing
