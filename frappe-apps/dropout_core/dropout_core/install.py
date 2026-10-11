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
	"Quotation": [
		{
			"fieldname": "dropout_acceptance_section",
			"fieldtype": "Section Break",
			"label": "客人線上接受",
			"insert_after": "terms",
			"collapsible": 1,
			"depends_on": "dropout_accepted_at",
		},
		{
			"fieldname": "dropout_accepted_by",
			"fieldtype": "Data",
			"label": "接受人（客人輸入的全名）",
			"insert_after": "dropout_acceptance_section",
			"read_only": 1,
			"allow_on_submit": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "dropout_accepted_at",
			"fieldtype": "Datetime",
			"label": "接受時間",
			"insert_after": "dropout_accepted_by",
			"read_only": 1,
			"allow_on_submit": 1,
			"no_copy": 1,
			"in_standard_filter": 1,
		},
		{
			"fieldname": "dropout_signature",
			"fieldtype": "Attach Image",
			"label": "手寫簽名",
			"insert_after": "dropout_accepted_at",
			"read_only": 1,
			"allow_on_submit": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "dropout_acceptance_link",
			"fieldtype": "Data",
			"label": "分享連結編號",
			"insert_after": "dropout_signature",
			"read_only": 1,
			"allow_on_submit": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "dropout_acceptance_ip",
			"fieldtype": "Data",
			"label": "網路位址雜湊",
			"insert_after": "dropout_acceptance_link",
			"read_only": 1,
			"allow_on_submit": 1,
			"no_copy": 1,
		},
		{
			"fieldname": "dropout_discount_percent",
			"fieldtype": "Percent",
			"label": "總折扣（%）",
			"insert_after": "discount_amount",
			"read_only": 1,
			"no_copy": 1,
			"print_hide": 1,
			"description": "品項折扣加整張折扣，對照價目表的總價。大折扣核准用。",
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
	"User": [
		{
			"fieldname": "dropout_chatwoot_user_id",
			"fieldtype": "Data",
			"label": "Chatwoot 使用者 ID",
			"insert_after": "username",
			"read_only": 1,
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

	from dropout_core.team import ensure_role_profiles

	ensure_role_profiles()
	frappe.db.commit()
	_ensure_expense_types()


def _ensure_expense_types():
	"""報帳分類 need a company and its chart of accounts; a fresh site gets them on a later migrate."""
	from dropout_core.approvals import ensure_expense_types

	try:
		ensure_expense_types()
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title="DropOut 報帳分類")


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
