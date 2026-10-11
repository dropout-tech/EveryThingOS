app_name = "dropout_core"
app_title = "DropOut Core"
app_publisher = "DropOut Tech"
app_description = "DropOut OS kernel for ERPNext"
app_email = "info@dropout.tw"
app_license = "mit"

required_apps = ["erpnext"]

after_install = "dropout_core.install.after_install"
after_migrate = "dropout_core.install.after_migrate"
setup_wizard_complete = "dropout_core.packs.after_setup_wizard"

doc_events = {
	"Customer": {"validate": "dropout_core.events.validate_customer_tax_id"},
	"Quotation": {"on_submit": "dropout_core.events.on_quotation_submit"},
	"Sales Order": {"on_submit": "dropout_core.events.on_sales_order_submit"},
	"Delivery Note": {"on_submit": "dropout_core.events.on_delivery_note_submit"},
	"Sales Invoice": {"on_submit": "dropout_core.events.on_sales_invoice_submit"},
	"Payment Entry": {"on_submit": "dropout_core.events.on_payment_entry_submit"},
}
