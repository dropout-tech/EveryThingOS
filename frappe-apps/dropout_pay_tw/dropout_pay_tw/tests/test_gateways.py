from urllib.parse import parse_qs, urlparse

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from dropout_core import api
from dropout_pay_tw.signing import ecpay_check_mac_value, ecpay_verify, newebpay_decrypt, newebpay_trade_sha

KEY, IV = "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs"
NEWEB_KEY, NEWEB_IV = "12345678901234567890123456789012", "1234567890123456"


def leaf(doctype):
	return frappe.get_all(doctype, filters={"is_group": 0}, pluck="name", limit=1)[0]


def company():
	return frappe.defaults.get_global_default("company")


def setup_gateway(gateway, key, iv):
	settings = frappe.get_single(f"{gateway} Settings")
	settings.update({"enabled": 1, "sandbox": 1, "merchant_id": "3002607", "hash_key": key, "hash_iv": iv, "notify_url": f"https://glue.example.com/pay/{gateway.lower()}?site=test"})
	settings.save()
	account = frappe.db.get_value("Account", {"account_type": "Cash", "company": company(), "is_group": 0})
	name = frappe.db.get_value("Payment Gateway Account", {"payment_gateway": gateway})
	if not name:
		name = frappe.get_doc({"doctype": "Payment Gateway Account", "payment_gateway": gateway, "payment_account": account, "currency": "TWD"}).insert().name
	return name


def make_invoice(amount):
	item = "DO-PAY-ITEM"
	if not frappe.db.exists("Item", item):
		frappe.get_doc({"doctype": "Item", "item_code": item, "item_name": item, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 0}).insert()
	customer = frappe.db.get_value("Customer", {"customer_name": "付款客人"}) or frappe.get_doc(
		{"doctype": "Customer", "customer_name": "付款客人", "customer_group": leaf("Customer Group"), "territory": leaf("Territory")}
	).insert().name
	inv = frappe.get_doc(
		{"doctype": "Sales Invoice", "customer": customer, "company": company(), "posting_date": nowdate(), "due_date": add_days(nowdate(), 30), "items": [{"item_code": item, "qty": 1, "rate": amount}]}
	)
	inv.insert()
	inv.submit()
	return inv


def make_pr(invoice, gateway_account):
	from erpnext.accounts.doctype.payment_request.payment_request import make_payment_request

	pr = make_payment_request(dt="Sales Invoice", dn=invoice.name, payment_gateway_account=gateway_account, submit_doc=1, mute_email=1, return_doc=1)
	# Same call Webshop makes for a shopping-cart checkout.
	url = pr.get_payment_url()
	pr.reload()
	pr.payment_url = url
	return pr


def page_context(url):
	from dropout_pay_tw.templates.pages import tw_pay

	query = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
	frappe.local.form_dict = frappe._dict(query)
	context = frappe._dict()
	tw_pay.get_context(context)
	return context


class TestSigning(FrappeTestCase):
	def test_ecpay_official_example(self):
		params = {
			"ChoosePayment": "ALL", "EncryptType": "1", "ItemName": "Apple iphone 15", "MerchantID": "3002607",
			"MerchantTradeDate": "2023/03/12 15:30:23", "MerchantTradeNo": "ecpay20230312153023", "PaymentType": "aio",
			"ReturnURL": "https://www.ecpay.com.tw/receive.php", "TotalAmount": "30000", "TradeDesc": "促銷方案",
		}
		self.assertEqual(ecpay_check_mac_value(params, KEY, IV), "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840")


class TestECPayFlow(FrappeTestCase):
	def test_checkout_and_notify(self):
		pga = setup_gateway("ECPay", KEY, IV)
		invoice = make_invoice(1500)
		pr = make_pr(invoice, pga)
		self.assertTrue(pr.dropout_trade_no)
		self.assertIn("/tw_pay?", pr.payment_url)

		context = page_context(pr.payment_url)
		self.assertTrue(context.action.startswith("https://payment-stage.ecpay.com.tw"))
		self.assertEqual(context.fields["TotalAmount"], "1500")
		self.assertTrue(ecpay_verify(context.fields, KEY, IV))

		frappe.local.form_dict = frappe._dict({"gateway": "ecpay", "pr": pr.name, "token": "bad"})
		from dropout_pay_tw.templates.pages import tw_pay

		self.assertRaises(frappe.PermissionError, tw_pay.get_context, frappe._dict())

		result = api.record_payment("ecpay", pr.dropout_trade_no, 1500, gateway_txn="2310011234567890")
		self.assertEqual(result["status"], "paid")
		self.assertEqual(frappe.db.get_value("Payment Request", pr.name, "status"), "Paid")
		self.assertEqual(api.record_payment("ecpay", pr.dropout_trade_no, 1500)["status"], "already_paid")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice.name, "outstanding_amount"), 0)
		self.assertTrue(frappe.db.exists("DropOut Event", {"event_type": "paid", "party": invoice.customer}))

	def test_amount_mismatch_goes_to_people(self):
		pga = setup_gateway("ECPay", KEY, IV)
		invoice = make_invoice(800)
		pr = make_pr(invoice, pga)
		self.assertEqual(api.record_payment("ecpay", pr.dropout_trade_no, 80)["status"], "mismatch")
		self.assertNotEqual(frappe.db.get_value("Payment Request", pr.name, "status"), "Paid")
		self.assertTrue(frappe.db.exists("ToDo", {"reference_type": "Payment Request", "reference_name": pr.name}))
		self.assertEqual(api.record_payment("ecpay", "NOPE", 80)["status"], "unknown_trade_no")


class TestNewebPayFlow(FrappeTestCase):
	def test_checkout_form_round_trips(self):
		pga = setup_gateway("NewebPay", NEWEB_KEY, NEWEB_IV)
		invoice = make_invoice(990)
		pr = make_pr(invoice, pga)
		context = page_context(pr.payment_url)
		self.assertTrue(context.action.startswith("https://ccore.newebpay.com"))
		info = newebpay_decrypt(context.fields["TradeInfo"], NEWEB_KEY, NEWEB_IV)
		self.assertEqual(info["MerchantOrderNo"], pr.dropout_trade_no)
		self.assertEqual(info["Amt"], "990")
		self.assertEqual(context.fields["TradeSha"], newebpay_trade_sha(context.fields["TradeInfo"], NEWEB_KEY, NEWEB_IV))
