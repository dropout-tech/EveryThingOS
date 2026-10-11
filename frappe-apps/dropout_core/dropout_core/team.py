"""People and permissions for the shell's 團隊 page.

Everything maps onto Frappe's own objects: a job is a Role Profile, a person is
a User, two-step login is System Settings plus the role flag Frappe already
checks, and the history comes from Activity Log and Version. Nothing here adds
a second permission system next to ERPNext's.
"""

import re

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, add_days, getdate, strip_html, validate_email_address

ADMIN = "System Manager"
INTEGRATION = "DropOut Integration"

# (name, what the person does, roles). Roles that a site does not have (e.g. no
# manufacturing module) are skipped, so the same list works for every pack.
PROFILES = (
	("老闆", "全部都能看、能做，也能管人和安全設定", (
		ADMIN, "Accounts Manager", "Accounts User", "Sales Manager", "Sales User", "Purchase Manager", "Purchase User",
		"Stock Manager", "Stock User", "Item Manager", "Newsletter Manager", "Website Manager", "Report Manager",
		"DropOut Marketing", "Projects User", "Manufacturing Manager", "Manufacturing User", "Support Team",
	)),
	("主管", "全部都能看、能做，但不能管人和安全設定", (
		"Accounts Manager", "Accounts User", "Sales Manager", "Sales User", "Purchase Manager", "Purchase User",
		"Stock Manager", "Stock User", "Item Manager", "Newsletter Manager", "Website Manager", "Report Manager",
		"DropOut Marketing", "Projects User", "Manufacturing Manager", "Manufacturing User", "Support Team",
	)),
	("業務", "客人、報價、訂單", ("Sales User", "Projects User")),
	("倉管", "庫存、出貨、收貨", ("Stock User", "Item Manager", "Manufacturing User")),
	("採購", "請購、採購單、廠商", ("Purchase User",)),
	("會計", "發票、收付款、帳務", ("Accounts User", "Accounts Manager")),
	("客服", "對話、客人資料", ("Sales User", "Support Team")),
	("行銷", "電子報、名單、官網", ("Newsletter Manager", "DropOut Marketing", "Website Manager", "Sales User")),
)
PROFILE_NOTES = {name: note for name, note, _roles in PROFILES}

SECURITY_FIELDS = (
	"enable_two_factor_auth",
	"two_factor_method",
	"enable_password_policy",
	"minimum_password_score",
	"session_expiry",
	"allow_consecutive_login_attempts",
	"allow_login_after_fail",
	"deny_multiple_sessions",
)


def _require_admin():
	# frappe.only_for is skipped while tests run; this check is not.
	if frappe.session.user != "Administrator" and ADMIN not in frappe.get_roles():
		raise frappe.PermissionError(_("只有老闆（System Manager）可以管人和安全設定"))


def ensure_role_profiles():
	"""Create the job profiles that are missing. Existing profiles are left as the
	company edited them; only missing ones are created."""
	existing_roles = set(frappe.get_all("Role", pluck="name"))
	for name, _note, roles in PROFILES:
		if frappe.db.exists("Role Profile", name):
			continue
		doc = frappe.new_doc("Role Profile")
		doc.role_profile = name
		for role in roles:
			if role in existing_roles:
				doc.append("roles", {"role": role})
		doc.insert(ignore_permissions=True)


def _integration_users():
	return set(frappe.get_all("Has Role", filters={"role": INTEGRATION, "parenttype": "User"}, pluck="parent"))


def _staff_filters():
	return {"user_type": "System User", "name": ("not in", ["Administrator", "Guest", *_integration_users()])}


def _admins(exclude=None):
	users = frappe.get_all("Has Role", filters={"role": ADMIN, "parenttype": "User"}, pluck="parent")
	enabled = frappe.get_all("User", filters={"name": ("in", users or [""]), "enabled": 1}, pluck="name")
	return [u for u in enabled if u not in ("Administrator", exclude) and u not in _integration_users()]


def _profiles():
	# Other DropOut apps describe the profiles they add with the `dropout_profile_notes` hook.
	notes = {name: values[-1] for name, values in frappe.get_hooks("dropout_profile_notes", default={}).items()}
	notes.update(PROFILE_NOTES)
	rows = []
	for name in frappe.get_all("Role Profile", pluck="name", order_by="creation asc"):
		roles = frappe.get_all("Has Role", filters={"parenttype": "Role Profile", "parent": name}, pluck="role")
		rows.append({"name": name, "note": notes.get(name, ""), "roles": sorted(roles), "admin": ADMIN in roles})
	order = {name: i for i, (name, _n, _r) in enumerate(PROFILES)}
	return sorted(rows, key=lambda r: order.get(r["name"], len(order)))


def _security():
	values = frappe.db.get_singles_dict("System Settings")
	out = {f: values.get(f) for f in SECURITY_FIELDS}
	out["enable_two_factor_auth"] = cint(out["enable_two_factor_auth"])
	out["two_factor_for_everyone"] = cint(frappe.db.get_value("Role", "All", "two_factor_auth"))
	out["enable_password_policy"] = cint(out["enable_password_policy"])
	out["deny_multiple_sessions"] = cint(out["deny_multiple_sessions"])
	return out


@frappe.whitelist()
def team():
	_require_admin()
	users = frappe.get_all(
		"User",
		filters=_staff_filters(),
		fields=["name", "full_name", "enabled", "role_profile_name", "last_login", "last_active", "creation"],
		order_by="enabled desc, full_name asc",
	)
	admins = set(_admins())
	rows = [
		{
			"email": u.name,
			"full_name": u.full_name or u.name,
			"enabled": cint(u.enabled),
			"profile": u.role_profile_name,
			"admin": u.name in admins,
			"last_login": str(u.last_login) if u.last_login else None,
			"last_active": str(u.last_active) if u.last_active else None,
			"href": f"/app/user/{u.name}",
		}
		for u in users
	]
	return {"users": rows, "profiles": _profiles(), "me": frappe.session.user, "security": _security(), "active": sum(r["enabled"] for r in rows)}


def _guard_admin_change(user, losing_admin):
	if user == frappe.session.user and losing_admin:
		frappe.throw(_("不能拿掉自己的管理權限；請另一位老闆來改"))
	if losing_admin and not _admins(exclude=user):
		frappe.throw(_("公司至少要留一位能管人的人（老闆）"))


def _profile_is_admin(profile):
	return bool(profile) and frappe.db.exists("Has Role", {"parenttype": "Role Profile", "parent": profile, "role": ADMIN})


@frappe.whitelist(methods=["POST"])
def invite(email, full_name, profile, send_welcome=1):
	_require_admin()
	email = (email or "").strip().lower()
	if not validate_email_address(email):
		frappe.throw(_("Email 格式不對"))
	if not frappe.db.exists("Role Profile", profile):
		frappe.throw(_("沒有「{0}」這個職務").format(profile))
	if frappe.db.exists("User", email):
		frappe.throw(_("{0} 已經有帳號了，直接改他的職務就好").format(email))
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": strip_html(full_name or email.split("@")[0]),
			"user_type": "System User",
			"role_profile_name": profile,
			"send_welcome_email": cint(send_welcome),
		}
	)
	doc.insert()
	return {"ok": True, "user": {"email": doc.name, "full_name": doc.full_name, "profile": profile}, "message": _("已邀請 {0}，對方會收到設定密碼的信").format(doc.full_name)}


@frappe.whitelist(methods=["POST"])
def set_profile(user, profile):
	_require_admin()
	if user in _integration_users() or user in ("Administrator", "Guest"):
		frappe.throw(_("這個帳號不能改"))
	if not frappe.db.exists("Role Profile", profile):
		frappe.throw(_("沒有「{0}」這個職務").format(profile))
	doc = frappe.get_doc("User", user, for_update=True)
	was_admin = ADMIN in frappe.get_roles(user)
	_guard_admin_change(user, was_admin and not _profile_is_admin(profile))
	doc.role_profile_name = profile
	doc.save()
	return {"ok": True, "message": _("{0} 改成「{1}」").format(doc.full_name, profile)}


@frappe.whitelist(methods=["POST"])
def set_enabled(user, enabled):
	_require_admin()
	enabled = cint(enabled)
	if user in _integration_users() or user in ("Administrator", "Guest"):
		frappe.throw(_("這個帳號不能改"))
	doc = frappe.get_doc("User", user, for_update=True)
	if not enabled:
		_guard_admin_change(user, ADMIN in frappe.get_roles(user))
	doc.enabled = enabled
	doc.save()
	if not enabled:
		# Desk sessions are cleared by Frappe; tokens the shell holds are not.
		for token in frappe.get_all("OAuth Bearer Token", filters={"user": user, "status": "Active"}, pluck="name"):
			frappe.db.set_value("OAuth Bearer Token", token, "status", "Revoked")
	return {"ok": True, "message": _("{0} 已{1}").format(doc.full_name, _("恢復") if enabled else _("停用，馬上登出"))}


@frappe.whitelist(methods=["POST"])
def set_security(two_factor=None, two_factor_method=None, password_policy=None, session_expiry=None, lockout_attempts=None):
	_require_admin()
	from frappe.twofactor import toggle_two_factor_auth

	settings = frappe.get_single("System Settings")
	if two_factor is not None:
		state = cint(two_factor)
		settings.enable_two_factor_auth = state
		toggle_two_factor_auth(state, roles=["All"])
	if two_factor_method in ("OTP App", "Email", "SMS"):
		settings.two_factor_method = two_factor_method
	if password_policy is not None:
		settings.enable_password_policy = cint(password_policy)
		if cint(password_policy) and not settings.minimum_password_score:
			settings.minimum_password_score = "3"
	if session_expiry:
		if not re.match(r"^\d{1,3}:\d{2}$", str(session_expiry)):
			frappe.throw(_("閒置登出時間要寫成 時:分，例如 08:00"))
		settings.session_expiry = session_expiry
	if lockout_attempts is not None:
		settings.allow_consecutive_login_attempts = max(cint(lockout_attempts), 0)
		settings.allow_login_after_fail = settings.allow_login_after_fail or 60
	settings.save()
	return {"ok": True, "security": _security(), "message": _("安全設定已更新")}


@frappe.whitelist()
def audit(limit=60):
	"""Who logged in and who changed what, newest first."""
	_require_admin()
	limit = min(cint(limit) or 60, 200)
	rows = []
	for a in frappe.get_all(
		"Activity Log",
		filters={"operation": ("in", ["Login", "Logout", "Impersonate"])},
		fields=["user", "full_name", "operation", "status", "ip_address", "creation"],
		order_by="creation desc",
		limit=limit,
	):
		rows.append({"at": str(a.creation), "who": a.full_name or a.user, "what": {"Login": "登入", "Logout": "登出", "Impersonate": "代登入"}.get(a.operation, a.operation) + ("" if a.status in (None, "", "Success") else "失敗"), "detail": a.ip_address or "", "href": None})
	for v in frappe.get_all("Version", fields=["owner", "ref_doctype", "docname", "creation"], order_by="creation desc", limit=limit):
		rows.append({"at": str(v.creation), "who": frappe.utils.get_fullname(v.owner), "what": _("改了 {0}").format(_(v.ref_doctype)), "detail": v.docname, "href": f"/app/{frappe.scrub(v.ref_doctype).replace('_', '-')}/{v.docname}"})
	for x in frappe.get_all("Access Log", fields=["user", "export_from", "file_type", "creation"], order_by="creation desc", limit=limit):
		rows.append({"at": str(x.creation), "who": frappe.utils.get_fullname(x.user), "what": _("匯出資料"), "detail": " ".join(filter(None, [x.export_from, x.file_type])), "href": None})
	rows.sort(key=lambda r: r["at"], reverse=True)
	return {"rows": rows[:limit]}


@frappe.whitelist()
def usage():
	"""Numbers the platform needs to run 100 companies: seats, activity, size.
	Read by the glue's daily job with the integration user."""
	if not ({ADMIN, INTEGRATION} & set(frappe.get_roles())):
		raise frappe.PermissionError
	from frappe.email.queue import get_emails_sent_this_month

	month_start = getdate().replace(day=1)
	staff = frappe.get_all("User", filters=_staff_filters(), fields=["enabled", "last_active"])
	active_cutoff = add_days(now_datetime(), -30)
	week_cutoff = add_days(now_datetime(), -7)
	today = getdate()
	last_active = max((u.last_active for u in staff if u.last_active), default=None)
	db_bytes = frappe.db.sql(
		"select coalesce(sum(data_length + index_length), 0) from information_schema.tables where table_schema = %s",
		frappe.conf.db_name,
	)[0][0]
	files_bytes = frappe.db.sql("select coalesce(sum(file_size), 0) from `tabFile` where is_folder = 0")[0][0]
	return {
		"users": sum(cint(u.enabled) for u in staff),
		"active_users_30d": sum(1 for u in staff if cint(u.enabled) and u.last_active and u.last_active >= active_cutoff),
		"active_users_7d": sum(1 for u in staff if cint(u.enabled) and u.last_active and u.last_active >= week_cutoff),
		"last_active": str(last_active) if last_active else None,
		"invoices_this_month": frappe.db.count("Sales Invoice", {"docstatus": 1, "posting_date": (">=", month_start)}),
		"invoices_30d": frappe.db.count("Sales Invoice", {"docstatus": 1, "posting_date": (">", add_days(today, -30))}),
		"invoices_prev_30d": frappe.db.count("Sales Invoice", {"docstatus": 1, "posting_date": ("between", [add_days(today, -60), add_days(today, -30)])}),
		"orders_this_month": frappe.db.count("Sales Order", {"docstatus": 1, "transaction_date": (">=", month_start)}),
		"emails_this_month": get_emails_sent_this_month(),
		"db_mb": round(float(db_bytes) / 1048576, 1),
		"files_mb": round(float(files_bytes or 0) / 1048576, 1),
		"setup_complete": cint(frappe.is_setup_complete()),
		"backup": _backup(),
		"at": str(now_datetime()),
	}


def _backup():
	from dropout_core import backups

	try:
		return backups.read(refresh=True)
	except Exception as e:
		return {"error": str(e)[:300]}
