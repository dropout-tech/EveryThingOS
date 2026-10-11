import frappe
from frappe.model.document import Document
from frappe.utils import get_url

from dropout_pay_tw.gateway import TaiwanGatewayMixin
from dropout_pay_tw.signing import newebpay_encrypt, newebpay_trade_sha

ENDPOINTS = {
	True: "https://ccore.newebpay.com/MPG/mpg_gateway",
	False: "https://core.newebpay.com/MPG/mpg_gateway",
}


class NewebPaySettings(TaiwanGatewayMixin, Document):
	gateway_slug = "newebpay"

	def checkout_form(self, payment_request):
		pr = frappe.get_doc("Payment Request", payment_request)
		hash_key, hash_iv = self.secrets()
		info = {
			"MerchantID": self.merchant_id,
			"RespondType": "JSON",
			"TimeStamp": str(int(frappe.utils.now_datetime().timestamp())),
			"Version": "2.0",
			"MerchantOrderNo": pr.dropout_trade_no,
			"Amt": str(int(round(pr.grand_total))),
			"ItemDesc": (pr.subject or f"{pr.reference_doctype} {pr.reference_name}")[:50],
			"Email": pr.email_to or "",
			"NotifyURL": self.notify_url,
			"ReturnURL": get_url(self.return_path or "/"),
			"OrderComment": pr.name,
		}
		trade_info = newebpay_encrypt(info, hash_key, hash_iv)
		return ENDPOINTS[bool(self.sandbox)], {
			"MerchantID": self.merchant_id,
			"TradeInfo": trade_info,
			"TradeSha": newebpay_trade_sha(trade_info, hash_key, hash_iv),
			"Version": "2.0",
		}
