"""The R2 backup bucket (any S3-compatible store), reached through the bench's own Python.

Frappe's S3 Backup Settings import boto3, so every bench already has it in
`<bench>/env/bin/python`: the toolkit stays dependency-free and reads the
bucket with the same library that wrote the backups. Credentials travel only in
the environment (BACKUP_ACCESS_KEY_ID, BACKUP_SECRET_ACCESS_KEY), never in argv
or output.
"""

import json
import os
import subprocess

KEYS = ("BACKUP_ACCESS_KEY_ID", "BACKUP_SECRET_ACCESS_KEY")

SCRIPT = r"""
import json, os, sys
import boto3
req = json.load(sys.stdin)
s3 = boto3.client("s3", endpoint_url=os.environ["BACKUP_ENDPOINT"], aws_access_key_id=os.environ["BACKUP_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["BACKUP_SECRET_ACCESS_KEY"])
bucket, op = os.environ["BACKUP_BUCKET"], req["op"]
if op == "list":
    out = []
    extra = {"Delimiter": "/"} if req.get("folders") else {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=req["prefix"], **extra):
        if extra:
            out += [p["Prefix"] for p in page.get("CommonPrefixes", [])]
        else:
            out += [{"key": o["Key"], "size": o["Size"]} for o in page.get("Contents", [])]
elif op == "get":
    s3.download_file(bucket, req["key"], req["dest"])
    out = {"ok": True}
elif op == "put":
    s3.upload_file(req["path"], bucket, req["key"])
    out = {"ok": True}
elif op == "delete":
    keys, errors = req["keys"], []
    for i in range(0, len(keys), 1000):
        res = s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in keys[i:i + 1000]], "Quiet": True})
        errors += [e["Key"] + ": " + e.get("Message", "") for e in res.get("Errors", [])]
    out = {"deleted": len(keys) - len(errors), "errors": errors}
print(json.dumps(out))
"""


class R2Error(RuntimeError):
	pass


class R2:
	def __init__(self, bucket, endpoint, python, runner=subprocess.run, environ=None):
		self.bucket, self.endpoint, self.python, self.runner = bucket, endpoint, python, runner
		self.environ = os.environ if environ is None else environ

	@classmethod
	def from_args(cls, a, runner=subprocess.run, environ=None):
		python = getattr(a, "s3_python", None) or os.path.join(a.bench_dir, "env", "bin", "python")
		return cls(getattr(a, "backup_bucket", None), getattr(a, "backup_endpoint", None), python, runner, environ)

	def missing(self):
		"""What still has to be set before the bucket can be reached, in plain words."""
		need = [] if self.bucket else ["--backup-bucket（或 BACKUP_BUCKET）"]
		need += [] if self.endpoint else ["--backup-endpoint（或 BACKUP_ENDPOINT）"]
		need += [k for k in KEYS if not self.environ.get(k)]
		return need

	def _secrets(self):
		return [self.environ[k] for k in KEYS if self.environ.get(k)]

	def _run(self, req):
		if self.missing():
			raise R2Error("R2 沒有設定：" + "、".join(self.missing()))
		env = {**self.environ, "BACKUP_BUCKET": self.bucket, "BACKUP_ENDPOINT": self.endpoint}
		try:
			res = self.runner([self.python, "-c", SCRIPT], input=json.dumps(req), env=env, text=True, capture_output=True)
		except OSError as e:
			raise R2Error(f"跑不了 {self.python}（要 bench 的 env/bin/python，或用 --s3-python 指定有 boto3 的 Python）：{e}") from e
		if res.returncode != 0:
			detail = (res.stderr or res.stdout or "").strip().splitlines()[-1:] or ["（沒有訊息）"]
			text = detail[0][-400:]
			for s in self._secrets():
				text = text.replace(s, "***")
			raise R2Error(f"R2 {req['op']} 失敗：{text}")
		lines = [ln for ln in (res.stdout or "").splitlines() if ln.strip()]
		return json.loads(lines[-1]) if lines else None

	def list(self, prefix):
		return self._run({"op": "list", "prefix": prefix})

	def folders(self, prefix=""):
		return self._run({"op": "list", "prefix": prefix, "folders": True})

	def get(self, key, dest):
		return self._run({"op": "get", "key": key, "dest": dest})

	def put(self, path, key):
		return self._run({"op": "put", "path": path, "key": key})

	def delete(self, keys):
		return self._run({"op": "delete", "keys": list(keys)}) if keys else {"deleted": 0, "errors": []}
