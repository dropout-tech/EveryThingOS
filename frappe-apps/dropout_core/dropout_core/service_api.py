"""Site-scoped, transactional Dodo receiver. No network calls or early commits.

The HTTP request commits only after this RPC completes successfully. A receipt
timestamp is generated inside that transaction and becomes visible with it.
"""

import hashlib
import html
import json
import re
import unicodedata
from contextvars import ContextVar
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import uuid4

import frappe

DOCTYPE = "DropOut Service Activity"
INTEGRATION_ROLE = "DropOut Integration"
_receiver_insert = ContextVar("dodo_receiver_insert", default=False)
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}\Z")
_PHONE = re.compile(r"\+[1-9][0-9]{6,14}\Z")
_UTC = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z\Z")
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_TODO = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,139}\Z")


class ServiceError(Exception):
	def __init__(self, code):
		self.code = code
		super().__init__(code)


def _error(code):
	# Frappe validation/duplicate errors may queue messages containing field data.
	# The service protocol returns only the allowlisted error code.
	frappe.clear_messages()
	return {"ok": False, "code": code}


def _authorize():
	"""Current shared reads permit concurrent writers but fence role revocation.

	Do not use cached roles or the generic API's System Manager bypass here.
	The dedicated integration user must remain enabled and explicitly assigned.
	"""
	user = frappe.session.user
	if not user or user == "Guest":
		raise ServiceError("forbidden")
	rows = frappe.db.sql(
		"""SELECT u.name FROM `tabUser` u INNER JOIN `tabHas Role` r
		ON r.parent=u.name AND r.parenttype='User' AND r.parentfield='roles'
		WHERE u.name=%s AND u.enabled=1 AND r.role=%s LOCK IN SHARE MODE""",
		(user, INTEGRATION_ROLE),
	)
	if not rows:
		raise ServiceError("forbidden")


def _writable():
	# Integration users bypass the ordinary account.guard hook; this API must not.
	rows = frappe.db.sql(
		"""SELECT value FROM `tabSingles` WHERE doctype='DropOut Settings'
		AND field='account_locked' LOCK IN SHARE MODE"""
	)
	if rows and str(rows[0][0] or "0") not in ("0", ""):
		raise ServiceError("account_locked")


def _object(value, required, optional=()):
	if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
		raise ServiceError("invalid_request")
	return value


def _text(value, maximum, *, empty=False, multiline=False):
	if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
		raise ServiceError("invalid_request")
	for char in value:
		if 0xD800 <= ord(char) <= 0xDFFF or (unicodedata.category(char) == "Cc" and not (multiline and char in "\n\t")):
			raise ServiceError("invalid_request")
	return value


def _phone(value):
	if not isinstance(value, str) or not _PHONE.fullmatch(value):
		raise ServiceError("invalid_request")
	return value


def _timestamp(value):
	if not isinstance(value, str) or not _UTC.fullmatch(value):
		raise ServiceError("invalid_request")
	try:
		datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
	except ValueError:
		raise ServiceError("invalid_request") from None
	return value


def _operation(value):
	if not isinstance(value, str) or not _UUID.fullmatch(value):
		raise ServiceError("invalid_request")
	return value


def _json(value):
	return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def normalize_payload(payload):
	"""Canonical object shared by hashing and persistence; no scalar text changes."""
	_object(payload, ("schema_version", "source", "source_tenant_id", "source_project_id", "source_record_id", "source_record_type", "occurred_at", "summary", "outcome"), ("party", "handoff"))
	try:
		if len(_json(payload).encode("utf-8")) > 16_384:
			raise ServiceError("invalid_request")
	except (TypeError, ValueError, UnicodeError, RecursionError):
		raise ServiceError("invalid_request") from None
	if type(payload["schema_version"]) is not int or payload["schema_version"] != 1 or payload["source"] != "dodo":
		raise ServiceError("invalid_request")
	for field in ("source_tenant_id", "source_project_id", "source_record_id"):
		if not isinstance(payload[field], str) or not _ID.fullmatch(payload[field]):
			raise ServiceError("invalid_request")
	if payload["source_record_type"] not in ("voice_call", "handoff") or payload["outcome"] not in ("needs_followup", "resolved", "no_contact", "unknown"):
		raise ServiceError("invalid_request")
	result = {field: payload[field] for field in ("schema_version", "source", "source_tenant_id", "source_project_id", "source_record_id", "source_record_type", "outcome")}
	result["occurred_at"] = _timestamp(payload["occurred_at"])
	result["summary"] = _text(payload["summary"], 2000, multiline=True)
	result["party"] = None
	party = payload.get("party")
	if party is not None:
		_object(party, ("party_type", "id", "confirmed"))
		if party["party_type"] not in ("Customer", "Lead") or party["confirmed"] is not True:
			raise ServiceError("invalid_request")
		result["party"] = {"party_type": party["party_type"], "id": _text(party["id"], 140), "confirmed": True}
	result["handoff"] = None
	handoff = payload.get("handoff")
	if handoff is not None:
		_object(handoff, ("description", "priority"), ("contact_name", "contact_phone", "contact_email", "preferred_contact_window"))
		if handoff["priority"] not in ("normal", "urgent"):
			raise ServiceError("invalid_request")
		normal = {"description": _text(handoff["description"], 2000, multiline=True), "priority": handoff["priority"]}
		for field, limit in (("contact_name", 140), ("contact_email", 140), ("preferred_contact_window", 200)):
			value = handoff.get(field)
			normal[field] = None if value is None else _text(value, limit, empty=field != "contact_email")
		email = normal["contact_email"]
		if email is not None and not re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+", email):
			raise ServiceError("invalid_request")
		normal["contact_phone"] = None if handoff.get("contact_phone") is None else _phone(handoff["contact_phone"])
		result["handoff"] = normal
	if (result["outcome"] == "needs_followup" and result["handoff"] is None) or (result["outcome"] == "no_contact" and result["handoff"] is not None):
		raise ServiceError("invalid_request")
	return result


def _party_exists(party):
	if party is None:
		return
	# Types have been allowlisted; shared locks fence disable/delete until commit.
	if party["party_type"] == "Customer":
		rows = frappe.db.sql("SELECT name FROM `tabCustomer` WHERE name=%s AND disabled=0 LOCK IN SHARE MODE", (party["id"],))
	else:
		rows = frappe.db.sql("SELECT name FROM `tabLead` WHERE name=%s LOCK IN SHARE MODE", (party["id"],))
	if not rows:
		raise ServiceError("not_found")


def _existing(operation_id, *, current=False):
	# Only the collision recovery uses a locking/current read. A missing-row
	# FOR UPDATE before INSERT would introduce gap-lock upgrade deadlocks.
	return frappe.db.get_value(DOCTYPE, "dodo-" + operation_id, ["name", "operation_id", "request_hash", "receipt_json"], as_dict=True, for_update=current)


def _receipt(row):
	"""A durable receipt is not a generic DocType serialization."""
	try:
		value = json.loads(row.receipt_json)
		operation_id = _operation(row.operation_id)
		if not isinstance(row.request_hash, str) or not _HASH.fullmatch(row.request_hash):
			raise ValueError
		name = "dodo-" + operation_id
		if row.name != name or not isinstance(value, dict):
			raise ValueError
		if set(value) != {"schema_version", "source", "operation_id", "request_hash", "state", "activity", "handoff", "committed_at"}:
			raise ValueError
		expected = {"schema_version": 1, "source": "dodo", "operation_id": operation_id, "request_hash": row.request_hash, "state": "completed", "activity": {"id": name, "path": "/app/dropout-service-activity/" + name}}
		if any(type(value[key]) is not type(wanted) or value[key] != wanted for key, wanted in expected.items()):
			raise ValueError
		handoff = value["handoff"]
		if handoff is not None:
			if not isinstance(handoff, dict) or set(handoff) != {"id", "path"} or not isinstance(handoff["id"], str) or not _TODO.fullmatch(handoff["id"]):
				raise ValueError
			if handoff["path"] != "/app/todo/" + quote(handoff["id"], safe=""):
				raise ValueError
		_timestamp(value["committed_at"])
		return value
	except (AttributeError, TypeError, ValueError, KeyError, ServiceError):
		raise ServiceError("internal_error") from None


def _replay(row, request_hash):
	if row.request_hash != request_hash:
		raise ServiceError("conflict")
	return {"ok": True, "receipt": _receipt(row), "replayed": True}


def _create_todo(activity, handoff):
	# ToDo.description is HTML. Escape the caller's plain text before rendering it.
	description = "<p>" + html.escape(handoff["description"]).replace("\n", "<br>") + "</p>"
	return frappe.get_doc({
		"doctype": "ToDo", "description": description, "status": "Open",
		"priority": "High" if handoff["priority"] == "urgent" else "Medium",
		"allocated_to": None, "assigned_by": frappe.session.user,
		"reference_type": DOCTYPE, "reference_name": activity.name,
	}).insert(ignore_permissions=True)


def _rollback(savepoint):
	try:
		frappe.db.rollback(save_point=savepoint)
	except Exception:
		# MariaDB rolls the entire transaction back on deadlock, so its savepoint
		# may no longer exist. Never turn that into a partially committed request.
		frappe.db.rollback()


@frappe.whitelist(methods=["POST"])
def create_service_activity(operation_id, payload):
	savepoint = "dodo_" + uuid4().hex
	frappe.db.savepoint(savepoint)
	try:
		_authorize()
		_writable()  # Even a POST replay is forbidden while the account is locked.
		operation_id = _operation(operation_id)
		normal = normalize_payload(payload)
		request_hash = hashlib.sha256(_json(normal).encode("utf-8")).hexdigest()
		existing = _existing(operation_id)
		if existing:
			return _replay(existing, request_hash)
		_party_exists(normal["party"])
		party = normal["party"] or {}
		handoff = normal["handoff"] or {}
		activity = frappe.get_doc({
			"doctype": DOCTYPE, "operation_id": operation_id, "request_hash": request_hash,
			"source": "dodo", "source_tenant_id": normal["source_tenant_id"],
			"source_project_id": normal["source_project_id"], "source_record_id": normal["source_record_id"],
			"source_record_type": normal["source_record_type"], "occurred_at": normal["occurred_at"],
			"summary": normal["summary"], "outcome": normal["outcome"],
			"party_type": party.get("party_type"), "party": party.get("id"),
			"handoff_description": handoff.get("description"), "handoff_priority": handoff.get("priority"),
			"contact_name": handoff.get("contact_name"), "contact_phone": handoff.get("contact_phone"),
			"contact_email": handoff.get("contact_email"), "preferred_contact_window": handoff.get("preferred_contact_window"),
		})
		token = _receiver_insert.set(True)
		try:
			activity.insert(ignore_permissions=True, set_name="dodo-" + operation_id)
		except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
			_rollback(savepoint)
			frappe.clear_messages()
			# In MariaDB REPEATABLE READ, a normal SELECT can keep the old absent
			# snapshot after waiting on the winner. FOR UPDATE sees its committed row.
			existing = _existing(operation_id, current=True)
			if not existing:
				raise ServiceError("internal_error")
			return _replay(existing, request_hash)
		finally:
			_receiver_insert.reset(token)
		todo = _create_todo(activity, normal["handoff"]) if normal["handoff"] is not None else None
		if todo and not _TODO.fullmatch(todo.name):
			raise ServiceError("internal_error")
		committed_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
		receipt = {
			"schema_version": 1, "source": "dodo", "operation_id": operation_id,
			"request_hash": request_hash, "state": "completed",
			"activity": {"id": activity.name, "path": "/app/dropout-service-activity/" + activity.name},
			"handoff": {"id": todo.name, "path": "/app/todo/" + quote(todo.name, safe="")} if todo else None,
			"committed_at": committed_at,
		}
		frappe.db.set_value(DOCTYPE, activity.name, {"followup_todo": todo.name if todo else None, "committed_at": committed_at, "receipt_json": _json(receipt)}, update_modified=False)
		return {"ok": True, "receipt": _receipt(_existing(operation_id, current=True)), "replayed": False}
	except ServiceError as error:
		_rollback(savepoint)
		return _error(error.code)
	except Exception:
		_rollback(savepoint)
		return _error("internal_error")
	# No commit here: Frappe's POST lifecycle commits the entire request.


@frappe.whitelist(methods=["GET", "POST"])
def get_operation(operation_id):
	try:
		_authorize()
		row = _existing(_operation(operation_id), current=True)
		return {"ok": True, "receipt": _receipt(row)} if row else _error("not_found")
	except ServiceError as error:
		return _error(error.code)
	except Exception:
		return _error("internal_error")


@frappe.whitelist(methods=["POST"])
def party_candidates(phone):
	"""Exact phone candidates only. Never create/merge/confirm a CRM party."""
	try:
		_authorize()
		phone = _phone(phone)
		# Existing Taiwanese data may use domestic notation; no substring matching.
		phones = (phone, "0" + phone[4:]) if phone.startswith("+886") else (phone,)
		rows = frappe.db.sql(
			"""SELECT 'Customer' AS party_type, c.name AS id, c.customer_name AS display_name
			FROM `tabCustomer` c WHERE c.disabled=0 AND (
			c.mobile_no IN %(phones)s OR EXISTS (
			 SELECT 1 FROM `tabDropOut Identity` i WHERE i.party_type='Customer'
			 AND i.party=c.name AND i.channel='phone' AND i.external_id IN %(phones)s
			) OR EXISTS (
			 SELECT 1 FROM `tabDynamic Link` d JOIN `tabContact Phone` p ON p.parent=d.parent
			 WHERE d.parenttype='Contact' AND p.parenttype='Contact'
			 AND d.link_doctype='Customer' AND d.link_name=c.name AND p.phone IN %(phones)s
			)) UNION
			SELECT 'Lead' AS party_type, l.name AS id, l.lead_name AS display_name
			FROM `tabLead` l WHERE l.mobile_no IN %(phones)s OR l.phone IN %(phones)s OR EXISTS (
			 SELECT 1 FROM `tabDropOut Identity` i WHERE i.party_type='Lead'
			 AND i.party=l.name AND i.channel='phone' AND i.external_id IN %(phones)s
			) OR EXISTS (
			 SELECT 1 FROM `tabDynamic Link` d JOIN `tabContact Phone` p ON p.parent=d.parent
			 WHERE d.parenttype='Contact' AND p.parenttype='Contact'
			 AND d.link_doctype='Lead' AND d.link_name=l.name AND p.phone IN %(phones)s
			) ORDER BY party_type,id LIMIT 11""",
			{"phones": phones}, as_dict=True,
		)
		return {"ok": True, "data": [{"party_type": row.party_type, "id": row.id, "display_name": row.display_name or row.id} for row in rows[:10]], "has_more": len(rows) > 10}
	except ServiceError as error:
		return _error(error.code)
	except Exception:
		return _error("internal_error")
