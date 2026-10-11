import frappe
from frappe import _

from dropout_pay_tw.gateway import verify_link

SETTINGS = {"ecpay": "ECPay Settings", "newebpay": "NewebPay Settings"}

no_cache = 1


def get_context(context):
	args = frappe.form_dict
	doctype = SETTINGS.get(args.get("gateway"))
	if not doctype or not verify_link(args.get("gateway"), args.get("pr"), args.get("token")):
		frappe.throw(_("付款連結無效"), frappe.PermissionError)
	status = frappe.db.get_value("Payment Request", args.pr, "status")
	if status == "Paid":
		frappe.local.flags.redirect_location = "/payment-success"
		raise frappe.Redirect
	context.action, context.fields = frappe.get_single(doctype).checkout_form(args.pr)
	context.title = _("前往付款")
