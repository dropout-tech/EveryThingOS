import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from dropout_core.credit import can_order
from dropout_core.tests.test_dropout_flow import company, leaf, make_item, submit


def make_customer(label, limit=None):
	doc = {
		"doctype": "Customer",
		"customer_name": f"{label}-{frappe.generate_hash(length=6)}",
		"customer_group": leaf("Customer Group"),
		"territory": leaf("Territory"),
	}
	if limit is not None:
		doc["credit_limits"] = [{"company": company(), "credit_limit": limit}]
	return frappe.get_doc(doc).insert().name


def unpaid_invoice(customer, rate):
	invoice = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"customer": customer,
			"company": company(),
			"posting_date": nowdate(),
			"due_date": nowdate(),
			"items": [{"item_code": make_item(), "qty": 1, "rate": rate}],
		}
	)
	invoice.flags.dont_fetch_tax = True
	return submit(invoice)


class TestCredit(FrappeTestCase):
	def test_over_the_limit_is_refused(self):
		customer = make_customer("額度客人", 1000)
		invoice = unpaid_invoice(customer, 800)
		self.assertEqual(flt(invoice.outstanding_amount), 800)
		self.assertEqual(can_order(customer, 300), {"ok": False, "message": "超過信用額度"})
		self.assertEqual(can_order(customer, 200), {"ok": True})

	def test_no_limit_allows(self):
		customer = make_customer("沒額度客人")
		self.assertEqual(can_order(customer, 300), {"ok": True})

	def test_zero_limit_allows(self):
		customer = make_customer("額度零客人", 0)
		self.assertEqual(can_order(customer, 300), {"ok": True})

	def test_shell_quotation_stops_at_the_credit_limit(self):
		from dropout_core.actions import create_quotation

		customer = make_customer("殼額度", 1000)
		unpaid_invoice(customer, 800)
		item = make_item()
		refused = create_quotation("Customer", customer, [{"item_code": item, "qty": 1, "rate": 300}])
		self.assertEqual(refused, {"ok": False, "message": "超過信用額度"})
		self.assertEqual(frappe.db.count("Quotation", {"party_name": customer}), 0)
		allowed = create_quotation("Customer", customer, [{"item_code": item, "qty": 1, "rate": 200}])
		self.assertTrue(allowed["ok"], allowed)
		self.assertEqual(flt(allowed["created"]["grand_total"]), 200)
