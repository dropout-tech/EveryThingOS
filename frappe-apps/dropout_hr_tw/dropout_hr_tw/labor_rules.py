"""Day counts and hour bands written in statute, not the yearly rate notices.

Minimum wage, insurance rates, the meal-allowance cap and withholding brackets
stay in Taiwan Payroll Settings. Nothing here produces a government filing file.
"""

import calendar
import datetime as dt
from decimal import Decimal
from fractions import Fraction

from dropout_hr_tw.payroll_calc import _dec, as_date, half_up

# 勞基法第30條：正常工時每日 8 小時。月薪視為已含 30 日 × 8 小時（勞動部：月薪除以 30 再除以 8）。
NORMAL_HOURS_PER_DAY = 8
MONTHLY_HOUR_DIVISOR = 30 * NORMAL_HOURS_PER_DAY

# 勞基法第32條第2項。46 是原則；54 與 138 只在工會或勞資會議同意後。
EXTENSION_HOURS_PER_MONTH = 46
EXTENSION_HOURS_PER_MONTH_WITH_CONSENT = 54
EXTENSION_HOURS_PER_QUARTER_WITH_CONSENT = 138
EXTENSION_HOURS_PER_DAY = 4

# 勞工請假規則、性別平等工作法裡不隨年度公告改的日數。
WEDDING_LEAVE_DAYS = 14
PERSONAL_LEAVE_DAYS = 14
OUTPATIENT_SICK_DAYS = 30
SICK_HALF_PAY_DAYS = 30
SICK_NO_DISADVANTAGE_DAYS = 10
FAMILY_CARE_DAYS = 7
MENSTRUAL_DAYS_PER_MONTH = 1
MENSTRUAL_DAYS_OUTSIDE_SICK = 3
PRENATAL_DAYS = 7
PARTNER_LEAVE_DAYS = 7

FUNERAL_DAYS = {
	"父母": 8,
	"養父母": 8,
	"繼父母": 8,
	"配偶": 8,
	"祖父母": 6,
	"子女": 6,
	"配偶之父母": 6,
	"配偶之養父母": 6,
	"配偶之繼父母": 6,
	"曾祖父母": 3,
	"兄弟姊妹": 3,
	"配偶之祖父母": 3,
}

# 只在假別仍是我們上一版原文時才改。公司改過天數或說明就留著。
SHIPPED_LEAVE_EDITS = (
	{
		"leave_type_name": "婚假",
		"match": {"max_leaves_allowed": 8, "description": "勞工請假規則第2條。8 日，工資照給。"},
		"set": {
			"max_leaves_allowed": WEDDING_LEAVE_DAYS,
			"description": "勞工請假規則第2條，115年10月1日起14日，工資照給。自結婚登記日前10日起3個月內請畢，雇主同意得延到1年。到職前已登記者不適用。第9至14日的工資可向勞動部申請補助，這裡不產生申請檔。",
		},
	},
)


def add_months(day, months):
	"""日曆月。月底沒有那一天時，落到該月最後一天。"""
	day = as_date(day)
	index = day.month - 1 + int(months)
	year = day.year + index // 12
	month = index % 12 + 1
	last = calendar.monthrange(year, month)[1]
	return dt.date(year, month, min(day.day, last))


def annual_leave_days(joining, on_date) -> int:
	"""勞動基準法第38條。依到職日到這一天的繼續工作年資，回傳應有的特別休假日數。

	滿 6 個月未滿 1 年 3 日；滿 1 年 7 日；滿 2 年 10 日；滿 3 年每年 14 日；
	滿 5 年每年 15 日；滿 10 年起每年加 1 日，加至 30 日（滿 10 年 16 日，滿 24 年 30 日）。
	日期由勞工排。年度終結或契約終止還沒休的，要折發工資。
	"""
	start, end = as_date(joining), as_date(on_date)
	if start is None or end is None:
		raise ValueError("需要到職日和計算日")
	if end < start:
		raise ValueError("計算日早於到職日")
	if end < add_months(start, 6):
		return 0
	years = 0
	while add_months(start, 12 * (years + 1)) <= end:
		years += 1
		if years > 80:
			break
	if years >= 10:
		return min(30, 15 + (years - 9))
	if years >= 5:
		return 15
	if years >= 3:
		return 14
	if years >= 2:
		return 10
	if years >= 1:
		return 7
	return 3


def annual_leave_period(joining, on_date):
	"""這一天落在哪一個特休年度，以到職日週年制計：回傳 (起日, 迄日, 日數)。未滿 6 個月回傳 None。

	滿 6 個月那天起到滿 1 年前一天是 3 日；之後每個到職週年起算一年。
	公司若和勞工約定曆年制或會計年度制，就不要用這個自動給假，在 ERPNext 自己建。
	"""
	start, day = as_date(joining), as_date(on_date)
	if start is None or day is None:
		raise ValueError("需要到職日和計算日")
	six, one = add_months(start, 6), add_months(start, 12)
	if day < six:
		return None
	if day < one:
		return six, one - dt.timedelta(days=1), annual_leave_days(start, six)
	years = 1
	while add_months(start, 12 * (years + 1)) <= day and years <= 80:
		years += 1
	begin = add_months(start, 12 * years)
	return begin, add_months(start, 12 * (years + 1)) - dt.timedelta(days=1), annual_leave_days(start, begin)


def overtime_refusal(result, month_hours_so_far, *, consented=False):
	"""記加班之前的法定上限檢查。可以記就回傳 None，否則回傳一句原因。

	result 是 overtime_pay 的回傳。month_hours_so_far 是同一位員工這個月已記、計入第32條的時數。
	每三個月 138 小時的起算由勞資約定，這裡不替公司決定，只檢查每月。
	"""
	if result["over_daily_cap"]:
		return "超過一日 12 小時（勞動基準法第32條第2項），不能記。"
	if Decimal(result["uncounted_hours"]) > 0:
		return f"有 {result['uncounted_hours']} 小時沒有法定倍數可算，請拆開或改記別的加班種類。"
	add = Decimal(result["hours_in_monthly_cap"])
	limit = EXTENSION_HOURS_PER_MONTH_WITH_CONSENT if consented else EXTENSION_HOURS_PER_MONTH
	so_far = _hours(month_hours_so_far)
	if add and so_far + add > limit:
		return f"這個月已記 {so_far} 小時，再加 {add} 小時會超過每月 {limit} 小時（勞動基準法第32條第2項）。"
	return None


def unused_annual_leave_wage(monthly_wage, unused_days) -> int:
	"""未休特別休假折發的工資。施行細則第24條之1：計月者，最近一個月正常工作時間工資除以 30，再乘未休日數。

	只四捨五入一次。這是正常工時工資，不含加班費。
	"""
	days = _dec(unused_days)
	wage = _dec(monthly_wage)
	if days < 0 or wage < 0:
		raise ValueError("日數和月薪不能是負的")
	if days == 0 or wage == 0:
		return 0
	return half_up(wage / Decimal(30) * days)


def hourly_from_monthly(monthly_wage) -> Decimal:
	"""月薪制的平日每小時工資額：月薪 ÷ 30 ÷ 8。不在這裡四捨五入，讓加班費最後才進位一次。"""
	wage = _dec(monthly_wage)
	if wage < 0:
		raise ValueError("月薪不能是負的")
	return wage / Decimal(MONTHLY_HOUR_DIVISOR)


def _hours(value) -> Decimal:
	hours = _dec(value)
	if hours < 0:
		raise ValueError("時數不能是負的")
	return hours


def _bands(hours, steps):
	left = _hours(hours)
	used = []
	for cap, multiplier, label in steps:
		if left <= 0:
			break
		take = min(left, Decimal(cap))
		used.append({"hours": take, "multiplier": multiplier, "label": label})
		left -= take
	return used, left


def _money(hourly, used):
	total = Decimal(0)
	rows = []
	rate = _dec(hourly)
	for band in used:
		amount = rate * band["hours"] * Decimal(band["multiplier"].numerator) / Decimal(band["multiplier"].denominator)
		total += amount
		rows.append({
			"hours": str(band["hours"]),
			"multiplier": f"{band['multiplier'].numerator}/{band['multiplier'].denominator}",
			"label": band["label"],
		})
	return total, rows


# 前兩段是加給後的整段時薪（平日）或另再加給的金額（休息日）。兩者的倍數剛好相同。
_FIRST = Fraction(4, 3)
_NEXT = Fraction(5, 3)
_REST_AFTER_EIGHT = Fraction(8, 3)
_DOUBLE = Fraction(2, 1)
_ONE = Fraction(1, 1)

_WEEKDAY = (
	(2, _FIRST, "延長工時前 2 小時，按平日每小時工資額加給三分之一以上（整段是 4/3）"),
	(2, _NEXT, "再延長 2 小時，加給三分之二以上（整段是 5/3）"),
)
_REST = (
	(2, _FIRST, "休息日前 2 小時，另再加給一又三分之一以上"),
	(6, _NEXT, "休息日第 3 至第 8 小時，另再加給一又三分之二以上"),
	(4, _REST_AFTER_EIGHT, "休息日第 9 至第 12 小時，另再加給二又三分之二以上"),
)
_HOLIDAY = (
	(8, _ONE, "休假日 8 小時以內，工資照給之外再加發一倍"),
	(2, _FIRST, "休假日超過 8 小時後的前 2 小時，加給三分之一以上"),
	(2, _NEXT, "再 2 小時，加給三分之二以上"),
)


def overtime_pay(hourly, hours, kind):
	"""人資已經算出來的時數，乘上法定加給，得到要登在「額外薪資」的金額。

	不讀打卡。月薪制請先用 hourly_from_monthly。回傳的 extra 是加發金額，
	休息日和休假日的當日工資已經在月薪裡，不再加一次。

	kind:
	- weekday：平日延長工時。一日連同正常工時不得超過 12 小時，所以這裡只乘前 4 小時。
	- rest：休息日。前 2 小時另再加給 1又1/3，第 3 至 8 小時另再加給 1又2/3，
	  第 9 至 12 小時另再加給 2又2/3（勞動部加班費試算、臺北市政府說明，107年3月1日後）。
	- rest_disaster：天災、事變或突發事件的休息日。倍數同休息日，工時不計入每月 46 小時。
	- disaster：平日因天災等延長。按平日每小時工資額加倍發給，不受 12 小時與 46 小時限制。
	- holiday：國定假日或特別休假，經勞工同意出勤。8 小時以內再加發一倍；超過 8 小時比照平日延長的兩段。
	- regular_off：例假只在天災等事由才能停止。8 小時以內加倍發給。超過 8 小時條文沒有另定倍數，不算進金額。
	"""
	rate = _dec(hourly)
	worked = _hours(hours)
	if rate < 0:
		raise ValueError("時薪不能是負的")
	counts = kind in ("weekday", "rest")
	steps = {
		"weekday": _WEEKDAY,
		"rest": _REST,
		"rest_disaster": _REST,
		"disaster": ((10**6, _DOUBLE, "天災、事變或突發事件延長工時，按平日每小時工資額加倍發給"),),
		"holiday": _HOLIDAY,
		"regular_off": ((8, _ONE, "停止例假，工資加倍發給，並應事後補假"),),
	}.get(kind)
	if steps is None:
		raise ValueError("不知道的加班種類")
	if rate == 0 or worked == 0:
		used, leftover = [], worked
		exact = Decimal(0)
		rows = []
	else:
		used, leftover = _bands(worked, steps)
		exact, rows = _money(rate, used)
	in_cap = worked if counts else (max(Decimal(0), worked - 8) if kind == "holiday" else Decimal(0))
	daily_limit = {
		"weekday": EXTENSION_HOURS_PER_DAY,
		"rest": NORMAL_HOURS_PER_DAY + EXTENSION_HOURS_PER_DAY,
		"holiday": NORMAL_HOURS_PER_DAY + EXTENSION_HOURS_PER_DAY,
	}.get(kind)
	notes = {
		"weekday": "勞動基準法第24條第1項、第32條。超過 4 小時的部分已超過一日 12 小時，這裡不另發明倍數。",
		"rest": "勞動基準法第24條第2項。休息日出勤計入第32條每月延長工時。第 9 小時起的 8/3 是勞動部加班費試算所載的另再加給，不是再把 8/3 疊到已加倍的時薪上。",
		"rest_disaster": "勞動基準法第36條：天災等休息日工時不計入每月 46 小時，工資仍依第24條第2項。開始後 24 小時內通知工會，沒有工會就報主管機關，並事後給適當休息。",
		"disaster": "勞動基準法第24條第1項第3款、第32條第4項。開始後 24 小時內通知工會或報備，並事後給適當休息。",
		"holiday": "勞動基準法第39條、施行細則第24條之3。超過 8 小時的算法依勞動部 2025-09-05 國定假日工資說明。要經勞工同意。",
		"regular_off": "勞動基準法第39條第2項。沒有天災、事變或突發事件不得使勞工在例假出勤。工資加倍發給，事後補假，並於事後 24 小時內報主管機關核備。超過 8 小時沒有條文倍數，不計入金額。",
	}
	return {
		"extra": half_up(exact) if exact else 0,
		"exact": str(exact),
		"bands": rows,
		"uncounted_hours": str(leftover),
		"over_daily_cap": bool(daily_limit is not None and worked > daily_limit),
		"hours_in_monthly_cap": str(in_cap),
		"cite": notes[kind],
	}


def overtime_tax_split(extension_hours, holiday_hours=0, *, consented=False, quarter_extension_hours=None):
	"""加班費免稅時數。財政部 74 年 5 月 29 日台財稅第 16713 號函；稅務入口網 1125（115-04-10）。

	extension_hours 是平日延長工時加上休息日工時。holiday_hours 是國定假日、例假、
	特別休假的出勤時數：前 8 小時不併入每月延長工時，仍免稅（金額要符合勞基法標準）；
	超過 8 小時的部分併入（財政部中區國稅局）。一律按月定額的津貼不是加班費，不免稅。

	consented 表示已依第32條第2項但書，每月可到 54 小時、每三個月 138 小時，
	稅務入口網把這個限度內的加班費也列為免稅。沒有同意就用 46。
	"""
	pool = _hours(extension_hours)
	holiday = _hours(holiday_hours)
	if quarter_extension_hours is not None:
		quarter = _hours(quarter_extension_hours)
		if quarter < pool:
			raise ValueError("三個月時數要包含這個月")
	else:
		quarter = None
	holiday_free = min(holiday, Decimal(NORMAL_HOURS_PER_DAY))
	pool += holiday - holiday_free
	cap = Decimal(EXTENSION_HOURS_PER_MONTH_WITH_CONSENT if consented else EXTENSION_HOURS_PER_MONTH)
	quarter_applied = bool(consented and quarter is not None)
	if quarter_applied:
		room = Decimal(EXTENSION_HOURS_PER_QUARTER_WITH_CONSENT) - (quarter - pool)
		cap = min(cap, max(Decimal(0), room))
	free = min(pool, cap)
	return {
		"monthly_cap": EXTENSION_HOURS_PER_MONTH_WITH_CONSENT if consented else EXTENSION_HOURS_PER_MONTH,
		"holiday_tax_free_hours": str(holiday_free),
		"extension_tax_free_hours": str(free),
		"taxable_hours": str(pool - free),
		"over_labor_cap": pool > cap,
		"quarter_applied": quarter_applied,
		"cite": "財政部74年5月29日台財稅第16713號函；財政部稅務入口網1125（115-04-10）。休假超過 8 小時計入每月延長工時：財政部中區國稅局。",
	}


def funeral_leave_days(relation) -> int:
	"""勞工請假規則第3條。關係不在條文列舉裡就丟錯，避免用猜測的天數。"""
	if relation not in FUNERAL_DAYS:
		raise ValueError("這層親屬不在勞工請假規則第3條的列舉")
	return FUNERAL_DAYS[relation]


def maternity_leave(reason, employed_months):
	"""產假日數，以及勞動基準法第50條有沒有規定工資。

	分娩 56 日、妊娠三個月以上流產 28 日：受僱滿 6 個月工資照給，未滿減半。
	妊娠二個月以上未滿三個月 7 日、未滿二個月 5 日：日數在性別平等工作法第15條，
	第50條的工資照給沒有寫到這兩段，這裡不假設給薪比例。
	"""
	months = int(employed_months)
	if months < 0:
		raise ValueError("受僱月數不能是負的")
	table = {
		"birth": (56, True, "勞動基準法第50條、性別平等工作法第15條。分娩前後八星期，例假與國定假日算在裡面。"),
		"miscarriage_12w": (28, True, "勞動基準法第50條。妊娠三個月以上流產，停止工作四星期。"),
		"miscarriage_8w": (7, False, "性別平等工作法第15條給一星期。勞動基準法第50條的工資照給只寫到妊娠三個月以上，未滿三個月的給薪比例這裡不假設。"),
		"miscarriage_under_8w": (5, False, "性別平等工作法第15條給五日。工資比例同上一列，這裡不假設。"),
	}
	if reason not in table:
		raise ValueError("不知道的產假事由")
	days, paid, cite = table[reason]
	return {
		"days": days,
		"wage_fraction": (Decimal(1) if months >= 6 else Decimal("0.5")) if paid else None,
		"cite": cite,
	}


def _same(left, right):
	if isinstance(right, bool) or not isinstance(right, (int, float, Decimal)):
		return left == right
	try:
		return Decimal(str(left)) == Decimal(str(right))
	except Exception:
		return False


def leave_field_upgrade(name, values):
	"""公司沒改過的舊婚假（8 日、原文說明）才升到 14 日。改過任一邊就回傳 None。"""
	for row in SHIPPED_LEAVE_EDITS:
		if row["leave_type_name"] != name:
			continue
		if all(_same(values.get(key), expected) for key, expected in row["match"].items()):
			return dict(row["set"])
	return None
