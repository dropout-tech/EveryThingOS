import frappe
from frappe.model.document import Document
from frappe.utils import get_url

from dropout_pay_tw.gateway import TaiwanGatewayMixin
from dropout_pay_tw.signing import ecpay_check_mac_value

ENDPOINTS = {
	True: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
	False: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
}


class ECPaySettings(TaiwanGatewayMixin, Document):
	gateway_slug = "ecpay"

	def checkout_form(self, payment_request):
		pr = frappe.get_doc("Payment Request", payment_request)
		hash_key, hash_iv = self.secrets()
		fields = {
			"MerchantID": self.merchant_id,
			"MerchantTradeNo": pr.dropout_trade_no,
			"MerchantTradeDate": frappe.utils.now_datetime().strftime("%Y/%m/%d %H:%M:%S"),
			"PaymentType": "aio",
			"TotalAmount": str(int(round(pr.grand_total))),
			"TradeDesc": (pr.subject or pr.reference_name)[:200],
			"ItemName": f"{pr.reference_doctype} {pr.reference_name}"[:400],
			"ReturnURL": self.notify_url,
			"ChoosePayment": "ALL",
			"EncryptType": "1",
			"ClientBackURL": get_url(self.return_path or "/"),
			"CustomField1": pr.name,
		}
		fields["CheckMacValue"] = ecpay_check_mac_value(fields, hash_key, hash_iv)
		return ENDPOINTS[bool(self.sandbox)], fields
