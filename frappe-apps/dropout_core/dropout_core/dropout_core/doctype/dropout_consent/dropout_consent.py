import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from dropout_core.taiwan import normalize_email


class DropOutConsent(Document):
	def validate(self):
		if self.email:
			self.email = normalize_email(self.email) or frappe.throw(_("Invalid email"))
		if self.status == "granted" and not self.granted_at:
			self.granted_at = now_datetime()
		if self.status == "withdrawn" and not self.withdrawn_at:
			self.withdrawn_at = now_datetime()
