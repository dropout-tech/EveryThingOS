"""簽核與報帳: what waits for the logged-in user, and expense claims from the phone.

Who decides what is ERPNext's business, not ours:

- Any doctype with an active Workflow (the two DropOut ones below, or one the
  company built itself) is decided with Frappe's `apply_workflow`, so the
  workflow's roles, conditions and self-approval rule apply.
- Expense Claims without a Workflow follow HRMS: the approver sets the approval
  status and submits.
- Leave applications stay with dropout_hr_tw (`decide_leave`).

The two DropOut workflows (大額採購、大折扣報價) are opt-in from the shell and
can be switched off again; turning one on never replaces a workflow the
company already uses on that doctype."""

import re

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions, get_workflow_name, has_approval_access
from frappe.utils import add_days, cstr, flt, get_fullname, getdate, nowdate, strip_html

ADMIN = "System Manager"
EXPENSE_ROLES = {ADMIN, "HR Manager", "HR User"}
LEAVE_ROLES = {ADMIN, "HR Manager", "HR User", "Leave Approver"}
LIMIT = 30
MINE_DAYS = 60
MAX_AMOUNT = 1_000_000
MAX_NOTE = 500
OLDEST_DAYS = 365
REASON_PREFIX = "退回原因："
DECISIONS = {"approve": "Approved", "reject": "Rejected"}
# Leave Application is decided by dropout_hr_tw; Expense Claim by HRMS when it has no Workflow.
NATIVE = ("Leave Application",)

APPROVE = re.compile(r"approve|核准|同意|通過|批准", re.I)
REJECT = re.compile(r"reject|退回|駁回|拒絕|不核准|不同意", re.I)
IMAGE = re.compile(r"\.(jpe?g|png|webp|gif)$", re.I)
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Shown as 交通、餐費… in the shell; each becomes an Expense Claim Type with the
# company's matching expense account (first keyword that matches an account name).
CATEGORIES = {
	"交通": ("旅費", "交通", "Travel"),
	"餐費": ("交際", "伙食", "餐", "Entertainment"),
	"住宿": ("旅費", "住宿", "Travel"),
	"文具": ("文具", "Stationery", "Stationary", "Office"),
	"郵資": ("郵電", "郵資", "Postal"),
	"其他": ("雜項", "雜費", "Miscellaneous"),
}
FALLBACK_ACCOUNT = ("雜項", "雜費", "Miscellaneous")

DRAFT, PENDING, APPROVED, RETURNED = "草稿", "待核准", "已核准", "退回"
STATE_STYLE = {DRAFT: "", PENDING: "Warning", APPROVED: "Success", RETURNED: "Danger"}
SEND, ASK, OK, BACK = "送出", "送審", "核准", "退回"

RULES = {
	"purchase": {
		"doctype": "Purchase Order",
		"workflow": "DropOut 大額採購核准",
		"maker": "Purchase User",
		"approver": "Purchase Manager",
		"field": "base_grand_total",
		"default": 50000,
		"min": 1,
		"max": 100_000_000,
	},
	"quote": {
		"doctype": "Quotation",
		"workflow": "DropOut 報價折扣核准",
		"maker": "Sales User",
		"approver": "Sales Manager",
		"field": "dropout_discount_percent",
		"default": 15,
		"min": 1,
		"max": 99,
	},
}


def _user():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	return frappe.session.user


def _desk(doctype, name):
	return f"/app/{frappe.scrub(doctype).replace('_', '-')}/{name}"


def _has_hrms():
	return "hrms" in frappe.get_installed_apps() and bool(frappe.db.exists("DocType", "Expense Claim"))


def _has_hr_tw():
	return "dropout_hr_tw" in frappe.get_installed_apps()


def _employee(user):
	if not frappe.db.exists("DocType", "Employee"):
		return None
	return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name", "company"], as_dict=True)


def _clean(text, limit=MAX_NOTE):
	return strip_html(cstr(text or "")).strip()[:limit]


def _kind_of(action):
	if REJECT.search(action or ""):
		return "reject"
	if APPROVE.search(action or ""):
		return "approve"
	return None


def _is_own(doc, user):
	if doc.get("owner") == user:
		return True
	employee = doc.get("employee") if doc.meta.has_field("employee") else None
	return bool(employee and frappe.db.get_value("Employee", employee, "user_id") == user)


def _threshold(rule_id):
	rule = RULES[rule_id]
	value = frappe.db.get_default(f"dropout_approval_{rule_id}")
	return flt(value) if value not in (None, "") else flt(rule["default"])


def _rule_for(doctype):
	for rule_id, rule in RULES.items():
		if rule["doctype"] == doctype and get_workflow_name(doctype) == rule["workflow"]:
			return rule_id, rule
	return None, None


# Cards ----------------------------------------------------------------------


def _attachments(doctype, names):
	if not names:
		return {}
	out = {}
	for f in frappe.get_all(
		"File",
		filters={"attached_to_doctype": doctype, "attached_to_name": ["in", names], "is_folder": 0},
		fields=["name", "file_name", "file_url", "attached_to_name"],
		order_by="creation asc",
	):
		label = f.file_name or (f.file_url or "").rsplit("/", 1)[-1]
		out.setdefault(f.attached_to_name, []).append({"id": f.name, "name": label, "image": bool(IMAGE.search(label or f.file_url or ""))})
	return out


def _items_summary(doc):
	rows = doc.get("items") or []
	if not rows:
		return ""
	first = rows[0].get("item_name") or rows[0].get("item_code") or ""
	return first if len(rows) == 1 else _("{0} 等 {1} 項").format(first, len(rows))


def _expense_summary(doc):
	rows = doc.get("expenses") or []
	types = sorted({r.expense_type for r in rows if r.expense_type})
	note = doc.get("remark") or (rows[0].description if rows else "")
	return "、".join(types), _clean(note, 200)


def _card(doc, actions, state=None):
	dt = doc.doctype
	card = {
		"doctype": dt,
		"name": doc.name,
		"requester": get_fullname(doc.owner),
		"party": None,
		"title": doc.get("title") or doc.name,
		"amount": None,
		"reason": "",
		"created": str(doc.creation),
		"state": state,
		"href": _desk(dt, doc.name),
		"actions": actions,
		"kind": "other",
	}
	if dt == "Purchase Order":
		card.update(kind="purchase", party=doc.supplier_name or doc.supplier, title=_items_summary(doc) or doc.name, amount=flt(doc.base_grand_total))
	elif dt == "Quotation":
		pct = flt(doc.get("dropout_discount_percent"))
		card.update(
			kind="quote",
			party=doc.customer_name or doc.party_name,
			title=_items_summary(doc) or doc.name,
			amount=flt(doc.base_grand_total),
			reason=_("折扣 {0}%").format(round(pct, 1)) if pct else "",
			discount=round(pct, 1),
		)
	elif dt == "Expense Claim":
		types, note = _expense_summary(doc)
		card.update(kind="expense", requester=doc.employee_name or card["requester"], title=types or _("報帳"), amount=flt(doc.total_claimed_amount), reason=note)
	elif dt == "Leave Application":
		card.update(kind="leave", requester=doc.employee_name, title=doc.leave_type, amount=None, reason=_clean(doc.description, 200))
	else:
		for field in ("base_grand_total", "grand_total", "total"):
			if doc.meta.has_field(field):
				card["amount"] = flt(doc.get(field))
				break
	return card


def _workflow_items(user, roles, denied):
	items = []
	for name in frappe.get_all("Workflow", filters={"is_active": 1}, pluck="name"):
		workflow = frappe.get_doc("Workflow", name)
		dt = workflow.document_type
		if dt in NATIVE:
			continue
		states = sorted({t.state for t in workflow.transitions if t.allowed in roles and _kind_of(t.action)})
		if not states:
			continue
		try:
			rows = frappe.get_list(dt, filters={workflow.workflow_state_field: ["in", states], "docstatus": ["<", 2]}, pluck="name", order_by="creation asc", limit=LIMIT)
		except frappe.PermissionError:
			frappe.clear_last_message()
			denied.append(dt)
			continue
		docs = []
		for docname in rows:
			doc = frappe.get_doc(dt, docname)
			if _is_own(doc, user) and user != "Administrator":
				continue
			seen, actions = set(), []
			for t in get_transitions(doc, workflow):
				kind = _kind_of(t.action)
				if kind and t.action not in seen and has_approval_access(user, doc, t):
					seen.add(t.action)
					actions.append({"action": t.action, "kind": kind})
			if actions:
				docs.append((doc, actions))
		files = _attachments(dt, [d.name for d, _a in docs])
		for doc, actions in docs:
			card = _card(doc, actions, doc.get(workflow.workflow_state_field))
			card["attachments"] = files.get(doc.name, [])
			items.append(card)
	return items


def _may_decide_expense(doc, user, roles):
	return bool(roles & EXPENSE_ROLES or ("Expense Approver" in roles and doc.expense_approver == user))


def _expense_items(user, roles, me):
	if not _has_hrms() or get_workflow_name("Expense Claim"):
		return []
	if not (roles & EXPENSE_ROLES or "Expense Approver" in roles):
		return []
	filters = {"docstatus": 0, "approval_status": "Draft", "owner": ["!=", user]}
	if not roles & EXPENSE_ROLES:
		filters["expense_approver"] = user
	if me:
		filters["employee"] = ["!=", me.name]
	names = frappe.get_all("Expense Claim", filters=filters, pluck="name", order_by="creation asc", limit=LIMIT)
	files = _attachments("Expense Claim", names)
	actions = [{"action": "approve", "kind": "approve"}, {"action": "reject", "kind": "reject"}]
	out = []
	for name in names:
		card = _card(frappe.get_doc("Expense Claim", name), actions)
		card["attachments"] = files.get(name, [])
		out.append(card)
	return out


def _reason(doctype, name):
	text = frappe.db.get_value(
		"Comment",
		{"reference_doctype": doctype, "reference_name": name, "comment_type": "Comment", "content": ["like", f"%{REASON_PREFIX}%"]},
		"content",
		order_by="creation desc",
	)
	return _clean(text, 300).replace(REASON_PREFIX, "", 1).strip() if text else ""


def _mine(user, me):
	since = add_days(nowdate(), -MINE_DAYS)
	out = []
	if me and _has_hrms():
		for c in frappe.get_all(
			"Expense Claim",
			filters={"employee": me.name, "docstatus": ["<", 2], "creation": [">=", since]},
			fields=["name", "approval_status", "status", "docstatus", "total_claimed_amount", "remark", "creation"],
			order_by="creation desc",
			limit=LIMIT,
		):
			doc = frappe.get_doc("Expense Claim", c.name)
			types, note = _expense_summary(doc)
			if c.approval_status == "Rejected":
				status, tone = _("退回"), "danger"
			elif c.status == "Paid":
				status, tone = _("已撥款"), "ok"
			elif c.approval_status == "Approved":
				status, tone = _("已核准，等撥款") if c.docstatus == 1 else _("已核准"), "ok"
			else:
				status, tone = _("等核准"), "warn"
			out.append(
				{
					"kind": "expense",
					"doctype": "Expense Claim",
					"name": c.name,
					"title": types or _("報帳"),
					"amount": flt(c.total_claimed_amount),
					"status": status,
					"tone": tone,
					"note": _reason("Expense Claim", c.name) if tone == "danger" else note,
					"created": str(c.creation),
					"href": _desk("Expense Claim", c.name),
				}
			)
	if me and frappe.db.exists("DocType", "Leave Application"):
		labels = {"Open": (_("等核准"), "warn"), "Approved": (_("已核准"), "ok"), "Rejected": (_("退回"), "danger")}
		for la in frappe.get_all(
			"Leave Application",
			filters={"employee": me.name, "docstatus": ["<", 2], "status": ["in", list(labels)], "creation": [">=", since]},
			fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "creation"],
			order_by="creation desc",
			limit=LIMIT,
		):
			status, tone = labels[la.status]
			span = str(la.from_date)[5:] if la.from_date == la.to_date else f"{str(la.from_date)[5:]} – {str(la.to_date)[5:]}"
			out.append(
				{
					"kind": "leave",
					"doctype": "Leave Application",
					"name": la.name,
					"title": f"{la.leave_type} {span}",
					"amount": None,
					"days": flt(la.total_leave_days),
					"status": status,
					"tone": tone,
					"note": _reason("Leave Application", la.name) if tone == "danger" else "",
					"created": str(la.creation),
					"href": _desk("Leave Application", la.name),
				}
			)
	for name in frappe.get_all("Workflow", filters={"is_active": 1}, pluck="name"):
		workflow = frappe.get_doc("Workflow", name)
		dt = workflow.document_type
		if dt in NATIVE or not workflow.states:
			continue
		field = workflow.workflow_state_field
		first = workflow.states[0].state
		try:
			rows = frappe.get_list(
				dt,
				filters={"owner": user, field: ["not in", [first, ""]], "docstatus": ["<", 2], "modified": [">=", since]},
				pluck="name",
				order_by="modified desc",
				limit=LIMIT,
			)
		except frappe.PermissionError:
			frappe.clear_last_message()
			continue
		for docname in rows:
			if dt == "Expense Claim" and any(m["doctype"] == dt and m["name"] == docname for m in out):
				continue
			doc = frappe.get_doc(dt, docname)
			card = _card(doc, [], doc.get(field))
			state = cstr(doc.get(field))
			tone = "danger" if REJECT.search(state) else "ok" if doc.docstatus == 1 or APPROVE.search(state) else "warn"
			out.append(
				{
					"kind": card["kind"],
					"doctype": dt,
					"name": docname,
					"title": card["party"] or card["title"],
					"amount": card["amount"],
					"status": state,
					"tone": tone,
					"note": _reason(dt, docname) if tone == "danger" else card["title"],
					"created": str(doc.creation),
					"href": card["href"],
				}
			)
	out.sort(key=lambda m: m["created"], reverse=True)
	return out[:LIMIT]


def _can_approve(roles):
	if roles & (EXPENSE_ROLES | LEAVE_ROLES | {"Expense Approver"}):
		return True
	for name in frappe.get_all("Workflow", filters={"is_active": 1}, pluck="name"):
		if any(t.allowed in roles and _kind_of(t.action) for t in frappe.get_doc("Workflow", name).transitions):
			return True
	return False


@frappe.whitelist()
def inbox():
	"""Everything waiting for the logged-in user (leave comes from dropout_hr_tw), and what they sent."""
	user = _user()
	roles = set(frappe.get_roles())
	me = _employee(user)
	denied = []
	items = _workflow_items(user, roles, denied) + _expense_items(user, roles, me)
	items.sort(key=lambda c: c["created"])
	return {
		"items": items,
		"mine": _mine(user, me),
		"rules": settings(),
		"hrms": _has_hrms(),
		"employee": me.name if me else None,
		"can": {"approve": _can_approve(roles), "file": bool(me and _has_hrms()), "configure": user == "Administrator" or ADMIN in roles},
		"denied": denied,
	}


# Decide ---------------------------------------------------------------------


def _note(doc, reason):
	if reason:
		doc.add_comment("Comment", f"{REASON_PREFIX}{reason}")


def _refused(e):
	frappe.db.rollback()
	frappe.local.message_log = []
	return {"ok": False, "message": strip_html(str(e)).strip() or _("ERPNext 拒絕了這一步")}


def _no(message):
	return {"ok": False, "message": message}


def _expense_refusal(doc, action, user):
	if action not in DECISIONS:
		return _("只能核准或退回")
	if not _may_decide_expense(doc, user, set(frappe.get_roles())):
		raise frappe.PermissionError(_("這張報帳不是給你核准的"))
	if _is_own(doc, user):
		raise frappe.PermissionError(_("不能核准自己的報帳"))
	if doc.docstatus != 0 or doc.approval_status != "Draft":
		return _("這張報帳已經處理過了")
	return None


def _decide_expense(doc, action):
	doc.approval_status = DECISIONS[action]
	if action == "approve":
		for row in doc.expenses:
			if not flt(row.sanctioned_amount):
				row.sanctioned_amount = row.amount
	# `_expense_refusal` is the authorization, as in decide_leave.
	doc.flags.ignore_permissions = True
	doc.submit()
	return doc


@frappe.whitelist(methods=["POST"])
def decide(doctype, name, action, reason=None):
	"""Approve or return one document. Workflow actions go through `apply_workflow`.
	Every check runs before anything is written, so a refusal changes nothing."""
	user = _user()
	if not all(isinstance(v, str) and 0 < len(v) <= 140 for v in (doctype, name, action)):
		frappe.throw(_("缺少要簽的單"))
	reason = _clean(reason)
	if (action == "reject" or _kind_of(action) == "reject") and not reason:
		return _no(_("退回要寫原因"))
	if doctype == "Leave Application":
		if not _has_hr_tw():
			frappe.throw(_("這家公司沒有開人事模組"))
		from dropout_hr_tw.shell import decide_leave

		result = decide_leave(name, action)
		_note(frappe.get_doc("Leave Application", name), reason)
		return result
	if not frappe.db.exists("DocType", doctype) or not frappe.db.exists(doctype, name):
		frappe.throw(_("找不到這張單"))
	if get_workflow_name(doctype):
		doc = frappe.get_doc(doctype, name, for_update=True)
		doc.check_permission("read")
		if _is_own(doc, user) and user != "Administrator":
			raise frappe.PermissionError(_("不能核准自己送出的單"))
		allowed = {t.action for t in get_transitions(doc) if _kind_of(t.action) and has_approval_access(user, doc, t)}
		if action not in allowed:
			return _no(_("這張單現在不能「{0}」，可能已經有人處理過了").format(action))
		run, verb = (lambda: apply_workflow(doc, action)), action
	elif doctype == "Expense Claim":
		doc = frappe.get_doc("Expense Claim", name, for_update=True)
		refusal = _expense_refusal(doc, action, user)
		if refusal:
			return _no(refusal)
		run, verb = (lambda: _decide_expense(doc, action)), (_("核准") if action == "approve" else _("退回"))
	else:
		return _no(_("這種單據沒有核准流程，不能在這裡簽"))
	try:
		run()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	_note(doc, reason)
	return {"ok": True, "message": _("已{0} {1}").format(verb, name), "href": _desk(doctype, name)}


# Expense claims ---------------------------------------------------------------


def _account(company, words):
	accounts = frappe.get_all(
		"Account",
		filters={"company": company, "root_type": "Expense", "is_group": 0, "disabled": 0},
		fields=["name", "account_name", "account_type"],
		order_by="lft asc",
	)
	for word in words:
		for a in accounts:
			if word.lower() in (a.account_name or "").lower() and a.account_type not in ("Cost of Goods Sold", "Depreciation", "Stock Adjustment"):
				return a.name
	return None


def ensure_expense_types(company=None):
	"""Create 交通、餐費… Expense Claim Types and give each company an expense account. Never changes existing rows."""
	if not _has_hrms():
		return []
	companies = [company] if company else frappe.get_all("Company", pluck="name")
	made = []
	for label, words in CATEGORIES.items():
		doc = frappe.get_doc("Expense Claim Type", label) if frappe.db.exists("Expense Claim Type", label) else None
		if not doc:
			doc = frappe.get_doc({"doctype": "Expense Claim Type", "expense_type": label, "description": _("DropOut OS 報帳分類")})
		changed = doc.is_new()
		have = {a.company for a in doc.get("accounts") or []}
		for c in companies:
			if c in have:
				continue
			account = _account(c, words) or _account(c, FALLBACK_ACCOUNT)
			if account:
				doc.append("accounts", {"company": c, "default_account": account})
				changed = True
		if changed:
			doc.flags.ignore_permissions = True
			doc.save()
			made.append(label)
	return made


@frappe.whitelist(methods=["POST"])
def new_expense(amount, expense_date, category, note=None):
	"""One expense claim for the logged-in employee. The receipt is attached afterwards with `upload_file`."""
	user = _user()
	if not _has_hrms():
		frappe.throw(_("這家公司的 ERPNext 還沒裝人事模組，不能報帳"))
	value = flt(amount, 2)
	if not 0 < value <= MAX_AMOUNT:
		frappe.throw(_("金額要大於 0、不超過 {0:,}").format(MAX_AMOUNT))
	if not isinstance(expense_date, str) or not DATE.match(expense_date):
		frappe.throw(_("日期看不懂"))
	try:
		day = getdate(expense_date)
	except Exception:
		frappe.throw(_("日期看不懂"))
	today = getdate(nowdate())
	if day > today:
		frappe.throw(_("日期不能是未來"))
	if day < add_days(today, -OLDEST_DAYS):
		frappe.throw(_("超過一年的單據請直接找會計"))
	if category not in CATEGORIES:
		frappe.throw(_("請選分類"))
	note = _clean(note)
	me = _employee(user)
	if not me:
		frappe.throw(_("你的帳號還沒連到員工資料。請人資在 ERPNext 的員工資料填上你的使用者帳號。"))
	ensure_expense_types(me.company)
	from erpnext import get_default_cost_center

	approver = frappe.db.get_value("Employee", me.name, "expense_approver") if frappe.get_meta("Employee").has_field("expense_approver") else None
	doc = frappe.get_doc(
		{
			"doctype": "Expense Claim",
			"employee": me.name,
			"company": me.company,
			"posting_date": nowdate(),
			"expense_approver": approver,
			"approval_status": "Draft",
			"remark": note,
			"payable_account": frappe.get_cached_value("Company", me.company, "default_expense_claim_payable_account"),
			"expenses": [
				{
					"expense_date": str(day),
					"expense_type": category,
					"description": note or category,
					"amount": value,
					"sanctioned_amount": value,
					"cost_center": get_default_cost_center(me.company),
				}
			],
		}
	)
	try:
		doc.insert()
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return _refused(e)
	return {
		"ok": True,
		"message": _("報帳送出了：{0} NT${1:,.0f}，等主管核准").format(category, value),
		"created": {"doctype": "Expense Claim", "name": doc.name, "href": _desk("Expense Claim", doc.name)},
	}


ALLOWED_FILE_DOCTYPES = ("Expense Claim", "Purchase Order", "Quotation", "Leave Application")


@frappe.whitelist()
def receipt(file):
	"""The bytes of one attachment, for whoever may read (or decide) the document it belongs to."""
	user = _user()
	if not isinstance(file, str) or len(file) > 140 or not frappe.db.exists("File", file):
		raise frappe.PermissionError
	f = frappe.get_doc("File", file)
	if f.attached_to_doctype not in ALLOWED_FILE_DOCTYPES or not f.attached_to_name:
		raise frappe.PermissionError
	allowed = frappe.has_permission(f.attached_to_doctype, "read", f.attached_to_name)
	if not allowed and f.attached_to_doctype == "Expense Claim":
		allowed = _may_decide_expense(frappe.get_doc("Expense Claim", f.attached_to_name), user, set(frappe.get_roles()))
	if not allowed:
		raise frappe.PermissionError
	frappe.response.filename = f.file_name or "receipt"
	frappe.response.filecontent = f.get_content()
	frappe.response.type = "binary"


# Workflows ------------------------------------------------------------------


def _ensure_masters():
	for state, style in STATE_STYLE.items():
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state, "style": style}).insert(ignore_permissions=True)
	for action in (SEND, ASK, OK, BACK):
		if not frappe.db.exists("Workflow Action Master", action):
			frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": action}).insert(ignore_permissions=True)


def workflow_rows(rule_id, threshold):
	"""States and transitions for one DropOut workflow. Pure data, so tests can read it."""
	rule = RULES[rule_id]
	maker, approver, field = rule["maker"], rule["approver"], rule["field"]
	limit = repr(float(threshold))
	small, large = f"doc.{field} <= {limit}", f"doc.{field} > {limit}"
	states = [
		{"state": DRAFT, "doc_status": "0", "allow_edit": maker},
		{"state": PENDING, "doc_status": "0", "allow_edit": approver},
		{"state": RETURNED, "doc_status": "0", "allow_edit": maker},
		{"state": APPROVED, "doc_status": "1", "allow_edit": approver},
	]
	transitions = []
	for start in (DRAFT, RETURNED):
		transitions += [
			{"state": start, "action": SEND, "next_state": APPROVED, "allowed": maker, "allow_self_approval": 1, "condition": small},
			{"state": start, "action": ASK, "next_state": PENDING, "allowed": maker, "allow_self_approval": 1, "condition": large},
			# An approver's own document needs nobody else.
			{"state": start, "action": SEND, "next_state": APPROVED, "allowed": approver, "allow_self_approval": 1, "condition": ""},
		]
	transitions += [
		{"state": PENDING, "action": OK, "next_state": APPROVED, "allowed": approver, "allow_self_approval": 0, "condition": ""},
		{"state": PENDING, "action": BACK, "next_state": RETURNED, "allowed": approver, "allow_self_approval": 0, "condition": ""},
	]
	return states, transitions


@frappe.whitelist()
def settings():
	out = []
	for rule_id, rule in RULES.items():
		dt = rule["doctype"]
		active = get_workflow_name(dt) or None
		out.append(
			{
				"id": rule_id,
				"doctype": dt,
				"active": active == rule["workflow"],
				"other": active if active and active != rule["workflow"] else None,
				"threshold": _threshold(rule_id),
				"approver": rule["approver"],
			}
		)
	return out


@frappe.whitelist(methods=["POST"])
def configure(rule, enabled, threshold=None):
	"""Switch one DropOut workflow on (with its threshold) or off. System Manager only."""
	if frappe.session.user != "Administrator" and ADMIN not in frappe.get_roles():
		raise frappe.PermissionError(_("只有老闆能改核准規則"))
	if rule not in RULES:
		frappe.throw(_("沒有這條規則"))
	spec = RULES[rule]
	on = enabled in (True, 1, "1", "true")
	dt, name = spec["doctype"], spec["workflow"]
	value = _threshold(rule) if threshold in (None, "") else flt(threshold, 2)
	if not spec["min"] <= value <= spec["max"]:
		frappe.throw(_("門檻要在 {0} 到 {1} 之間").format(spec["min"], spec["max"]))
	active = get_workflow_name(dt)
	if on and active and active != name:
		frappe.throw(_("{0} 已經在用「{1}」這個核准流程。要改用 DropOut 的，請先到 ERPNext 停用它。").format(_(dt), active))
	frappe.db.set_default(f"dropout_approval_{rule}", str(value))
	exists = frappe.db.exists("Workflow", name)
	if on:
		_ensure_masters()
		doc = frappe.get_doc("Workflow", name) if exists else frappe.new_doc("Workflow")
		states, transitions = workflow_rows(rule, value)
		doc.update({"workflow_name": name, "document_type": dt, "is_active": 1, "override_status": 0, "send_email_alert": 0, "workflow_state_field": "workflow_state"})
		doc.set("states", states)
		doc.set("transitions", transitions)
		doc.flags.ignore_permissions = True
		doc.save()
	elif exists and active == name:
		frappe.db.set_value("Workflow", name, "is_active", 0)
	frappe.clear_cache(doctype=dt)
	frappe.cache.hdel("workflow", dt)
	return {"ok": True, "message": _("核准規則已更新"), "rules": settings()}


def _over(rule_id, doc):
	return flt(doc.get(RULES[rule_id]["field"])) > _threshold(rule_id)


def set_discount_percent(doc, method=None):
	"""Quotation.validate: item and order discounts together, against the price-list total."""
	listed = sum(flt(i.price_list_rate or i.rate) * flt(i.qty) for i in doc.get("items") or [])
	net = flt(doc.net_total)
	doc.dropout_discount_percent = round(max(0.0, (listed - net) / listed * 100), 2) if listed > 0 else 0


def guard_submit(doc, method=None):
	"""before_submit: a direct submit must not skip a DropOut approval the amount calls for."""
	rule_id, _rule = _rule_for(doc.doctype)
	if rule_id and _over(rule_id, doc) and doc.get("workflow_state") != APPROVED:
		frappe.throw(_("這張單超過核准門檻，要先「送審」，等主管核准後才會送出"), frappe.ValidationError)


def submit_or_send(doc):
	"""Submit, or when a DropOut approval rule applies, take the workflow step this user may take. Returns the pending state or None."""
	rule_id, _rule = _rule_for(doc.doctype)
	if not rule_id:
		doc.submit()
		return None
	actions = {t.action for t in get_transitions(doc)}
	action = SEND if SEND in actions else ASK if ASK in actions else None
	if not action:
		frappe.throw(_("你的角色不能送出這張單"))
	doc = apply_workflow(doc, action) or doc
	return PENDING if action == ASK else None
