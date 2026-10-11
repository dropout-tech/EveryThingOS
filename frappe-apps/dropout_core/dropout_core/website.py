"""官網商品目錄: publish ERPNext Items through Webshop's own Website Item, so the
catalog is the same record set as stock and pricing."""

import frappe


@frappe.whitelist(methods=["POST"])
def publish_items(item_group=None, limit=500):
	frappe.only_for(("System Manager", "Website Manager", "DropOut Integration"))
	if "webshop" not in frappe.get_installed_apps():
		return {"published": [], "skipped": "webshop not installed"}
	from webshop.webshop.doctype.website_item.website_item import make_website_item

	filters = {"is_sales_item": 1, "disabled": 0, "has_variants": 0}
	if item_group:
		filters["item_group"] = item_group
	published = []
	for code in frappe.get_all("Item", filters=filters, pluck="name", limit=int(limit)):
		if frappe.db.exists("Website Item", {"item_code": code}):
			continue
		make_website_item(frappe.get_doc("Item", code).as_dict(), save=True)
		published.append(code)
	return {"published": published}
