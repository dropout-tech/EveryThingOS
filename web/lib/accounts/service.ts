import { randomBytes } from "node:crypto";
import type { AccountDb } from "./d1";
import type { GoogleProfile } from "./google";
import { JOB_PROFILES, permissionRoles, profileByName, roleForProfile, type AccountRole } from "./profiles";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccountRecord = {
  id: string;
  company_id: string;
  email: string;
  name: string;
  google_sub: string | null;
  role: AccountRole;
  profile: string;
  enabled: number;
  created_at: string;
  last_login: string | null;
};

export type PublicAccount = {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: AccountRole;
  profile: string;
  enabled: boolean;
  roles: string[];
};

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; status: number; message: string; code?: string };

export function companyKey(site?: string | null) {
  const raw = (site ?? "").trim().toLowerCase();
  if (!raw || raw.length > 80 || !/^[a-z0-9._-]+$/.test(raw)) return "local";
  return raw;
}

export function stamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function id() {
  return randomBytes(16).toString("base64url");
}

function cleanEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return null;
  return email;
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return name || null;
}

function toPublic(row: AccountRecord): PublicAccount {
  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    name: row.name,
    role: row.role,
    profile: row.profile,
    enabled: row.enabled === 1,
    roles: permissionRoles(row.profile),
  };
}

async function byId(db: AccountDb, accountId: string) {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").bind(accountId).first<AccountRecord>();
}

async function byEmail(db: AccountDb, companyId: string, email: string) {
  return db.prepare("SELECT * FROM accounts WHERE company_id = ? AND email = ?").bind(companyId, email).first<AccountRecord>();
}

async function enabledOwners(db: AccountDb, companyId: string) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND role = 'owner' AND enabled = 1").bind(companyId).first<{ n: number }>();
  return row?.n ?? 0;
}

async function audit(db: AccountDb, companyId: string, who: string, what: string, detail: string) {
  await db.prepare("INSERT INTO audit (id, company_id, at, who, what, detail) VALUES (?, ?, ?, ?, ?, ?)").bind(id(), companyId, stamp(), who, what, detail.slice(0, 200)).run();
}

async function queueUnsent(db: AccountDb, companyId: string, to: string, kind: string, subject: string, body: string) {
  await db.prepare("INSERT INTO outbox (id, company_id, to_email, kind, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'unsent', ?)").bind(
    id(),
    companyId,
    to,
    kind,
    subject,
    body,
    new Date().toISOString(),
  ).run();
}

async function sessionExpiry(db: AccountDb, companyId: string) {
  const row = await db.prepare("SELECT session_expiry FROM security WHERE company_id = ?").bind(companyId).first<{ session_expiry: string }>();
  return row?.session_expiry ?? "08:00";
}

export async function sessionSeconds(db: AccountDb, companyId: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec((await sessionExpiry(db, companyId)).trim());
  if (!match) return 8 * 3600;
  const total = Number(match[1]) * 3600 + Number(match[2]) * 60;
  if (total < 300) return 300;
  if (total > 14 * 24 * 3600) return 14 * 24 * 3600;
  return total;
}

/** Turn a verified Google profile into this company's platform account. */
export async function acceptGoogle(db: AccountDb, input: { companyId: string; profile: GoogleProfile }): Promise<Ok<{ account: PublicAccount }> | Err> {
  const { profile } = input;
  if (!profile.emailVerified) return { ok: false, status: 403, code: "unverified", message: "這個 Google 信箱還沒驗證" };
  const existing = await byEmail(db, input.companyId, profile.email);
  if (existing && existing.enabled !== 1) return { ok: false, status: 403, code: "disabled", message: "這個帳號已停用" };
  if (existing?.google_sub && existing.google_sub !== profile.sub) return { ok: false, status: 409, message: "這個信箱已經綁了另一個 Google 帳號" };
  if (existing) {
    const last = stamp();
    await db.prepare("UPDATE accounts SET google_sub = ?, name = ?, last_login = ? WHERE id = ?").bind(profile.sub, existing.name || profile.name, last, existing.id).run();
    await audit(db, input.companyId, existing.name, "登入", profile.email);
    return { ok: true, account: toPublic({ ...existing, google_sub: profile.sub, last_login: last }) };
  }
  const allowed = (process.env.OWNER_BOOTSTRAP_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase());
  if (!allowed.includes(profile.email.toLowerCase())) return { ok: false, status: 403, code: "denied", message: "這個 Google 帳號還沒被邀請。請老闆在團隊頁邀請這個信箱。" };
  const now = new Date().toISOString();
  const created: AccountRecord = {
    id: id(),
    company_id: input.companyId,
    email: profile.email,
    name: cleanName(profile.name) ?? profile.email,
    google_sub: profile.sub,
    role: "owner",
    profile: "老闆",
    enabled: 1,
    created_at: now,
    last_login: stamp(),
  };
  try {
    await db.batch([
      db.prepare("INSERT INTO company_founders (company_id, account_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE company_id = ?)").bind(created.company_id, created.id, created.company_id),
      db.prepare("INSERT INTO accounts (id, company_id, email, name, google_sub, role, profile, enabled, created_at, last_login) SELECT ?, ?, ?, ?, ?, 'owner', '老闆', 1, ?, ? WHERE EXISTS (SELECT 1 FROM company_founders WHERE company_id = ? AND account_id = ?)").bind(created.id, created.company_id, created.email, created.name, created.google_sub, created.created_at, created.last_login, created.company_id, created.id),
    ]);
  } catch {
    return { ok: false, status: 403, code: "denied", message: "這個 Google 帳號還沒被邀請。" };
  }
  if (!(await byId(db, created.id))) return { ok: false, status: 403, code: "denied", message: "這個 Google 帳號還沒被邀請。" };
  await audit(db, input.companyId, created.name, "註冊", created.email);
  return { ok: true, account: toPublic(created) };
}

async function requireOwner(db: AccountDb, actorId: string): Promise<{ ok: true; actor: AccountRecord } | Err> {
  const actor = await byId(db, actorId);
  if (!actor || actor.enabled !== 1) return { ok: false, status: 401, message: "請先登入" };
  if (actor.role !== "owner") return { ok: false, status: 403, message: "只有老闆可以管人" };
  return { ok: true, actor };
}

export async function inviteAccount(
  db: AccountDb,
  input: { actorId: string; email: unknown; name: unknown; profile: unknown },
): Promise<Ok<{ account: PublicAccount; delivery: "unsent" }> | Err> {
  const gate = await requireOwner(db, input.actorId);
  if (!gate.ok) return gate;
  const email = cleanEmail(input.email);
  const profileName = typeof input.profile === "string" ? input.profile : "";
  const profile = profileByName(profileName);
  const name = cleanName(input.name) ?? email?.split("@")[0] ?? "";
  if (!email) return { ok: false, status: 400, message: "請填正確的 Email" };
  if (!name) return { ok: false, status: 400, message: "請填名字" };
  if (!profile) return { ok: false, status: 400, message: "請選職務" };
  if (await byEmail(db, gate.actor.company_id, email)) return { ok: false, status: 409, message: "這個信箱已經有帳號" };
  const now = new Date().toISOString();
  const row: AccountRecord = {
    id: id(),
    company_id: gate.actor.company_id,
    email,
    name,
    google_sub: null,
    role: roleForProfile(profile.name),
    profile: profile.name,
    enabled: 1,
    created_at: now,
    last_login: null,
  };
  await db.batch([
    db.prepare("INSERT INTO accounts (id, company_id, email, name, google_sub, role, profile, enabled, created_at, last_login) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, NULL)").bind(
      row.id,
      row.company_id,
      row.email,
      row.name,
      row.role,
      row.profile,
      row.created_at,
    ),
    db.prepare("INSERT INTO outbox (id, company_id, to_email, kind, subject, body, status, created_at) VALUES (?, ?, ?, 'invite', ?, ?, 'unsent', ?)").bind(
      id(),
      row.company_id,
      email,
      "邀請加入 EveryThingOS",
      `請用 Google 帳號 ${email} 登入。這封信沒有寄出。`,
      now,
    ),
  ]);
  await audit(db, row.company_id, gate.actor.name, "邀請", `${email} · ${profile.name}`);
  return { ok: true, account: toPublic(row), delivery: "unsent" };
}

export async function setAccountEnabled(db: AccountDb, input: { actorId: string; email: unknown; enabled: boolean }): Promise<Ok<{ message: string }> | Err> {
  const gate = await requireOwner(db, input.actorId);
  if (!gate.ok) return gate;
  const email = cleanEmail(input.email);
  if (!email || typeof input.enabled !== "boolean") return { ok: false, status: 400, message: "缺少人或狀態" };
  const row = await byEmail(db, gate.actor.company_id, email);
  if (!row) return { ok: false, status: 404, message: "找不到這個人" };
  if (row.id === gate.actor.id) return { ok: false, status: 400, message: "不能停用自己" };
  if (row.role === "owner" && row.enabled === 1 && !input.enabled && (await enabledOwners(db, row.company_id)) <= 1) {
    return { ok: false, status: 400, message: "公司至少要留一位老闆" };
  }
  await db.prepare("UPDATE accounts SET enabled = ? WHERE id = ?").bind(input.enabled ? 1 : 0, row.id).run();
  await audit(db, row.company_id, gate.actor.name, input.enabled ? "恢復" : "停用", email);
  return { ok: true, message: input.enabled ? "已恢復" : "已停用。他再用 Google 登入也進不來。" };
}

export async function setAccountProfile(db: AccountDb, input: { actorId: string; email: unknown; profile: unknown }): Promise<Ok<{ message: string }> | Err> {
  const gate = await requireOwner(db, input.actorId);
  if (!gate.ok) return gate;
  const email = cleanEmail(input.email);
  const profile = profileByName(typeof input.profile === "string" ? input.profile : "");
  if (!email || !profile) return { ok: false, status: 400, message: "缺少人或職務" };
  const row = await byEmail(db, gate.actor.company_id, email);
  if (!row) return { ok: false, status: 404, message: "找不到這個人" };
  const nextRole = roleForProfile(profile.name);
  if (row.role === "owner" && nextRole !== "owner" && (await enabledOwners(db, row.company_id)) <= 1) {
    return { ok: false, status: 400, message: "公司至少要留一位老闆" };
  }
  await db.prepare("UPDATE accounts SET profile = ?, role = ? WHERE id = ?").bind(profile.name, nextRole, row.id).run();
  await audit(db, row.company_id, gate.actor.name, "改職務", `${email} → ${profile.name}`);
  return { ok: true, message: "已更新職務" };
}

export async function teamFor(db: AccountDb, actorId: string) {
  const gate = await requireOwner(db, actorId);
  if (!gate.ok) return gate;
  const listed = await db.prepare("SELECT * FROM accounts WHERE company_id = ? ORDER BY created_at").bind(gate.actor.company_id).all<AccountRecord>();
  const users = listed.results ?? [];
  return {
    ok: true as const,
    team: {
      me: gate.actor.email,
      active: users.filter((user) => user.enabled === 1).length,
      users: users.map((user) => ({
        email: user.email,
        full_name: user.name,
        enabled: user.enabled,
        profile: user.profile,
        admin: user.role === "owner",
        last_login: user.last_login,
        last_active: null,
      })),
      profiles: JOB_PROFILES.map((profile) => ({ name: profile.name, note: profile.note, roles: profile.roles, admin: profile.admin })),
      security: {
        enable_two_factor_auth: 0,
        two_factor_for_everyone: 0,
        two_factor_method: null,
        enable_password_policy: 0,
        minimum_password_score: null,
        session_expiry: await sessionExpiry(db, gate.actor.company_id),
        allow_consecutive_login_attempts: null,
        deny_multiple_sessions: 0,
      },
    },
  };
}

export async function auditFor(db: AccountDb, actorId: string) {
  const gate = await requireOwner(db, actorId);
  if (!gate.ok) return gate;
  const listed = await db.prepare("SELECT at, who, what, detail FROM audit WHERE company_id = ? ORDER BY at DESC LIMIT 40").bind(gate.actor.company_id).all<{
    at: string;
    who: string;
    what: string;
    detail: string;
  }>();
  return { ok: true as const, rows: listed.results ?? [] };
}

export async function updateSessionExpiry(db: AccountDb, input: { actorId: string; session_expiry?: string; two_factor?: boolean; two_factor_method?: string }): Promise<Ok<{ message: string }> | Err> {
  const gate = await requireOwner(db, input.actorId);
  if (!gate.ok) return gate;
  if (input.two_factor !== undefined || input.two_factor_method) {
    return { ok: false, status: 400, message: "兩步驟用 Google 帳號自己的驗證。平台不另寄驗證碼。" };
  }
  const expiry = typeof input.session_expiry === "string" && /^\d{1,2}:\d{2}$/.test(input.session_expiry.trim()) ? input.session_expiry.trim() : "08:00";
  await db.prepare("INSERT INTO security (company_id, session_expiry) VALUES (?, ?) ON CONFLICT(company_id) DO UPDATE SET session_expiry = excluded.session_expiry").bind(gate.actor.company_id, expiry).run();
  await audit(db, gate.actor.company_id, gate.actor.name, "登入安全", `閒置 ${expiry}`);
  return { ok: true, message: "已更新閒置登出時間。登入仍是 Google。" };
}

export async function accountForSession(db: AccountDb, accountId: string, companyId: string) {
  const row = await byId(db, accountId);
  if (!row || row.company_id !== companyId || row.enabled !== 1) return null;
  return toPublic(row);
}

export async function outboxFor(db: AccountDb, companyId: string) {
  const listed = await db.prepare("SELECT to_email, kind, status, body FROM outbox WHERE company_id = ? ORDER BY created_at").bind(companyId).all<{
    to_email: string;
    kind: string;
    status: string;
    body: string;
  }>();
  return listed.results ?? [];
}
