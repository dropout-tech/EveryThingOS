"""A fake bench host: bench commands that keep site folders in step, and an in-memory R2 bucket reached the way r2.R2 reaches it."""

import json
import os
import shutil
from unittest import mock


class FakeHost:
	def __init__(self, bench_dir, summaries=None, fail=None, objects=None):
		self.bench_dir = bench_dir
		self.summaries = summaries or {}
		self.fail = fail
		self.bucket = dict(objects or {})
		self.calls, self.s3, self.envs = [], [], []

	def site_dir(self, site):
		return os.path.join(self.bench_dir, "sites", site)

	def __call__(self, argv, cwd=None, text=None, capture_output=None, input=None, env=None, **kw):
		if len(argv) > 1 and argv[1] == "-c":
			return self._s3(argv, json.loads(input), env)
		self.calls.append(argv)
		cmd = argv[1:]
		if self.fail and self.fail in cmd:
			return mock.Mock(returncode=1, stdout="", stderr=f"boom {self.fail} " + " ".join(cmd))
		out = ""
		if cmd[0] == "new-site":
			os.makedirs(self.site_dir(cmd[1]))
			with open(os.path.join(self.site_dir(cmd[1]), "site_config.json"), "w") as fh:
				json.dump({"db_name": "_new", "db_password": "new-db-pw"}, fh)
		elif cmd[0] == "drop-site":
			archive = cmd[cmd.index("--archived-sites-path") + 1] if "--archived-sites-path" in cmd else os.path.join(self.bench_dir, "archived", "sites")
			os.makedirs(archive, exist_ok=True)
			shutil.move(self.site_dir(cmd[1]), os.path.join(archive, cmd[1]))
		elif "execute" in cmd:
			site = cmd[cmd.index("--site") + 1]
			out = "noise\n" + json.dumps(self.summaries.get(site, {"counts": {"Customer": 1}, "issues": 0})) + "\n"
		elif "backup" in cmd:
			site = cmd[cmd.index("--site") + 1]
			folder = os.path.join(self.site_dir(site), "private", "backups")
			os.makedirs(folder, exist_ok=True)
			slug = site.replace(".", "_")
			for suffix in ("database.sql.gz", "files.tar", "private-files.tar", "site_config_backup.json"):
				with open(os.path.join(folder, f"20261231_235959-{slug}-{suffix}"), "w") as fh:
					fh.write("x")
		return mock.Mock(returncode=0, stdout=out, stderr="")

	def _s3(self, argv, req, env):
		self.s3.append(req)
		self.envs.append((argv, env))
		if self.fail and self.fail == f"s3:{req['op']}":
			return mock.Mock(returncode=1, stdout="", stderr=f"Traceback\nbotocore.exceptions.ClientError: AccessDenied {env.get('BACKUP_SECRET_ACCESS_KEY')}")
		op = req["op"]
		if op == "list" and req.get("folders"):
			out = sorted({k[len(req["prefix"]) :].split("/")[0] + "/" for k in self.bucket if k.startswith(req["prefix"]) and "/" in k[len(req["prefix"]) :]})
			out = [req["prefix"] + f for f in out]
		elif op == "list":
			out = [{"key": k, "size": len(v)} for k, v in sorted(self.bucket.items()) if k.startswith(req["prefix"])]
		elif op == "get":
			with open(req["dest"], "w") as fh:
				fh.write(self.bucket[req["key"]])
			out = {"ok": True}
		elif op == "put":
			with open(req["path"]) as fh:
				self.bucket[req["key"]] = fh.read()
			out = {"ok": True}
		elif op == "delete":
			for k in req["keys"]:
				self.bucket.pop(k, None)
			out = {"deleted": len(req["keys"]), "errors": []}
		return mock.Mock(returncode=0, stdout=json.dumps(out) + "\n", stderr="")


R2_ENV = {"BACKUP_ACCESS_KEY_ID": "AKID-123", "BACKUP_SECRET_ACCESS_KEY": "R2-SECRET-xyz"}


def backup_set(site, stamp, encrypted=False, key="ENC-KEY-777", extra_config=None):
	"""One Frappe S3 upload: `<site>/<stamp>/<stamp>-<slug>-…`."""
	slug = site.replace(".", "_")
	enc = "-enc" if encrypted else ""
	config = {"db_name": "_old", "db_password": "old-db-pw", "encryption_key": "FERNET-KEY", **(extra_config or {})}
	if encrypted:
		config["backup_encryption_key"] = key
	return {
		f"{site}/{stamp}/{stamp}-{slug}-database{enc}.sql.gz": "db",
		f"{site}/{stamp}/{stamp}-{slug}-files{enc}.tar": "pub",
		f"{site}/{stamp}/{stamp}-{slug}-private-files{enc}.tar": "priv",
		f"{site}/{stamp}/{stamp}-{slug}-site_config_backup{enc}.json": json.dumps(config),
	}
