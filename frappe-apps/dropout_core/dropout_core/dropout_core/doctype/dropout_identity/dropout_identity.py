import frappe
from frappe import _
from frappe.model.document import Document

from dropout_core.taiwan import normalize_email, normalize_phone


class DropOutIdentity(Document):
	def validate(self):
		# NULL would defeat the unique index, so a missing account is a named default.
		self.source_account = self.source_account or "default"
		if self.channel == "email":
			self.external_id = normalize_email(self.external_id) or frappe.throw(_("Invalid email"))
		elif self.channel == "phone":
			self.external_id = normalize_phone(self.external_id) or frappe.throw(_("Invalid phone number"))
		if not self.first_seen_at:
			self.first_seen_at = frappe.utils.now_datetime()


def on_doctype_update():
	frappe.db.add_unique(
		"DropOut Identity", ["channel", "source_account", "external_id"], constraint_name="unique_channel_identity"
	)
