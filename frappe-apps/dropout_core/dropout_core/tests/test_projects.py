import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, get_datetime, nowdate

from dropout_core import projects
from dropout_core.tests.test_dropout_flow import company, make_customer
from dropout_core.tests.test_reports import make_user


def make_activity(name="DO 顧問", billing=2000, costing=800):
	if not frappe.db.exists("Activity Type", name):
		frappe.get_doc({"doctype": "Activity Type", "activity_type": name, "billing_rate": billing, "costing_rate": costing}).insert()
	return name


def make_service_item(code="DO-SERVICE-HOUR"):
	if not frappe.db.exists("Item", code):
		group = frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name", limit=1)[0]
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": group, "stock_uom": "Nos", "is_stock_item": 0, "is_sales_item": 1}).insert()
	return code


def make_project(name=None, customer="專案客人", status="Open"):
	doc = frappe.get_doc(
		{
			"doctype": "Project",
			"project_name": name or f"DO 專案 {frappe.generate_hash(length=6)}",
			"company": company(),
			"customer": make_customer(customer) if customer else None,
			"status": status,
		}
	).insert()
	return doc.name


def detail_of(result):
	return frappe.get_doc("Timesheet", result["created"]["name"]).time_logs[0]


class TestLogTime(FrappeTestCase):
	def setUp(self):
		self.activity = make_activity()
		self.project = make_project()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_creates_a_submitted_billable_timesheet(self):
		day = add_days(nowdate(), -1)
		result = projects.log_time(self.project, 1.5, date=day, activity_type=self.activity, note="訪談")
		self.assertTrue(result["ok"])
		sheet = frappe.get_doc("Timesheet", result["created"]["name"])
		self.assertEqual(sheet.docstatus, 1)
		self.assertEqual(sheet.parent_project, self.project)
		row = sheet.time_logs[0]
		self.assertEqual(flt(row.hours), 1.5)
		self.assertEqual(row.project, self.project)
		self.assertEqual(row.is_billable, 1)
		self.assertEqual(row.description, "訪談")
		self.assertAlmostEqual(flt(row.billing_amount), 3000)
		self.assertAlmostEqual(flt(row.costing_amount), 1200)
		self.assertEqual(result["created"]["href"], f"/app/timesheet/{sheet.name}")

	def test_second_log_starts_where_the_first_ended(self):
		day = add_days(nowdate(), -2)
		first = detail_of(projects.log_time(self.project, 2, date=day, activity_type=self.activity))
		second = detail_of(projects.log_time(self.project, 1, date=day, activity_type=self.activity))
		self.assertEqual(get_datetime(second.from_time), get_datetime(first.to_time))

	def test_not_billable(self):
		row = detail_of(projects.log_time(self.project, 1, date=add_days(nowdate(), -3), activity_type=self.activity, billable=0))
		self.assertEqual(row.is_billable, 0)
		self.assertEqual(flt(row.billing_amount), 0)

	def test_rejects_bad_hours(self):
		for bad in (0, -1, 0.3, 12.25, "abc", None):
			with self.assertRaises(frappe.ValidationError, msg=bad):
				projects.log_time(self.project, bad, activity_type=self.activity)

	def test_rejects_future_and_old_dates(self):
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(self.project, 1, date=add_days(nowdate(), 1), activity_type=self.activity)
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(self.project, 1, date=add_days(nowdate(), -61), activity_type=self.activity)

	def test_day_cap(self):
		day = add_days(nowdate(), -4)
		projects.log_time(self.project, 12, date=day, activity_type=self.activity)
		projects.log_time(self.project, 4, date=day, activity_type=self.activity)
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(self.project, 0.25, date=day, activity_type=self.activity)

	def test_task_must_belong_to_the_project(self):
		other = make_project()
		task = frappe.get_doc({"doctype": "Task", "subject": "別案的工作", "project": other}).insert().name
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(self.project, 1, task=task, activity_type=self.activity)
		own = frappe.get_doc({"doctype": "Task", "subject": "這案的工作", "project": self.project}).insert().name
		row = detail_of(projects.log_time(self.project, 1, date=add_days(nowdate(), -5), task=own, activity_type=self.activity))
		self.assertEqual(row.task, own)

	def test_closed_project_is_refused(self):
		closed = make_project(status="Completed")
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(closed, 1, activity_type=self.activity)

	def test_unknown_project_and_activity(self):
		with self.assertRaises(frappe.ValidationError):
			projects.log_time("PROJ-DOES-NOT-EXIST", 1)
		with self.assertRaises(frappe.ValidationError):
			projects.log_time(self.project, 1, activity_type="沒有這種工作")

	def test_user_without_project_access(self):
		frappe.set_user(make_user("projects-nobody@example.com", "Stock User"))
		with self.assertRaises(frappe.PermissionError):
			projects.log_time(self.project, 1)


class TestMakeInvoice(FrappeTestCase):
	def setUp(self):
		self.activity = make_activity()
		self.item = make_service_item()
		self.project = make_project()

	def tearDown(self):
		frappe.set_user("Administrator")

	def log(self, hours, days_ago):
		return detail_of(projects.log_time(self.project, hours, date=add_days(nowdate(), -days_ago), activity_type=self.activity)).name

	def test_bills_only_the_picked_logs(self):
		picked = self.log(2, 6)
		left = self.log(1, 7)
		result = projects.make_invoice(self.project, [picked], item_code=self.item)
		self.assertTrue(result["ok"], result)
		si = frappe.get_doc("Sales Invoice", result["created"]["name"])
		self.assertEqual(si.docstatus, 0)
		self.assertEqual(si.project, self.project)
		self.assertEqual(si.customer, frappe.db.get_value("Project", self.project, "customer"))
		self.assertEqual([r.timesheet_detail for r in si.timesheets], [picked])
		self.assertEqual(len(si.items), 1)
		self.assertEqual(si.items[0].item_code, self.item)
		self.assertAlmostEqual(flt(si.items[0].qty), 2)
		self.assertAlmostEqual(flt(si.items[0].rate), 2000)
		self.assertAlmostEqual(flt(si.total_billing_hours), 2)
		self.assertAlmostEqual(flt(si.net_total), 4000)
		self.assertEqual(result["hours"], 2)

		with self.assertRaises(frappe.ValidationError):
			projects.make_invoice(self.project, [picked], item_code=self.item)
		again = projects.make_invoice(self.project, [left], item_code=self.item)
		self.assertTrue(again["ok"], again)

	def test_submitted_invoice_marks_logs_billed(self):
		picked = self.log(3, 8)
		result = projects.make_invoice(self.project, [picked], item_code=self.item)
		si = frappe.get_doc("Sales Invoice", result["created"]["name"])
		si.submit()
		self.assertEqual(frappe.db.get_value("Timesheet Detail", picked, "sales_invoice"), si.name)
		with self.assertRaises(frappe.ValidationError):
			projects.make_invoice(self.project, [picked], item_code=self.item)

	def test_logs_from_another_project_are_refused(self):
		other = make_project()
		foreign = detail_of(projects.log_time(other, 1, date=add_days(nowdate(), -9), activity_type=self.activity)).name
		with self.assertRaises(frappe.ValidationError):
			projects.make_invoice(self.project, [foreign], item_code=self.item)

	def test_bad_input(self):
		for bad in ([], "not json", [1, 2], None):
			with self.assertRaises(frappe.ValidationError, msg=bad):
				projects.make_invoice(self.project, bad, item_code=self.item)

	def test_project_needs_a_customer(self):
		bare = make_project(customer=None)
		with self.assertRaises(frappe.ValidationError):
			projects.make_invoice(bare, ["x"], item_code=self.item)

	def test_stock_item_is_refused(self):
		picked = self.log(1, 10)
		from dropout_core.tests.test_dropout_flow import leaf

		code = f"DO-STOCK-{frappe.generate_hash(length=6)}"
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": leaf("Item Group"), "stock_uom": "Nos", "is_stock_item": 1}).insert()
		with self.assertRaises(frappe.ValidationError):
			projects.make_invoice(self.project, [picked], item_code=code)

	def test_projects_user_cannot_invoice(self):
		picked = self.log(1, 11)
		frappe.set_user(make_user("projects-user@example.com", "Projects User"))
		with self.assertRaises(frappe.PermissionError):
			projects.make_invoice(self.project, [picked], item_code=self.item)
