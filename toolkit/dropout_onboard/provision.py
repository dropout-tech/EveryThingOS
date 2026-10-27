"""開新公司. Every step is an upstream command (bench) or an upstream API
(Chatwoot Platform API, Vexa admin API, the DropOut glue admin API). Steps are
idempotent, so a failed run is fixed by running it again."""

import json
import os
import re
import secrets
import shlex
import subprocess
import urllib.parse
import urllib.request
from datetime import date, timedelta

from dropout_onboard.plan import plan


class Step:
	def __init__(self, label, run, describe):
		self.label, self.run, self.describe = label, run, describe


def _http(method, url, headers=None, body=None):
	data = json.dumps(body).encode() if body is not None else None
	req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
	with urllib.request.urlopen(req, timeout=30) as res:
		text = res.read().decode()
		return json.loads(text) if text else None


def abbr_for(name):
	ascii_part = re.sub(r"[^A-Za-z]", "", name).upper()
	return (ascii_part[:4] or "CO") + secrets.token_hex(1).upper()


class Provisioner:
	def __init__(self, args, out=print):
		self.a = args
		self.out = out
		self.plan = plan(args.profile)
		self.state = {}
		self.state_path = os.path.join(args.state_dir, f"{args.site}.json")
		if os.path.exists(self.state_path):
			with open(self.state_path, encoding="utf-8") as fh:
				self.state = json.load(fh)

	def save(self):
		os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
		with open(self.state_path, "w", encoding="utf-8") as fh:
			json.dump(self.state, fh, indent=1, ensure_ascii=False)
		os.chmod(self.state_path, 0o600)

	def bench(self, *cmd, capture=False):
		full = [self.a.bench, *cmd]
		res = subprocess.run(full, cwd=self.a.bench_dir, text=True, capture_output=True)
		if res.returncode != 0:
			raise SystemExit(f"失敗：{shlex.join(full)}\n{res.stdout[-2000:]}\n{res.stderr[-2000:]}")
		return res.stdout if capture else None

	def execute(self, method, **kwargs):
		out = self.bench("--site", self.a.site, "execute", method, "--kwargs", json.dumps(kwargs, ensure_ascii=False), capture=True)
		lines = [ln for ln in out.strip().splitlines() if ln.strip()]
		try:
			return json.loads(lines[-1]) if lines else None
		except json.JSONDecodeError:
			return lines[-1]

	def site_exists(self):
		return os.path.isdir(os.path.join(self.a.bench_dir, "sites", self.a.site))

	def steps(self):
		a, p = self.a, self.plan
		company = a.company
		steps = [
			Step("建站", self._new_site, f"bench new-site {a.site} --install-app erpnext"),
			Step("裝 app", self._install_apps, f"bench --site {a.site} install-app {' '.join(p['apps'][1:])}"),
			Step("設定精靈", lambda: self.execute("dropout_core.provisioning.complete_setup", company_name=company, company_abbr=a.abbr or abbr_for(company), admin_email=a.admin_email), f"公司「{company}」、台灣、新台幣、Asia/Taipei"),
			Step("同步帳號", self._integration_user, "建 glue 使用者與 API key"),
		]
		if a.shell_url:
			steps.append(Step("殼登入", self._shell_login, f"ERPNext OAuth Client「EveryThingOS」，轉回 {a.shell_url}/api/auth/callback"))
		if a.glue_url:
			steps.append(Step("登記到膠水", self._register_glue, f"PUT {a.glue_url}/admin/tenants/{a.site} 與 /admin/accounts/{a.site}（{self._contract_text()}）；ERPNext Webhook 指向膠水"))
		if getattr(a, "backup_bucket", None):
			steps.append(Step("每日備份", self._backups, f"ERPNext S3 Backup Settings → {a.backup_bucket}/{a.site}/"))
		if a.chatwoot_url and a.chatwoot_platform_token and p["chat"]:
			steps.append(Step("對話帳號", self._chatwoot, f"Chatwoot 建帳戶「{company}」、管理員、Webhook"))
		if a.vexa_url and a.vexa_admin_token and (p["meetings"] or a.calendars):
			steps.append(Step("會議機器人", self._vexa, "Vexa 建使用者與 API key、設定 Webhook"))
		return steps

	def run(self, apply=False):
		self.out(f"方案：{', '.join(self.plan['apps'])}")
		for i, step in enumerate(self.steps(), 1):
			done = self.state.get("done", {}).get(step.label)
			mark = "✓" if done else " "
			self.out(f"{i}. [{mark}] {step.label}：{step.describe}")
			if apply and not done:
				result = step.run()
				self.state.setdefault("done", {})[step.label] = True
				if result is not None:
					self.state.setdefault("results", {})[step.label] = result if not isinstance(result, dict) or "api_secret" not in result else {"user": result.get("user")}
				self.save()
		if not apply:
			self.out("（預演。加 --apply 才會真的執行）")
		else:
			if self.a.shell_url and self.a.glue_url:
				self.out(f"共用殼：{self.a.shell_url} 已登記到這家公司，不用另外設環境變數。")
			self.out("（只服務這家公司的殼才需要）環境變數：")
			for key, value in self.shell_env().items():
				self.out(f"  {key}={value}")
		return self.state

	def _new_site(self):
		if self.site_exists():
			return "exists"
		self.bench("new-site", self.a.site, "--admin-password", self.a.admin_password, "--db-root-password", self.a.db_root_password, "--install-app", "erpnext")

	def _install_apps(self):
		installed = self.bench("--site", self.a.site, "list-apps", capture=True)
		for app in self.plan["apps"][1:]:
			if not re.search(rf"^{re.escape(app)}\b", installed, re.M):
				self.bench("--site", self.a.site, "install-app", app)

	def _integration_user(self):
		keys = self.execute("dropout_core.provisioning.create_integration_user")
		self.state["erpnext_key"], self.state["erpnext_secret"] = keys["api_key"], keys["api_secret"]
		self.save()
		return keys

	def _shell_login(self):
		client = self.execute("dropout_core.provisioning.create_oauth_client", redirect_uri=f"{self.a.shell_url.rstrip('/')}/api/auth/callback")
		self.state["shell_oauth_client_id"] = client["client_id"]
		self.state["shell_oauth_client_secret"] = client.get("client_secret")
		self.save()
		return {"client_id": client["client_id"]}

	def _contract_text(self):
		if getattr(self.a, "renews_on", None):
			return f"年約到 {self.a.renews_on}"
		return f"試用 {getattr(self.a, 'trial_days', 30)} 天"

	def _account(self):
		"""Contract and host for the shared shell. Dates are only set the first time, so a re-run never resets a trial."""
		account = {
			"company": self.a.company,
			"contact_email": self.a.admin_email,
			"profile": self.a.profile if isinstance(self.a.profile, dict) else None,
		}
		if self.a.shell_url:
			account["hosts"] = [urllib.parse.urlparse(self.a.shell_url).hostname]
		if not self.state.get("account_registered"):
			if getattr(self.a, "renews_on", None):
				account["renews_on"] = self.a.renews_on
			else:
				account["trial_ends"] = (date.today() + timedelta(days=int(getattr(self.a, "trial_days", 30)))).isoformat()
		return account

	def _backups(self):
		return self.execute(
			"dropout_core.provisioning.configure_backups",
			bucket=self.a.backup_bucket,
			endpoint_url=self.a.backup_endpoint,
			access_key_id=os.environ["BACKUP_ACCESS_KEY_ID"],
			secret_access_key=os.environ["BACKUP_SECRET_ACCESS_KEY"],
			notify_email=self.a.admin_email,
		)

	def shell_env(self):
		"""Worker vars and secrets for a shell that serves only this company (`wrangler secret put`).
		The shared shell needs none of these: it finds the company by host name in the glue."""
		env = {"ERPNEXT_URL": self.a.erpnext_url, "ERPNEXT_SITE": self.a.site}
		if self.state.get("shell_oauth_client_id"):
			env["ERPNEXT_OAUTH_CLIENT_ID"] = self.state["shell_oauth_client_id"]
			env["SESSION_SECRET"] = "（openssl rand -base64 32）"
		if self.a.glue_url:
			env.update({"GLUE_URL": self.a.glue_url, "GLUE_SITE": self.a.site, "GLUE_ADMIN_TOKEN": "（同膠水的 ADMIN_TOKEN）"})
		if self.state.get("chatwoot_account_id"):
			env.update({"CHATWOOT_URL": self.a.chatwoot_url, "CHATWOOT_ACCOUNT_ID": str(self.state["chatwoot_account_id"]), "CHATWOOT_PLATFORM_TOKEN": "（Chatwoot Platform App token）"})
		return {k: v for k, v in env.items() if v}

	def _register_glue(self):
		self.state.setdefault("erpnext_webhook_secret", secrets.token_urlsafe(32))
		self.state.setdefault("unsubscribe_secret", secrets.token_urlsafe(32))
		self.state.setdefault("chatwoot_path_token", secrets.token_urlsafe(24))
		self.state.setdefault("vexa_webhook_token", secrets.token_urlsafe(24))
		self.save()
		tenant = {
			"site": self.a.site,
			"erpnext_url": self.a.erpnext_url,
			"erpnext_key": self.state["erpnext_key"],
			"erpnext_secret": self.state["erpnext_secret"],
			"erpnext_webhook_secret": self.state["erpnext_webhook_secret"],
			"unsubscribe_secret": self.state["unsubscribe_secret"],
			"chatwoot_path_token": self.state["chatwoot_path_token"],
			**({"shell_oauth_client_id": self.state["shell_oauth_client_id"], "shell_oauth_client_secret": self.state.get("shell_oauth_client_secret")} if self.state.get("shell_oauth_client_id") else {}),
			**({"mail_from": self.a.mail_from} if self.a.mail_from else {}),
			**{k: v for k, v in self.state.get("tenant_extra", {}).items()},
		}
		auth = {"authorization": f"Bearer {self.a.glue_admin_token}", "x-actor": "dropout-onboard"}
		_http("PUT", f"{self.a.glue_url}/admin/tenants/{self.a.site}", auth, tenant)
		_http("PUT", f"{self.a.glue_url}/admin/accounts/{self.a.site}", auth, self._account())
		self.state["account_registered"] = True
		self.save()
		self.execute("dropout_core.install.configure_glue", url=self.a.glue_url, secret=self.state["erpnext_webhook_secret"])

	def _chatwoot(self):
		base, headers = self.a.chatwoot_url, {"api_access_token": self.a.chatwoot_platform_token}
		if "chatwoot_account_id" not in self.state:
			account = _http("POST", f"{base}/platform/api/v1/accounts", headers, {"name": self.a.company, "locale": "zh_TW"})
			self.state["chatwoot_account_id"] = account["id"]
			self.save()
		if "chatwoot_user_token" not in self.state:
			password = secrets.token_urlsafe(12) + "A1!"
			user = _http("POST", f"{base}/platform/api/v1/users", headers, {"name": self.a.company, "email": self.a.admin_email, "password": password, "custom_attributes": {"site": self.a.site}})
			_http("POST", f"{base}/platform/api/v1/accounts/{self.state['chatwoot_account_id']}/account_users", headers, {"user_id": user["id"], "role": "administrator"})
			self.state.update({"chatwoot_user_id": user["id"], "chatwoot_user_token": user["access_token"]})
			self.save()
		self.execute("dropout_core.provisioning.link_chatwoot_user", email=self.a.admin_email, chatwoot_user_id=self.state["chatwoot_user_id"])
		if self.a.glue_url and "chatwoot_webhook" not in self.state:
			hook = _http(
				"POST",
				f"{base}/api/v1/accounts/{self.state['chatwoot_account_id']}/webhooks",
				{"api_access_token": self.state["chatwoot_user_token"]},
				{"webhook": {"url": f"{self.a.glue_url}/chatwoot/{self.a.site}/{self.state['chatwoot_path_token']}", "subscriptions": ["conversation_created", "message_created"]}},
			)
			self.state["chatwoot_webhook"] = hook.get("payload", hook).get("webhook", {}).get("id", True) if isinstance(hook, dict) else True
		self.state.setdefault("tenant_extra", {}).update({"chatwoot_url": base, "chatwoot_account_id": self.state["chatwoot_account_id"], "chatwoot_token": self.state["chatwoot_user_token"]})
		self.save()
		if self.a.glue_url:
			self._register_glue()
		return {"account_id": self.state["chatwoot_account_id"]}

	def _vexa(self):
		base, headers = self.a.vexa_url, {"X-Admin-API-Key": self.a.vexa_admin_token}
		if "vexa_api_key" not in self.state:
			user = _http("POST", f"{base}/admin/users", headers, {"email": self.a.admin_email, "name": self.a.company})
			token = _http("POST", f"{base}/admin/users/{user['id']}/tokens", headers)
			self.state["vexa_api_key"] = token["token"]
			self.save()
		self.state.setdefault("vexa_webhook_token", secrets.token_urlsafe(24))
		if self.a.glue_url:
			_http("PUT", f"{base}/user/webhook", {"X-API-Key": self.state["vexa_api_key"]}, {"webhook_url": f"{self.a.glue_url}/vexa/{self.a.site}/{self.state['vexa_webhook_token']}"})
		self.state.setdefault("tenant_extra", {})["vexa"] = {"url": base, "api_key": self.state["vexa_api_key"], "webhook_token": self.state["vexa_webhook_token"], "bot_name": f"{self.a.company} 會議紀錄"}
		if self.a.calendars:
			self.state["tenant_extra"]["calendars"] = self.a.calendars
		self.save()
		if self.a.glue_url:
			self._register_glue()
		return {"vexa": "ok"}
