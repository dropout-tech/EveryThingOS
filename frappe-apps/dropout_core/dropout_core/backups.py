"""This site's newest backup, locally and in R2, for the glue's daily freshness
check and the owner's 設定 page.

Only reads what Frappe itself wrote: the local backup folder and the bucket in
S3 Backup Settings. Frappe's S3 job mails its errors instead of raising, so the
bucket listing is the only reliable sign that last night's upload happened.
"""

import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import frappe
from frappe.utils import cint, get_system_timezone, now_datetime

ADMIN = "System Manager"
INTEGRATION = "DropOut Integration"
CACHE_KEY = "dropout_backup_status"
CACHE_SECONDS = 1800
# `<YYYYmmdd_HHMMSS>-<site_slug>[-partial]-database[-enc].sql.gz`, in the system time zone.
DB = re.compile(r"^(\d{8}_\d{6})-.+-database(-enc)?\.sql(\.gz)?$")
STAMP = re.compile(r"^\d{8}_\d{6}$")


def _iso(stamp):
	"""Frappe names backups by local wall time; the glue compares in UTC."""
	return datetime.strptime(stamp, "%Y%m%d_%H%M%S").replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat()


def local():
	from frappe.utils.backups import get_backup_path

	folder = get_backup_path()
	try:
		names = os.listdir(folder)
	except OSError:
		return None
	dbs = sorted(n for n in names if DB.match(n))
	if not dbs:
		return None
	stamp = DB.match(dbs[-1]).group(1)
	files = [n for n in names if n.startswith(stamp + "-")]
	return {
		"taken_at": _iso(stamp),
		"bytes": sum(os.path.getsize(os.path.join(folder, n)) for n in files),
		"files": len(files),
		"encrypted": "-enc" in dbs[-1],
	}


def offsite():
	s = frappe.get_single("S3 Backup Settings")
	if not cint(s.enabled):
		return {"enabled": False}
	out = {"enabled": True, "bucket": s.bucket, "path": s.backup_path or "", "frequency": s.frequency, "with_files": bool(cint(s.backup_files))}
	try:
		import boto3

		conn = boto3.client(
			"s3",
			aws_access_key_id=s.access_key_id,
			aws_secret_access_key=s.get_password("secret_access_key"),
			endpoint_url=s.endpoint_url or "https://s3.amazonaws.com",
		)
		sets = {}
		for page in conn.get_paginator("list_objects_v2").paginate(Bucket=s.bucket, Prefix=out["path"]):
			for obj in page.get("Contents", []):
				parts = obj["Key"][len(out["path"]) :].split("/")
				if len(parts) != 2 or not STAMP.match(parts[0]):
					continue
				entry = sets.setdefault(parts[0], {"bytes": 0, "files": 0, "database": False})
				entry["bytes"] += obj["Size"]
				entry["files"] += 1
				entry["database"] = entry["database"] or bool(DB.match(parts[1]))
		complete = sorted(k for k, v in sets.items() if v["database"])
		if complete:
			newest = sets[complete[-1]]
			out.update(taken_at=_iso(complete[-1]), bytes=newest["bytes"], files=newest["files"], sets=len(complete))
		else:
			out.update(taken_at=None, sets=0)
	except Exception as e:
		out["error"] = str(e)[:300]
	return out


def read(refresh=False):
	cached = None if refresh else frappe.cache.get_value(CACHE_KEY)
	if cached:
		return cached
	result = {
		"checked_at": now_datetime().replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat(),
		"local": local(),
		"offsite": offsite(),
		"encrypted": bool(cint(frappe.get_system_settings("encrypt_backup"))),
	}
	frappe.cache.set_value(CACHE_KEY, result, expires_in_sec=CACHE_SECONDS)
	return result


@frappe.whitelist()
def status(refresh=0):
	"""The owner (System Manager) and the glue's integration user only: it names the bucket."""
	if not ({ADMIN, INTEGRATION} & set(frappe.get_roles())):
		raise frappe.PermissionError
	return read(refresh=cint(refresh))
