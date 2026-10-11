"""ShopProfile (from the shell's onboarding: scene, size, modules) -> what to install.

The shell is the single place a company describes itself; this file is the only
mapping from that description to ERPNext apps, so adding a pack is one line here."""

PACK_FOR_SCENE = {
	"make": "dropout_pack_make",
	"build": "dropout_pack_make",
	"farm": "dropout_pack_make",
	"retail": "dropout_pack_make",
	"food": "dropout_pack_make",
	"move": "dropout_pack_make",
	"service": "dropout_pack_service",
	"care": "dropout_pack_service",
	"stay": "dropout_pack_service",
	"other": "dropout_pack_service",
	"edu": "dropout_pack_edu",
}

LEGACY_MODULES = {"reply": "chat", "funnel": "letter"}

BASE_APPS = ["erpnext", "dropout_core"]


def normalize_modules(modules):
	return sorted({LEGACY_MODULES.get(m, m) for m in modules or []})


def plan(profile):
	scene = profile.get("scene", "other")
	modules = normalize_modules(profile.get("modules"))
	website = "website" in modules
	hr = "hr" in modules
	apps = list(BASE_APPS)
	if website:
		apps[1:1] = ["payments", "webshop"]
		apps.append("dropout_pay_tw")
	if hr:
		apps.insert(apps.index("dropout_core"), "hrms")
		apps.append("dropout_hr_tw")
	apps.append(PACK_FOR_SCENE.get(scene, "dropout_pack_service"))
	return {
		"scene": scene,
		"size": profile.get("size", "small"),
		"modules": modules,
		"apps": apps,
		"pack": PACK_FOR_SCENE.get(scene, "dropout_pack_service"),
		"website": website,
		"hr": hr,
		"chat": "chat" in modules,
		"letter": "letter" in modules,
		"meetings": "meetings" in modules,
		"import_order": IMPORT_ORDER,
	}


IMPORT_ORDER = [
	{"step": 1, "kind": "company", "label": "公司與科目表", "how": "provision（設定精靈）；科目要換用 Chart of Accounts Importer"},
	{"step": 2, "kind": "customers", "label": "客人", "how": "convert → check → import（ERPNext Data Import，Customer）"},
	{"step": 2, "kind": "suppliers", "label": "供應商", "how": "convert → check → import（ERPNext Data Import，Supplier）"},
	{"step": 3, "kind": "items", "label": "商品與售價", "how": "convert → check → import（ERPNext Data Import，Item）"},
	{"step": 4, "kind": "opening_stock", "label": "期初庫存", "how": "convert → check → import（ERPNext Stock Reconciliation，用途 Opening Stock）"},
	{"step": 5, "kind": "opening_invoices", "label": "期初應收應付", "how": "opening-balances（ERPNext Opening Invoice Creation Tool）"},
	{"step": 6, "kind": "open_orders", "label": "未結訂單", "how": "Data Import：Sales Order／Purchase Order"},
	{"step": 7, "kind": "identities", "label": "LINE／IG／FB 身分", "how": "接 Chatwoot 後自動建立；不從舊系統匯入"},
	{"step": 8, "kind": "subscribers", "label": "電子報名單", "how": "只匯入有同意紀錄的人；其餘寄確認信重新取得"},
]
