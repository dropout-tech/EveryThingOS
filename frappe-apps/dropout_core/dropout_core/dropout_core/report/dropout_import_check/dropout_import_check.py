from frappe import _

from dropout_core.checks import run_all


def execute(filters=None):
	columns = [
		{"fieldname": "check", "label": _("檢查"), "fieldtype": "Data", "width": 160},
		{"fieldname": "reference_doctype", "label": _("類型"), "fieldtype": "Link", "options": "DocType", "width": 120},
		{"fieldname": "reference_name", "label": _("單據"), "fieldtype": "Dynamic Link", "options": "reference_doctype", "width": 200},
		{"fieldname": "detail", "label": _("說明"), "fieldtype": "Data", "width": 320},
	]
	return columns, run_all()
