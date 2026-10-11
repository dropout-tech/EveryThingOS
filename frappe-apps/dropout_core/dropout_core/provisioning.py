"""Called by the onboarding toolkit through `bench --site <site> execute`.
Each function is safe to run again."""

import frappe


def complete_setup(company_name, company_abbr, country="Taiwan", currency="TWD", timezone="Asia/Taipei", language="zh-TW", fy_start_date=None, fy_end_date=None, admin_email=None):
	if frappe.is_setup_complete():
		return {"status": "already_complete", "company": frappe.defaults.get_global_default("company")}
	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	year = frappe.utils.getdate().year
	args = {
		"language": language if frappe.db.exists("Language", language) else "English",
		"country": country,
		"timezone": timezone,
		"currency": currency,
		"full_name": "Administrator",
		"email": admin_email or "admin@example.com",
		"company_name": company_name,
		"company_abbr": company_abbr,
		"chart_of_accounts": "Standard",
		"fy_start_date": fy_start_date or f"{year}-01-01",
		"fy_end_date": fy_end_date or f"{year}-12-31",
		"setup_demo": 0,
	}
	result = setup_complete(args)
	return {"status": result.get("status") if isinstance(result, dict) else "ok", "company": company_name}


def create_integration_user(email=None):
	"""The glue authenticates as this user. Re-running rotates the secret."""
	from frappe.core.doctype.user.user import generate_keys

	email = email or f"glue@{frappe.local.site}"
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": "DropOut Glue", "send_welcome_email": 0, "user_type": "System User"}).insert(ignore_permissions=True)
	user = frappe.get_doc("User", email)
	user.add_roles("DropOut Integration", "Sales User", "Accounts User", "Accounts Manager")
	secret = generate_keys(email)["api_secret"]
	frappe.db.commit()
	return {"user": email, "api_key": frappe.db.get_value("User", email, "api_key"), "api_secret": secret}


SHELL_CLIENT = "DropOut OS"


def create_oauth_client(redirect_uri, app_name=SHELL_CLIENT):
	"""Register the DropOut OS shell with Frappe's own OAuth provider. Staff log in
	with their ERPNext user, so ERPNext roles decide what the shell may show."""
	name = frappe.db.get_value("OAuth Client", {"app_name": app_name})
	doc = frappe.get_doc("OAuth Client", name) if name else frappe.new_doc("OAuth Client")
	uris = set(filter(None, (doc.redirect_uris or "").split()))
	uris.add(redirect_uri)
	doc.update(
		{
			"app_name": app_name,
			"scopes": "all openid",
			"redirect_uris": "\n".join(sorted(uris)),
			"default_redirect_uri": doc.default_redirect_uri or redirect_uri,
			"grant_type": "Authorization Code",
			"response_type": "Code",
			"skip_authorization": 1,
		}
	)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"client_id": doc.client_id, "client_secret": doc.client_secret, "redirect_uris": doc.redirect_uris.split()}


def link_chatwoot_user(email, chatwoot_user_id):
	"""The shell opens Chatwoot through Platform API SSO for this user."""
	if not frappe.db.exists("User", email):
		return {"linked": False, "reason": "no such user"}
	frappe.db.set_value("User", email, "dropout_chatwoot_user_id", str(chatwoot_user_id))
	frappe.db.commit()
	return {"linked": True}


def data_import(doctype, file_path, import_type="Insert", submit_after_import=0):
	"""Run a file through Frappe's Data Import document, the same path as the UI.

	`bench data-import` (console mode) matches earlier logs by an empty
	data_import name and skips rows it thinks were done, so we keep a real
	Data Import record instead; staff can also open it to see per-row errors.
	"""
	import os

	from frappe.core.doctype.data_import.data_import import start_import

	with open(file_path, "rb") as fh:
		content = fh.read()
	file = frappe.get_doc({"doctype": "File", "file_name": os.path.basename(file_path), "content": content, "is_private": 1}).insert(ignore_permissions=True)
	di = frappe.get_doc(
		{
			"doctype": "Data Import",
			"reference_doctype": doctype,
			"import_type": "Insert New Records" if import_type == "Insert" else "Update Existing Records",
			"import_file": file.file_url,
			"submit_after_import": int(submit_after_import),
			"mute_emails": 1,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	start_import(di.name)
	di.reload()
	logs = frappe.get_all("Data Import Log", filters={"data_import": di.name}, fields=["success", "row_indexes", "messages", "exception"])
	failed = [{"rows": frappe.parse_json(log.row_indexes), "messages": _messages(log)} for log in logs if not log.success]
	return {"data_import": di.name, "status": di.status, "imported": sum(1 for log in logs if log.success), "failed": failed}


def _messages(log):
	messages = []
	for m in frappe.parse_json(log.messages or "[]") or []:
		if isinstance(m, str):
			m = frappe.parse_json(m) if m.startswith("{") else {"message": m}
		text = m.get("message") if isinstance(m, dict) else str(m)
		if text:
			messages.append(frappe.utils.strip_html(str(text)))
	if not messages and log.exception:
		messages.append(log.exception.strip().splitlines()[-1])
	return messages


def opening_stock(file_path):
	"""Submit ERPNext Opening Stock reconciliations from a converted file.

	Stock Reconciliation ships with Allow Import off, so this builds the same
	document the Stock Reconciliation form would. One document per company and
	posting date; the file hash in dropout_import_key makes a re-run a no-op.
	"""
	import csv
	import hashlib

	with open(file_path, "rb") as fh:
		raw = fh.read()
	key = hashlib.sha256(raw).hexdigest()[:16]
	existing = frappe.get_all("Stock Reconciliation", filters={"dropout_import_key": key, "docstatus": 1}, pluck="name")
	if existing:
		return {"status": "already_done", "documents": existing}

	groups = {}
	company = posting_date = None
	for row in csv.DictReader(raw.decode("utf-8-sig").splitlines()):
		# Data Import layout: parent columns are filled on the first row of each document only.
		company = row.get("company") or company
		posting_date = row.get("posting_date") or posting_date or frappe.utils.nowdate()
		groups.setdefault((company, posting_date), []).append(row)

	names = []
	for (company, posting_date), rows in groups.items():
		doc = frappe.get_doc(
			{
				"doctype": "Stock Reconciliation",
				"company": company,
				"purpose": "Opening Stock",
				"posting_date": posting_date,
				"set_posting_time": 1,
				"expense_account": frappe.db.get_value("Account", {"company": company, "account_type": "Temporary", "is_group": 0}),
				"dropout_import_key": key,
				"items": [
					{
						"item_code": r["items.item_code"],
						"warehouse": r["items.warehouse"],
						"qty": frappe.utils.flt(r["items.qty"]),
						"valuation_rate": frappe.utils.flt(r.get("items.valuation_rate")),
					}
					for r in rows
				],
			}
		)
		doc.insert()
		doc.submit()
		names.append(doc.name)
	frappe.db.commit()
	return {"status": "submitted", "documents": names}


def make_opening_invoices(company, rows, invoice_type="Sales"):
	"""Drive ERPNext's own Opening Invoice Creation Tool instead of writing invoices by hand."""
	tool = frappe.get_single("Opening Invoice Creation Tool")
	tool.company = company
	tool.invoice_type = invoice_type
	tool.create_missing_party = 0
	tool.set("invoices", [])
	for row in rows:
		tool.append("invoices", {"party_type": "Customer" if invoice_type == "Sales" else "Supplier", **row})
	tool.save()
	return tool.make_invoices()
