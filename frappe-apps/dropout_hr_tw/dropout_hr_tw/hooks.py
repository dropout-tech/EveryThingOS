app_name = "dropout_hr_tw"
app_title = "DropOut HR TW"
app_publisher = "DropOut Tech"
app_description = "Taiwan payroll and leave setup for Frappe HRMS"
app_email = "info@dropout.tw"
app_license = "mit"

required_apps = ["erpnext", "hrms", "dropout_core"]

after_install = "dropout_hr_tw.install.after_install"
after_migrate = "dropout_hr_tw.install.after_migrate"
setup_wizard_complete = "dropout_hr_tw.install.after_setup_wizard"

dropout_profile_notes = {"人資": "員工資料、請假核准、打卡、薪資"}

doc_events = {
	"Salary Slip": {
		"before_validate": "dropout_hr_tw.payroll.fill_slip",
		"on_submit": "dropout_hr_tw.payroll.post_employer_journal",
		"on_cancel": "dropout_hr_tw.payroll.cancel_employer_journal",
	},
}

scheduler_events = {
	"daily": [
		"dropout_hr_tw.annual_leave.allocate_due",
		"dropout_hr_tw.annual_leave.settle_due",
	],
}
