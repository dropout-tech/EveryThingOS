"""Whitelisted endpoints for the Cloudflare glue (G1–G10) and the DropOut shell.

Callers authenticate with an API key of a user holding "DropOut Integration".
Every write is idempotent: the same idempotency key returns the first result.
"""

import secrets

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from dropout_core.events import emit
from dropout_core.taiwan import normalize_email, normalize_phone

INTEGRATION_ROLES = ("System Manager", "DropOut Integration")
MARKETING_CHANNELS = ("email", "line", "ig", "fb", "sms")


def _guard():
	frappe.only_for(INTEGRATION_ROLES)


def _settings():
	return frappe.get_cached_doc("DropOut Settings")


def _find_identity(channel, external_id, source_account=None):
	if channel == "email":
		external_id = normalize_email(external_id)
	elif channel == "phone":
		external_id = normalize_phone(external_id)
	if not external_id:
		return None, None
	name = frappe.db.get_value(
		"DropOut Identity",
		{"channel": channel, "external_id": external_id, "source_account": source_account or "default"},
	)
	return name, external_id


def _add_identity(party_type, party, channel, external_id, source_account=None, verified=0):
	return frappe.get_doc(
		{
			"doctype": "DropOut Identity",
			"party_type": party_type,
			"party": party,
			"channel": channel,
			"external_id": external_id,
			"source_account": source_account,
			"verified": 1 if verified else 0,
		}
	).insert(ignore_permissions=True)


def _new_lead(display_name, email=None, phone=None, source_label=None, utm=None):
	lead = frappe.new_doc("Lead")
	lead.first_name = (display_name or email or phone or _("新客人"))[:140]
	if email:
		lead.email_id = email
	if phone:
		lead.mobile_no = phone
	for key, value in (utm or {}).items():
		if value and lead.meta.has_field(key) and frappe.db.exists(lead.meta.get_field(key).options, value):
			lead.set(key, value)
	if source_label and lead.meta.has_field("source") and frappe.db.exists("Lead Source", source_label):
		lead.source = source_label
	lead.flags.ignore_permissions = True
	lead.flags.ignore_mandatory = True
	lead.insert()
	return lead


def _possible_matches(email=None, phone=None, exclude=None):
	matches = []
	for doctype, field_map in (("Lead", {"email_id": email, "mobile_no": phone}), ("Customer", {"email_id": email, "mobile_no": phone})):
		for field, value in field_map.items():
			if not value or not frappe.get_meta(doctype).has_field(field):
				continue
			for name in frappe.get_all(doctype, filters={field: value}, pluck="name", limit=5):
				if (doctype, name) != exclude and {"party_type": doctype, "party": name} not in matches:
					matches.append({"party_type": doctype, "party": name})
	return matches


@frappe.whitelist(methods=["POST"])
def resolve_party(channel, external_id, source_account=None, display_name=None, email=None, phone=None):
	"""G1/G2: find the party behind a channel identity, or create a Lead + Identity.

	Only verified identities are merged automatically (D6). Unverified email or phone
	matches come back as `possible_matches` for staff to confirm.
	"""
	_guard()
	name, external_id = _find_identity(channel, external_id, source_account)
	if not external_id:
		frappe.throw(_("Invalid external id"))
	email, phone = normalize_email(email), normalize_phone(phone)
	if name:
		ident = frappe.get_doc("DropOut Identity", name)
		return {"party_type": ident.party_type, "party": ident.party, "identity": name, "created": False, "possible_matches": []}

	lead = _new_lead(display_name, email=email, phone=phone)
	ident = _add_identity("Lead", lead.name, channel, external_id, source_account)
	return {
		"party_type": "Lead",
		"party": lead.name,
		"identity": ident.name,
		"created": True,
		"possible_matches": _possible_matches(email, phone, exclude=("Lead", lead.name)),
	}


@frappe.whitelist(methods=["POST"])
def record_event(event_type, idempotency_key, **fields):
	_guard()
	fields.pop("cmd", None)
	name, created = emit(event_type, idempotency_key, **fields)
	return {"event": name, "created": created}


@frappe.whitelist(methods=["POST"])
def capture_lead(form_id, email, display_name=None, phone=None, consent_marketing=0, wording_version=None, source=None, message=None, utm_source=None, utm_medium=None, utm_campaign=None):
	"""G3: website form. Marketing consent stays `pending` until the confirmation link is clicked."""
	_guard()
	key = f"form:{form_id}"
	existing = frappe.db.get_value("DropOut Event", {"idempotency_key": key}, ["party_type", "party", "payload"], as_dict=True)
	if existing:
		payload = frappe.parse_json(existing.payload or "{}")
		return {"party_type": existing.party_type, "party": existing.party, "consent_token": payload.get("consent_token"), "created": False}

	email = normalize_email(email) or frappe.throw(_("Invalid email"))
	name, _ext = _find_identity("email", email)
	if name:
		ident = frappe.get_doc("DropOut Identity", name)
		party_type, party = ident.party_type, ident.party
	else:
		lead = _new_lead(display_name, email=email, phone=normalize_phone(phone), utm={"utm_source": utm_source, "utm_medium": utm_medium, "utm_campaign": utm_campaign})
		party_type, party = "Lead", lead.name
		_add_identity(party_type, party, "email", email)

	token = None
	if frappe.utils.cint(consent_marketing):
		token = secrets.token_urlsafe(24)
		frappe.get_doc(
			{
				"doctype": "DropOut Consent",
				"party_type": party_type,
				"party": party,
				"email": email,
				"purpose": "marketing",
				"channel": "email",
				"status": "pending",
				"source": source or form_id,
				"wording_version": wording_version,
				"token": token,
			}
		).insert(ignore_permissions=True)

	emit(
		"lead_captured",
		key,
		party_type=party_type,
		party=party,
		channel="email",
		external_id=email,
		source_system="website",
		payload={"consent_token": token, "message": message, "utm_source": utm_source, "utm_medium": utm_medium, "utm_campaign": utm_campaign},
	)
	return {"party_type": party_type, "party": party, "consent_token": token, "created": True}


def _add_to_group(group, email):
	if not group or not email:
		return
	member = frappe.db.get_value("Email Group Member", {"email_group": group, "email": email}, ["name", "unsubscribed"], as_dict=True)
	if member and member.unsubscribed:
		frappe.db.set_value("Email Group Member", member.name, "unsubscribed", 0)
	elif not member:
		frappe.get_doc({"doctype": "Email Group Member", "email_group": group, "email": email}).insert(ignore_permissions=True)


def _remove_from_group(group, email):
	if group and email:
		frappe.db.delete("Email Group Member", {"email_group": group, "email": email})


@frappe.whitelist(methods=["POST"])
def confirm_consent(token):
	"""G4: double opt-in link clicked."""
	_guard()
	consent = frappe.db.get_value("DropOut Consent", {"token": token}, ["name", "status", "email", "party_type", "party"], as_dict=True)
	if not consent:
		frappe.throw(_("確認連結無效或已過期"), frappe.DoesNotExistError)
	if consent.status != "granted":
		doc = frappe.get_doc("DropOut Consent", consent.name)
		doc.status = "granted"
		doc.save(ignore_permissions=True)
		frappe.db.delete("Email Unsubscribe", {"email": consent.email, "global_unsubscribe": 1})
	name, _ext = _find_identity("email", consent.email)
	if name:
		frappe.db.set_value("DropOut Identity", name, "verified", 1)
	_add_to_group(_settings().new_friends_group, consent.email)
	merged_into = _auto_merge_verified_email(consent.email, consent.party_type, consent.party)
	emit("subscribed", f"consent:{token}", party_type=consent.party_type, party=consent.party, channel="email", external_id=consent.email, source_system="website")
	return {"party_type": consent.party_type, "party": consent.party, "email": consent.email, "merged_into": merged_into}


def _auto_merge_verified_email(email, party_type, party):
	if not _settings().auto_merge_verified:
		return None
	others = frappe.get_all(
		"DropOut Identity",
		filters={"channel": "email", "external_id": email, "verified": 1},
		fields=["party_type", "party"],
	)
	for other in others:
		if (other.party_type, other.party) != (party_type, party) and other.party_type == "Customer" and party_type == "Lead":
			_move_party_records(party_type, party, other.party_type, other.party)
			return {"party_type": other.party_type, "party": other.party}
	return None


def _move_party_records(src_type, src, dst_type, dst):
	marker = f"{src_type}:{src}"
	for doctype in ("DropOut Identity", "DropOut Consent", "DropOut Event"):
		updates = {"party_type": dst_type, "party": dst}
		if doctype == "DropOut Identity":
			updates["merged_from"] = marker
		for name in frappe.get_all(doctype, filters={"party_type": src_type, "party": src}, pluck="name"):
			frappe.db.set_value(doctype, name, updates, update_modified=False)


@frappe.whitelist(methods=["POST"])
def merge_parties(source_party_type, source_party, target_party_type, target_party):
	"""Staff pressed「是同一個人」. Reversible with undo_merge."""
	frappe.only_for(INTEGRATION_ROLES + ("Sales Manager", "Sales User"))
	_move_party_records(source_party_type, source_party, target_party_type, target_party)
	return {"party_type": target_party_type, "party": target_party}


@frappe.whitelist(methods=["POST"])
def undo_merge(source_party_type, source_party):
	frappe.only_for(INTEGRATION_ROLES + ("Sales Manager",))
	marker = f"{source_party_type}:{source_party}"
	names = frappe.get_all("DropOut Identity", filters={"merged_from": marker}, pluck="name")
	for name in names:
		frappe.db.set_value("DropOut Identity", name, {"party_type": source_party_type, "party": source_party, "merged_from": None})
	return {"restored": len(names)}


def _party_emails(party_type, party):
	emails = set(
		frappe.get_all("DropOut Identity", filters={"party_type": party_type, "party": party, "channel": "email"}, pluck="external_id")
	)
	field = "email_id"
	if frappe.get_meta(party_type).has_field(field):
		value = normalize_email(frappe.db.get_value(party_type, party, field))
		if value:
			emails.add(value)
	return sorted(emails)


def _has_marketing_consent(email):
	return bool(frappe.db.exists("DropOut Consent", {"email": email, "purpose": "marketing", "status": "granted"}))


@frappe.whitelist(methods=["POST"])
def update_segments(event_type, party_type, party, reference=None):
	"""G5: `won` stops new-friend promotions; `paid` moves the person to 老客人."""
	_guard()
	settings = _settings()
	moved = []
	for email in _party_emails(party_type, party):
		if event_type in ("won", "paid"):
			_remove_from_group(settings.new_friends_group, email)
		if event_type == "paid" and _has_marketing_consent(email):
			_add_to_group(settings.customers_group, email)
		moved.append(email)
	return {"emails": moved}


@frappe.whitelist(methods=["POST"])
def unsubscribe(email=None, party_type=None, party=None, source=None, channel=None):
	"""G6: one unsubscribe closes every marketing channel for that person."""
	_guard()
	email = normalize_email(email)
	if email and not party:
		name, _ext = _find_identity("email", email)
		if name:
			party_type, party = frappe.db.get_value("DropOut Identity", name, ["party_type", "party"])
	emails = set(_party_emails(party_type, party)) if party else set()
	if email:
		emails.add(email)

	consent_filters = [{"email": e} for e in emails]
	if party:
		consent_filters.append({"party_type": party_type, "party": party})
	for filters in consent_filters:
		for name in frappe.get_all("DropOut Consent", filters={**filters, "purpose": "marketing", "status": ["!=", "withdrawn"]}, pluck="name"):
			doc = frappe.get_doc("DropOut Consent", name)
			doc.status = "withdrawn"
			doc.save(ignore_permissions=True)
	for e in emails:
		for member in frappe.get_all("Email Group Member", filters={"email": e}, pluck="name"):
			frappe.db.set_value("Email Group Member", member, "unsubscribed", 1)
		if not frappe.db.exists("Email Unsubscribe", {"email": e, "global_unsubscribe": 1}):
			frappe.get_doc({"doctype": "Email Unsubscribe", "email": e, "global_unsubscribe": 1}).insert(ignore_permissions=True)

	identities = (
		frappe.get_all(
			"DropOut Identity",
			filters={"party_type": party_type, "party": party, "channel": ["in", ["line", "ig", "fb", "web_chat"]]},
			fields=["channel", "external_id", "source_account"],
		)
		if party
		else []
	)
	stamp = now_datetime().strftime("%Y%m%d%H%M")
	emit("unsubscribed", f"unsub:{party or email}:{stamp}", party_type=party_type, party=party, channel=channel or "email", external_id=email, source_system=source or "unknown")
	return {"emails": sorted(emails), "identities": identities}


def _party_for_email(email):
	name, _ext = _find_identity("email", email)
	if name:
		return frappe.db.get_value("DropOut Identity", name, ["party_type", "party"])
	for doctype in ("Customer", "Lead"):
		party = frappe.db.get_value(doctype, {"email_id": email})
		if party:
			return doctype, party
	return None, None


@frappe.whitelist(methods=["POST"])
def record_letter_event(kind, event_id, email, url=None, campaign=None, message_id=None):
	"""G7: opened / clicked from the email service."""
	_guard()
	if kind not in ("opened", "clicked"):
		frappe.throw(_("kind must be opened or clicked"))
	email = normalize_email(email)
	party_type, party = _party_for_email(email) if email else (None, None)
	name, created = emit(
		f"letter_{kind}",
		f"mail:{event_id}",
		party_type=party_type,
		party=party,
		channel="email",
		external_id=email,
		source_system="email_service",
		payload={"url": url, "campaign": campaign, "message_id": message_id},
	)
	return {"event": name, "created": created, "party": party}


@frappe.whitelist(methods=["POST"])
def mark_bounced(email, message_id, reason=None, hard=1):
	"""G8: hard bounce stops all future sends to that address."""
	_guard()
	email = normalize_email(email) or frappe.throw(_("Invalid email"))
	if frappe.utils.cint(hard):
		for member in frappe.get_all("Email Group Member", filters={"email": email}, pluck="name"):
			frappe.db.set_value("Email Group Member", member, "unsubscribed", 1)
		if not frappe.db.exists("Email Unsubscribe", {"email": email, "global_unsubscribe": 1}):
			frappe.get_doc({"doctype": "Email Unsubscribe", "email": email, "global_unsubscribe": 1}).insert(ignore_permissions=True)
	party_type, party = _party_for_email(email)
	name, created = emit("email_bounced", f"bounce:{message_id}", party_type=party_type, party=party, channel="email", external_id=email, source_system="email_service", payload={"reason": reason, "hard": frappe.utils.cint(hard)})
	return {"event": name, "created": created}


@frappe.whitelist(methods=["POST"])
def record_payment(gateway, trade_no, amount, gateway_txn=None, paid_at=None, raw=None):
	"""G9: the glue already verified the gateway signature. Auto-post only when amounts match."""
	_guard()
	key = f"pay:{gateway}:{trade_no}"
	pr_name = frappe.db.get_value("Payment Request", {"dropout_trade_no": trade_no})
	if not pr_name:
		emit("payment_mismatch", key, source_system=gateway, payload={"reason": "unknown_trade_no", "trade_no": trade_no, "amount": amount, "raw": raw})
		return {"status": "unknown_trade_no"}
	pr = frappe.get_doc("Payment Request", pr_name)
	if pr.status == "Paid":
		return {"status": "already_paid", "payment_request": pr.name}
	if abs(flt(pr.grand_total) - flt(amount)) > 0.5:
		emit(
			"payment_mismatch",
			key,
			party_type=pr.party_type,
			party=pr.party,
			reference_doctype="Payment Request",
			reference_name=pr.name,
			source_system=gateway,
			payload={"expected": pr.grand_total, "received": amount, "gateway_txn": gateway_txn},
		)
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"description": _("金流金額對不上：{0} 應收 {1}，收到 {2}").format(pr.name, pr.grand_total, amount),
				"reference_type": "Payment Request",
				"reference_name": pr.name,
				"role": "Accounts Manager",
				"priority": "High",
			}
		).insert(ignore_permissions=True)
		return {"status": "mismatch", "payment_request": pr.name}
	frappe.flags.ignore_account_permission = True
	pr.flags.ignore_permissions = True
	payment_entry = pr.set_as_paid()
	return {"status": "paid", "payment_request": pr.name, "payment_entry": getattr(payment_entry, "name", None)}


@frappe.whitelist(methods=["POST"])
def set_einvoice(sales_invoice, status, number=None, error=None):
	"""G10: write back the result from the e-invoice provider."""
	_guard()
	if status not in ("待上傳", "已開立", "失敗", "已作廢"):
		frappe.throw(_("Unknown e-invoice status"))
	frappe.db.set_value("Sales Invoice", sales_invoice, {"dropout_einvoice_status": status, "dropout_einvoice_number": number, "dropout_einvoice_error": error})
	customer = frappe.db.get_value("Sales Invoice", sales_invoice, "customer")
	event = "einvoice_issued" if status == "已開立" else "einvoice_failed" if status == "失敗" else None
	if event:
		emit(event, f"einv:{sales_invoice}:{status}:{number or ''}", party_type="Customer", party=customer, reference_doctype="Sales Invoice", reference_name=sales_invoice, source_system="einvoice", payload={"number": number, "error": error})
	return {"sales_invoice": sales_invoice, "status": status}


@frappe.whitelist(methods=["POST"])
def record_meeting(meeting_id, platform, summary, transcript_url=None, party_type=None, party=None, attendees=None, started_at=None):
	"""Meeting bot: one summary per meeting, attached to the party timeline as a Comment."""
	_guard()
	attendees = frappe.parse_json(attendees) if isinstance(attendees, str) else (attendees or [])
	if not party:
		for email in attendees:
			party_type, party = _party_for_email(normalize_email(email)) if normalize_email(email) else (None, None)
			if party:
				break
	name, created = emit(
		"meeting_summarized",
		f"meeting:{platform}:{meeting_id}",
		party_type=party_type,
		party=party,
		source_system="vexa",
		occurred_at=started_at,
		payload={"summary": summary, "transcript_url": transcript_url, "attendees": attendees},
	)
	if created and party_type and party:
		frappe.get_doc(party_type, party).add_comment("Info", _("會議摘要：{0}").format(summary))
	return {"event": name, "created": created}


@frappe.whitelist()
def party_card(party_type, party):
	"""Customer 360 for the shell: identities, consent, recent events, open documents."""
	frappe.has_permission(party_type, "read", party, throw=True)
	doc = frappe.get_doc(party_type, party)
	customer = party if party_type == "Customer" else None
	card = {
		"party_type": party_type,
		"party": party,
		"display_name": doc.get("customer_name") or doc.get("lead_name") or doc.name,
		"tax_id": doc.get("tax_id"),
		"stage": doc.get("status") or doc.get("customer_group"),
		"identities": frappe.get_all("DropOut Identity", filters={"party_type": party_type, "party": party}, fields=["channel", "external_id", "verified", "first_seen_at"]),
		"consents": frappe.get_all("DropOut Consent", filters={"party_type": party_type, "party": party}, fields=["purpose", "channel", "status", "granted_at", "withdrawn_at"]),
		"events": frappe.get_all("DropOut Event", filters={"party_type": party_type, "party": party}, fields=["event_type", "occurred_at", "reference_doctype", "reference_name"], order_by="occurred_at desc", limit=20),
		"open_quotations": frappe.get_all("Quotation", filters={"quotation_to": party_type, "party_name": party, "docstatus": 1, "status": "Open"}, fields=["name", "grand_total", "transaction_date"]),
		"outstanding": 0,
	}
	if customer:
		card["outstanding"] = flt(
			frappe.db.sql("select sum(outstanding_amount) from `tabSales Invoice` where customer=%s and docstatus=1", customer)[0][0]
		)
	return card


@frappe.whitelist()
def setup_status():
	"""Onboarding checklist for 今天. Each step is derived from real data, never a manual tick."""
	from dropout_core.onboarding import steps

	return steps()


@frappe.whitelist()
def setup_checklist():
	"""開站清單 for 今天. Counts read past document permissions, so only the owner (System Manager) may ask."""
	from dropout_core.onboarding import checklist
	from dropout_core.team import _require_admin

	_require_admin()
	return checklist()
