from frappe.model.document import Document

from dropout_core.account import keep_account_fields


class DropOutSettings(Document):
	def validate(self):
		keep_account_fields(self)
