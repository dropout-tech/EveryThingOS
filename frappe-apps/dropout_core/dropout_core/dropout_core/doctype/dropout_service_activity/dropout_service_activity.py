"""Immutable integration evidence, separate from the staff-editable native ToDo."""

import frappe
from frappe.model.document import Document


class DropOutServiceActivity(Document):
	def before_insert(self):
		from dropout_core.service_api import _receiver_insert

		# A ContextVar is deliberately used instead of doc.flags: a REST caller can
		# supply flags in a document body but cannot supply this server capability.
		if not _receiver_insert.get():
			raise frappe.PermissionError("Service activities can only be created by the Dodo receiver")

	def validate(self):
		if not self.is_new():
			raise frappe.PermissionError("Service activity evidence is immutable")

	def db_insert(self, *args, **kwargs):
		# Enforce the capability even if a document caller sets ignore_validate.
		self.before_insert()
		return super().db_insert(*args, **kwargs)

	def db_update(self, *args, **kwargs):
		raise frappe.PermissionError("Service activity evidence is immutable")

	def before_rename(self, olddn, newdn, merge=False):
		raise frappe.PermissionError("Service activity evidence cannot be renamed")

	def on_trash(self):
		raise frappe.PermissionError("Service activity evidence cannot be deleted")
