"""Shared behaviour for the Taiwan gateways, plugged into Frappe Payments the
same way as its own Stripe/PayPal controllers (`<Gateway> Settings` single)."""

import hashlib
import hmac
import secrets
from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.utils import cint, get_url, now_datetime


def new_trade_no(prefix="DO"):
	"""Both gateways cap the order number at 20 alphanumerics and reject reuse."""
	return f"{prefix}{now_datetime().strftime('%y%m%d%H%M%S')}{secrets.token_hex(3)}".upper()[:20]


def _sign(gateway, payment_request):
	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return hmac.new(key, f"{gateway}:{payment_request}".encode(), hashlib.sha256).hexdigest()[:32]


def verify_link(gateway, payment_request, token):
	return hmac.compare_digest(_sign(gateway, payment_request), token or "")


class TaiwanGatewayMixin:
	gateway_slug = ""
	supported_currencies = ("TWD",)

	def validate(self):
		if cint(self.enabled):
			for field in ("merchant_id", "hash_key", "hash_iv"):
				if not self.get(field):
					frappe.throw(_("{0} is required").format(self.meta.get_label(field)))

	def validate_transaction_currency(self, currency):
		if currency not in self.supported_currencies:
			frappe.throw(_("{0} 只支援新台幣（TWD）").format(self.doctype))

	def validate_minimum_transaction_amount(self, currency, amount):
		if int(round(amount)) < 1:
			frappe.throw(_("付款金額至少 1 元"))

	def get_payment_url(self, **kwargs):
		if not cint(self.enabled):
			frappe.throw(_("{0} 尚未啟用").format(self.doctype))
		pr = kwargs["reference_docname"]
		trade_no = frappe.db.get_value("Payment Request", pr, "dropout_trade_no")
		if not trade_no:
			trade_no = new_trade_no()
			frappe.db.set_value("Payment Request", pr, "dropout_trade_no", trade_no, update_modified=False)
		query = urlencode({"gateway": self.gateway_slug, "pr": pr, "token": _sign(self.gateway_slug, pr)})
		return get_url(f"/tw_pay?{query}")

	def checkout_form(self, payment_request):
		"""Return (action_url, fields) for the auto-submitting checkout page."""
		raise NotImplementedError

	def secrets(self):
		return self.get_password("hash_key"), self.get_password("hash_iv")
