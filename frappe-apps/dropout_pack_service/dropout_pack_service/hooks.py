app_name = "dropout_pack_service"
app_title = "DropOut Pack Service"
app_publisher = "DropOut Tech"
app_description = "DropOut OS industry pack: 顧問業"
app_email = "info@dropout.tw"
app_license = "mit"

required_apps = ["erpnext", "dropout_core"]

after_install = "dropout_pack_service.install.after_install"
after_migrate = "dropout_pack_service.install.after_install"
