"""Idempotent setup. Runs on install-app and on every migrate, so a site that
drifted is put back to the expected state by `bench migrate`."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ROLES = ("DropOut Integration", "DropOut Marketing")
NEW_FRIENDS = "新朋友"
CUSTOMERS = "老客人"

CUSTOM_FIELDS = {
	"Sales Invoice": [
		{
			"fieldname": "dropout_einvoice_section",
			"fieldtype": "Section Break",
			"label": "電子發票",
			"insert_after": "remarks",
			"collapsible": 1,
		},
		{
			"fieldname": "dropout_einvoice_status",
			"fieldtype": "Select",
			"label": "電子發票狀態",
			"options": "\n待上傳\n已開立\n失敗\n已作廢",
			"insert_after": "dropout_einvoice_section",
			"read_only": 1,
			"allow_on_submit": 1,
			"in_standard_filter": 1,
		},
		{
			"fieldname": "dropout_einvoice_number",
			"fieldtype": "Data",
			"label": "發票號碼",
			"insert_after": "dropout_einvoice_status",
			"read_only": 1,
			"allow_on_submit": 1,
			"search_index": 1,
		},
		{
			"fieldname": "dropout_einvoice_error",
			"fieldtype": "Small Text",
			"label": "開立失敗原因",
			"insert_after": "dropout_einvoice_number",
			"read_only": 1,
			"allow_on_submit": 1,
		},
	],
	"Payment Request": [
		{
			"fieldname": "dropout_trade_no",
			"fieldtype": "Data",
			"label": "金流交易編號",
			"insert_after": "payment_gateway",
			"read_only": 1,
			"unique": 1,
			"no_copy": 1,
		},
	],
	"Stock Reconciliation": [
		{
			"fieldname": "dropout_import_key",
			"fieldtype": "Data",
			"label": "導入批次",
			"insert_after": "purpose",
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
		},
	],
}


def after_install():
	ensure_setup()


def after_migrate():
	ensure_setup()


def ensure_setup():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(ignore_permissions=True)

	create_custom_fields(CUSTOM_FIELDS, update=True)

	settings = frappe.get_single("DropOut Settings")
	for fieldname, title in (("new_friends_group", NEW_FRIENDS), ("customers_group", CUSTOMERS)):
		if not frappe.db.exists("Email Group", title):
			frappe.get_doc({"doctype": "Email Group", "title": title}).insert(ignore_permissions=True)
		if not settings.get(fieldname):
			settings.set(fieldname, title)
	settings.flags.ignore_permissions = True
	settings.save()
	frappe.db.commit()


def configure_glue(url, secret):
	"""Point DropOut Events at the Cloudflare glue through Frappe's own Webhook."""
	settings = frappe.get_single("DropOut Settings")
	settings.glue_url = url.rstrip("/")
	settings.glue_secret = secret
	settings.flags.ignore_permissions = True
	settings.save()

	name = "DropOut Glue"
	hook = frappe.get_doc("Webhook", name) if frappe.db.exists("Webhook", name) else frappe.new_doc("Webhook")
	hook.update(
		{
			"__newname": name,
			"webhook_doctype": "DropOut Event",
			"webhook_docevent": "after_insert",
			"request_url": f"{settings.glue_url}/erpnext/events?site={frappe.local.site}",
			"request_method": "POST",
			"request_structure": "JSON",
			"enable_security": 1,
			"webhook_secret": secret,
			"enabled": 1,
			"webhook_json": WEBHOOK_JSON,
		}
	)
	hook.flags.ignore_permissions = True
	hook.save() if not hook.is_new() else hook.insert()
	frappe.db.commit()
	return hook.name


WEBHOOK_JSON = """{
  "name": {{ doc.name | tojson }},
  "event_type": {{ doc.event_type | tojson }},
  "idempotency_key": {{ doc.idempotency_key | tojson }},
  "occurred_at": {{ doc.occurred_at | string | tojson }},
  "party_type": {{ doc.party_type | tojson }},
  "party": {{ doc.party | tojson }},
  "channel": {{ doc.channel | tojson }},
  "external_id": {{ doc.external_id | tojson }},
  "reference_doctype": {{ doc.reference_doctype | tojson }},
  "reference_name": {{ doc.reference_name | tojson }},
  "payload": {{ (doc.payload or "null") | tojson }}
}"""
