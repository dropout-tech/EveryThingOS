"""Industry packs. A pack app only ships `pack.json`; this module turns it into
standard ERPNext records. Everything is get-or-create, so re-running is safe and
removing a pack app never deletes business data."""

import json
import os

import frappe

HANDLERS = {}


def handler(key):
	def wrap(fn):
		HANDLERS[key] = fn
		return fn

	return wrap


def load(app):
	path = frappe.get_app_path(app, "pack.json")
	with open(path, encoding="utf-8") as fh:
		return json.load(fh)


def install_from_app(app):
	"""Packs extend the trees and defaults the setup wizard creates (All Item
	Groups, the company, its price lists), so before setup they wait for
	`after_setup_wizard`. Installing a pack before or after setup both work."""
	if not frappe.is_setup_complete():
		return {"deferred": "setup wizard not complete"}
	applied = apply(load(app))
	frappe.db.commit()
	return applied


def installed_packs():
	return [app for app in frappe.get_installed_apps() if os.path.exists(frappe.get_app_path(app, "pack.json"))]


def after_setup_wizard(args=None):
	for app in installed_packs():
		apply(load(app))


def apply(pack):
	applied = {}
	for key, value in pack.items():
		if key in HANDLERS and value:
			applied[key] = HANDLERS[key](value)
	return applied


def _ensure(doctype, name, values, name_field=None):
	if frappe.db.exists(doctype, name):
		return False
	if name_field == "name":
		frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True, set_name=name)
		return True
	doc = frappe.get_doc({"doctype": doctype, **({name_field: name} if name_field else {}), **values})
	doc.insert(ignore_permissions=True)
	return True


@handler("domains")
def _domains(domains):
	available = set(frappe.get_all("Domain", pluck="name"))
	wanted = [d for d in domains if d in available]
	settings = frappe.get_single("Domain Settings")
	current = {row.domain for row in settings.active_domains}
	missing = [d for d in wanted if d not in current]
	if missing:
		settings.set_active_domains(sorted(current | set(missing)))
	return {"added": missing, "not_in_this_erpnext": [d for d in domains if d not in available]}


@handler("item_groups")
def _item_groups(groups):
	root = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}) or "All Item Groups"
	return [g for g in groups if _ensure("Item Group", g, {"parent_item_group": root, "is_group": 0}, "item_group_name")]


@handler("customer_groups")
def _customer_groups(groups):
	root = frappe.db.get_value("Customer Group", {"is_group": 1, "parent_customer_group": ["in", ["", None]]}) or "All Customer Groups"
	return [g for g in groups if _ensure("Customer Group", g, {"parent_customer_group": root, "is_group": 0}, "customer_group_name")]


@handler("uoms")
def _uoms(uoms):
	return [u for u in uoms if _ensure("UOM", u, {"must_be_whole_number": 0}, "uom_name")]


@handler("sales_stages")
def _sales_stages(stages):
	return [s for s in stages if _ensure("Sales Stage", s, {}, "stage_name")]


@handler("lead_sources")
def _lead_sources(sources):
	return [s for s in sources if _ensure("Lead Source", s, {}, "source_name")]


@handler("project_templates")
def _project_templates(templates):
	created = []
	for template in templates:
		if frappe.db.exists("Project Template", template["name"]):
			continue
		rows = []
		for idx, task in enumerate(template.get("tasks", [])):
			subject = f"{template['name']}｜{task['subject']}"
			name = frappe.db.get_value("Task", {"subject": subject, "is_template": 1})
			if not name:
				name = (
					frappe.get_doc(
						{
							"doctype": "Task",
							"subject": subject,
							"is_template": 1,
							"start": task.get("start", idx),
							"duration": task.get("duration", 1),
						}
					)
					.insert(ignore_permissions=True)
					.name
				)
			rows.append({"task": name, "subject": subject})
		frappe.get_doc({"doctype": "Project Template", "name": template["name"], "tasks": rows}).insert(ignore_permissions=True, set_name=template["name"])
		created.append(template["name"])
	return created


@handler("email_templates")
def _email_templates(templates):
	return [
		t["name"]
		for t in templates
		if _ensure("Email Template", t["name"], {"subject": t["subject"], "response": t["response"], "use_html": 1}, "name")
	]


@handler("course_boms")
def _course_boms(boms):
	"""Course Product Bundles: non-stock parent course Item + stock material Items."""
	fallback_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "Products"
	created = []
	for bom in boms:
		code = bom["course_code"]
		course_group = bom.get("item_group") if frappe.db.exists("Item Group", bom.get("item_group")) else fallback_group
		course_uom = bom.get("uom") if frappe.db.exists("UOM", bom.get("uom")) else "Nos"
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": bom.get("course_name") or code,
					"item_group": course_group,
					"stock_uom": course_uom,
					"is_stock_item": 0,
					"is_sales_item": 1,
				}
			).insert(ignore_permissions=True)
		items = []
		for mat in bom.get("materials", []):
			mcode = mat["item_code"]
			mgroup = mat.get("item_group") if frappe.db.exists("Item Group", mat.get("item_group")) else fallback_group
			muom = mat.get("uom") if frappe.db.exists("UOM", mat.get("uom")) else "Nos"
			if not frappe.db.exists("Item", mcode):
				frappe.get_doc(
					{
						"doctype": "Item",
						"item_code": mcode,
						"item_name": mat.get("item_name") or mcode,
						"item_group": mgroup,
						"stock_uom": muom,
						"is_stock_item": 1,
						"is_sales_item": 0,
						"is_purchase_item": 1,
					}
				).insert(ignore_permissions=True)
			items.append({"item_code": mcode, "qty": mat.get("qty", 1), "uom": muom, "description": mat.get("item_name") or mcode})
		if items and not frappe.db.exists("Product Bundle", code):
			frappe.get_doc({"doctype": "Product Bundle", "new_item_code": code, "description": bom.get("course_name") or code, "items": items}).insert(ignore_permissions=True)
			created.append(code)
	return created


@handler("webshop")
def _webshop(settings):
	if "webshop" not in frappe.get_installed_apps():
		return "skipped: webshop not installed"
	doc = frappe.get_single("Webshop Settings")
	company = frappe.defaults.get_global_default("company")
	price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
	for key, value in settings.items():
		if value == "{company}":
			value = company
		elif value == "{selling_price_list}":
			value = price_list
		if doc.meta.has_field(key) and value is not None:
			doc.set(key, value)
	if not (doc.company and doc.price_list):
		doc.enabled = 0
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	doc.save()
	return {"enabled": doc.enabled}


def pack_dir(app):
	return os.path.dirname(frappe.get_app_path(app, "pack.json"))
