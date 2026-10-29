"""Deposits against a sales order, before any invoice is raised."""

import frappe
from frappe import _
from frappe.utils import flt, nowdate


@frappe.whitelist(methods=["POST"])
def record_deposit(sales_order, amount):
	"""Receive `amount` as a deposit on a submitted Sales Order.

	Uses ERPNext's payment mapper, then narrows the drafted balance down to
	this deposit. A bank account needs a reference, which is the order itself.
	Does not create a tax template, an invoice, or a stock move.
	"""
	so = frappe.get_doc("Sales Order", sales_order)
	if so.docstatus != 1:
		frappe.throw(_("這張訂單還沒送出，不能收訂金"))

	precision = so.precision("grand_total")
	amount = flt(amount, precision)
	remaining = flt(flt(so.grand_total) - flt(so.advance_paid), precision)
	if amount <= 0 or amount > remaining:
		frappe.throw(_("訂金要大於 0，而且不能超過這張訂單還沒收到的 {0}").format(remaining))

	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Sales Order", so.name)
	_set_paid_amount(pe, amount)
	bank_account = pe.paid_to if pe.payment_type == "Receive" else pe.paid_from
	if bank_account and frappe.get_cached_value("Account", bank_account, "account_type") == "Bank":
		pe.reference_no = so.name
		pe.reference_date = nowdate()
	pe.insert()
	pe.submit()
	advance_paid = flt(frappe.db.get_value("Sales Order", so.name, "advance_paid"))
	return {"ok": True, "payment_entry": pe.name, "advance_paid": advance_paid}


def _set_paid_amount(pe, amount):
	"""The mapper drafts a payment for the whole balance. Keep only this deposit.

	`received_amount` follows `paid_amount` when both accounts share a currency.
	Reference rows must allocate the same figure, or ERPNext keeps a difference
	and refuses to submit.
	"""
	full = flt(pe.paid_amount)
	same_currency = pe.paid_from_account_currency == pe.paid_to_account_currency
	pe.paid_amount = amount
	if same_currency or not full:
		pe.received_amount = amount
	else:
		pe.received_amount = flt(flt(pe.received_amount) * amount / full, pe.precision("received_amount"))
	first = True
	for row in pe.references:
		row.allocated_amount = amount if first else 0
		first = False
