import frappe


def after_install():
	from payments.utils import create_payment_gateway

	for gateway in ("ECPay", "NewebPay"):
		create_payment_gateway(gateway)
	frappe.db.commit()
