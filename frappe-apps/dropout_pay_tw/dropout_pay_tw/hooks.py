app_name = "dropout_pay_tw"
app_title = "DropOut Pay TW"
app_publisher = "DropOut Tech"
app_description = "ECPay and NewebPay gateways for Frappe Payments"
app_email = "info@dropout.tw"
app_license = "mit"

required_apps = ["erpnext", "payments", "dropout_core"]

after_install = "dropout_pay_tw.install.after_install"
