"""This site's EveryThingOS contract status, pushed by the glue.

While the contract is read-only, suspended or cancelled, staff can still read
and export, but cannot create, change, submit, cancel or delete business
documents — in Desk as well as in the shell. Framework doctypes stay open so
people can still sign in, be managed and download backups.

Trust boundary: the company's own System Managers are trusted inside their
site. They cannot clear the lock from the form, but someone who grants
themselves the integration role can; this is a contract notice, not DRM.
"""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

INTEGRATION = "DropOut Integration"
SETTINGS = "DropOut Settings"
FIELDS = ("account_locked", "account_stage", "account_message", "account_ends", "account_updated")
OPEN_MODULES = frozenset({"Core", "Desk", "Email", "Integrations", "Automation", "Printing", "Custom"})


def _privileged(user=None):
	user = user or frappe.session.user
	return user == "Administrator" or INTEGRATION in frappe.get_roles(user)


def status():
	s = frappe.get_cached_doc(SETTINGS)
	return {
		"locked": bool(s.get("account_locked")),
		"stage": s.get("account_stage") or "",
		"message": s.get("account_message") or "",
		"ends": str(s.get("account_ends") or "") or None,
	}


@frappe.whitelist(methods=["POST"])
def set_status(stage, locked=0, message="", ends=None):
	"""Called by the glue (integration user) on every contract change and once a day."""
	if not _privileged():
		raise frappe.PermissionError
	s = frappe.get_single(SETTINGS)
	s.account_stage = (stage or "")[:40]
	s.account_locked = 1 if cint(locked) else 0
	s.account_message = (message or "")[:500]
	s.account_ends = ends or None
	s.account_updated = now_datetime()
	s.flags.ignore_permissions = True
	s.save()
	frappe.db.commit()
	return status()


def guard(doc, method=None):
	"""doc_events "*": refuse business writes while the contract is locked."""
	if frappe.flags.in_install or frappe.flags.in_migrate or frappe.flags.in_patch:
		return
	if doc.doctype == SETTINGS or doc.meta.istable or doc.meta.module in OPEN_MODULES:
		return
	# Saving a User keeps that person's own Contact in step; customer contacts stay locked.
	if doc.doctype == "Contact" and doc.get("user"):
		return
	if not frappe.get_cached_doc(SETTINGS).get("account_locked") or _privileged():
		return
	message = frappe.get_cached_doc(SETTINGS).get("account_message") or _("這家公司的 EveryThingOS 合約目前只能看，不能新增或修改。")
	frappe.throw(message, frappe.PermissionError, title=_("只能看"))


def keep_account_fields(doc):
	"""Only the glue changes the contract fields; a System Manager saving the form keeps them."""
	if _privileged() or doc.is_new():
		return
	before = doc.get_doc_before_save()
	if before:
		for field in FIELDS:
			doc.set(field, before.get(field))


def boot_session(bootinfo):
	if frappe.session.user != "Guest":
		bootinfo.dropout_account = status()
