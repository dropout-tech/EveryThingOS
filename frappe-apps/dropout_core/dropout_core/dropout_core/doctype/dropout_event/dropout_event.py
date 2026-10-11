from frappe.model.document import Document
from frappe.utils import now_datetime


class DropOutEvent(Document):
	def validate(self):
		if not self.occurred_at:
			self.occurred_at = now_datetime()
