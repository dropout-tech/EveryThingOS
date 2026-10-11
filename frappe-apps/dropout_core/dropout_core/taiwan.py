"""Taiwan-specific normalisation. Pure functions: no Frappe import, so the
onboarding toolkit and unit tests can reuse them outside a bench."""

import re

_TAX_ID_WEIGHTS = (1, 2, 1, 2, 1, 2, 4, 1)


def is_valid_tax_id(value: str | None) -> bool:
	"""統一編號 checksum. Since 2023 the divisor is 5 (was 10); 5 accepts both."""
	if not value or not re.fullmatch(r"\d{8}", value):
		return False
	total = 0
	for digit, weight in zip(value, _TAX_ID_WEIGHTS):
		product = int(digit) * weight
		total += product // 10 + product % 10
	if total % 5 == 0:
		return True
	return value[6] == "7" and (total + 1) % 5 == 0


def normalize_email(value: str | None) -> str | None:
	if not value:
		return None
	value = value.strip().lower()
	return value if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) else None


def normalize_phone(value: str | None) -> str | None:
	"""Return E.164 for Taiwan numbers (+8869XXXXXXXX, +886 landlines); other +E.164 kept."""
	if not value:
		return None
	digits = re.sub(r"[^\d+]", "", value)
	if digits.startswith("+"):
		return digits if re.fullmatch(r"\+\d{8,15}", digits) else None
	if digits.startswith("886"):
		digits = "+" + digits
		return digits if re.fullmatch(r"\+886\d{8,9}", digits) else None
	if digits.startswith("0") and re.fullmatch(r"0\d{8,9}", digits):
		return "+886" + digits[1:]
	return None
