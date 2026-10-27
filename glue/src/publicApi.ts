import { lifecycle } from "./accounts";
import { D1ApiStore, type ApiKey, type ApiStore, type Scope } from "./apiStore";
import type { App, Env } from "./app";
import { ERPNext, UpstreamError } from "./clients";
import { safeEqual, sha256Hex, toHex } from "./crypto";
import type { Store, Tenant } from "./store";
import { manageWebhooks } from "./webhooks";

export const KEY_PREFIX = "dok_live_";
export const MAX_KEYS = 10;
export const RATE_LIMIT = 120;
export const RATE_WINDOW_MS = 60_000;
export const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;
const MAX_BODY = 16_384;
const TOUCH_EVERY_MS = 60_000;
const KEY_PATTERN = /^dok_live_[0-9a-f]{48}$/;

/** D1 in production; tests inject their own. Undefined when the Worker has no database bound. */
export function apiStoreFor(env: Env, app: Pick<App, "api">): ApiStore | undefined {
  if (app.api) return app.api(env);
  return env.DB ? new D1ApiStore(env.DB, env.TENANT_KEY) : undefined;
}

const windows = new Map<string, { start: number; count: number }>();

/**
 * Fallback when the Workers Rate Limiting binding is not bound (local dev,
 * tests). Per isolate, so it only bounds bursts; production uses API_LIMIT.
 */
export function fixedWindow(key: string, now = Date.now(), limit = RATE_LIMIT) {
  const start = now - (now % RATE_WINDOW_MS);
  const w = windows.get(key);
  if (!w || w.start !== start) {
    if (windows.size > 10_000) windows.clear();
    windows.set(key, { start, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= limit;
}

async function underLimit(env: Env, key: string) {
  if (!env.API_LIMIT) return fixedWindow(key);
  try {
    return (await env.API_LIMIT.limit({ key })).success;
  } catch {
    return true;
  }
}

type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "insufficient_scope"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "idempotency_key_reused"
  | "erpnext_rejected"
  | "account_locked"
  | "rate_limited"
  | "erpnext_unavailable"
  | "erpnext_error"
  | "not_configured";

class ApiError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const invalid = (message: string, field?: string) => new ApiError(400, "invalid_request", message, field ? { field } : {});

function respond(requestId: string, data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": requestId, ...headers } });
}

function errorResponse(requestId: string, e: ApiError) {
  const headers: Record<string, string> = {};
  if (e.status === 429) headers["retry-after"] = String(Math.ceil(RATE_WINDOW_MS / 1000));
  if (e.status === 401) headers["www-authenticate"] = 'Bearer realm="EveryThingOS"';
  if (e.status === 405 && typeof e.extra.allow === "string") headers.allow = e.extra.allow;
  const { allow: _allow, ...extra } = e.extra;
  return respond(requestId, { error: { code: e.code, message: e.message, request_id: requestId, ...extra } }, e.status, headers);
}

/** ERPNext's own error text can hold tracebacks; only the status leaves the glue. */
function upstream(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof UpstreamError) {
    if (e.status === 0 || e.status >= 500 || e.status === 429) return new ApiError(502, "erpnext_unavailable", "ERPNext 暫時連不到，請稍後再試");
    if (e.status === 404) return new ApiError(404, "not_found", "找不到");
    if (e.status === 409) return new ApiError(409, "conflict", "ERPNext 已經有同樣的資料");
    if (e.status === 401 || e.status === 403) return new ApiError(502, "erpnext_error", "DropOut 的整合帳號在 ERPNext 沒有權限，請聯絡 DropOut");
    return new ApiError(422, "erpnext_rejected", "ERPNext 不接受這筆資料");
  }
  return new ApiError(502, "erpnext_error", "ERPNext 回應看不懂，請稍後再試");
}

// ---------- query validation ----------

type FilterFn = (value: string) => unknown[];

const text = (field: string, max: number): FilterFn => (v) => {
  if (!v || v.length > max || /[\u0000-\u001f]/.test(v)) throw invalid(`${field} 要是 1–${max} 個字`, field);
  return [field, "=", v];
};

const search = (field: string): FilterFn => (v) => {
  const q = v.replace(/[%_\\]/g, "").trim();
  if (!q || q.length > 100 || /[\u0000-\u001f]/.test(q)) throw invalid("q 要是 1–100 個字", "q");
  return [field, "like", `%${q}%`];
};

const oneOf = (field: string, values: readonly string[]): FilterFn => (v) => {
  if (!values.includes(v)) throw invalid(`${field} 只能是：${values.join("、")}`, field);
  return [field, "=", v];
};

/** ISO 8601 date or datetime. No offset means Taiwan time, which is how ERPNext stores it. */
export function taipeiDatetime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?([zZ]|[+-]\d{2}:\d{2})?$/.test(value)) return null;
  const hasZone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const base = value.length === 10 ? `${value}T00:00:00` : value.replace(" ", "T");
  const d = new Date(hasZone ? base : `${base}+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
}

const modifiedSince: FilterFn = (v) => {
  const at = taipeiDatetime(v);
  if (!at) throw invalid("modified_since 要是 ISO 8601 時間，例如 2026-10-01T00:00:00+08:00", "modified_since");
  return ["modified", ">=", at];
};

const taxId: FilterFn = (v) => {
  if (!/^\d{8}$/.test(v)) throw invalid("tax_id 要是 8 位數字", "tax_id");
  return ["tax_id", "=", v];
};

type Resource = { doctype: string; fields: readonly string[]; filters: Record<string, FilterFn>; base?: unknown[][] };

const SO_STATUS = ["Draft", "On Hold", "To Deliver and Bill", "To Bill", "To Deliver", "Completed", "Cancelled", "Closed"] as const;
const SI_STATUS = ["Draft", "Return", "Credit Note Issued", "Submitted", "Paid", "Partly Paid", "Unpaid", "Overdue", "Cancelled"] as const;

export const RESOURCES: Record<string, Resource> = {
  customers: {
    doctype: "Customer",
    fields: ["name", "customer_name", "customer_type", "customer_group", "territory", "tax_id", "email_id", "mobile_no", "disabled", "creation", "modified"],
    filters: { q: search("customer_name"), tax_id: taxId, modified_since: modifiedSince },
  },
  items: {
    doctype: "Item",
    fields: ["name", "item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "disabled", "description", "modified"],
    filters: { q: search("item_name"), item_group: text("item_group", 140), modified_since: modifiedSince },
  },
  "sales-orders": {
    doctype: "Sales Order",
    fields: ["name", "customer", "customer_name", "transaction_date", "delivery_date", "grand_total", "currency", "status", "per_delivered", "per_billed", "docstatus", "modified"],
    filters: { customer: text("customer", 140), status: oneOf("status", SO_STATUS), modified_since: modifiedSince },
  },
  invoices: {
    doctype: "Sales Invoice",
    fields: ["name", "customer", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "currency", "status", "is_return", "dropout_einvoice_number", "docstatus", "modified"],
    filters: { customer: text("customer", 140), status: oneOf("status", SI_STATUS), modified_since: modifiedSince },
  },
};

function int(raw: string | null, field: string, min: number, max: number, fallback: number) {
  if (raw === null) return fallback;
  if (!/^\d{1,6}$/.test(raw)) throw invalid(`${field} 要是 ${min}–${max} 的整數`, field);
  const n = Number(raw);
  if (n < min || n > max) throw invalid(`${field} 要是 ${min}–${max} 的整數`, field);
  return n;
}

export function listQuery(r: Resource, params: URLSearchParams) {
  const allowed = new Set(["limit", "offset", "order", ...Object.keys(r.filters)]);
  for (const k of new Set(params.keys())) {
    if (!allowed.has(k)) throw invalid(`不認得的參數 ${k}；可以用：${[...allowed].join("、")}`, k);
    if (params.getAll(k).length > 1) throw invalid(`參數 ${k} 只能給一次`, k);
  }
  const limit = int(params.get("limit"), "limit", 1, MAX_LIMIT, 20);
  const offset = int(params.get("offset"), "offset", 0, MAX_OFFSET, 0);
  const order = params.get("order") ?? "-modified";
  if (order !== "modified" && order !== "-modified") throw invalid("order 只能是 modified 或 -modified", "order");
  const filters = [...(r.base ?? [])];
  for (const [k, fn] of Object.entries(r.filters)) {
    const v = params.get(k);
    if (v !== null) filters.push(fn(v));
  }
  return { limit, offset, filters, orderBy: order === "modified" ? "modified asc" : "modified desc" };
}

const out = (row: Record<string, unknown>) => {
  const { name, ...rest } = row;
  return { id: name, ...rest };
};

// ---------- write validation ----------

type Rule = { required?: boolean; max: number; pattern?: RegExp; message?: string; values?: readonly string[] };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^[0-9+\-() ]{6,30}$/;

export const WRITES: Record<string, { method: string; rules: Record<string, Rule> }> = {
  customers: {
    method: "dropout_core.public_api.create_customer",
    rules: {
      customer_name: { required: true, max: 140 },
      customer_type: { max: 20, values: ["Company", "Individual"] },
      tax_id: { max: 8, pattern: /^\d{8}$/, message: "tax_id 要是 8 位數字" },
      email: { max: 140, pattern: EMAIL, message: "email 格式不對" },
      phone: { max: 30, pattern: PHONE, message: "phone 只能有數字、+、-、括號和空白" },
    },
  },
  leads: {
    method: "dropout_core.actions.create_lead",
    rules: {
      name: { max: 140 },
      email: { max: 140, pattern: EMAIL, message: "email 格式不對" },
      phone: { max: 30, pattern: PHONE, message: "phone 只能有數字、+、-、括號和空白" },
      company_name: { max: 140 },
      notes: { max: 2000 },
    },
  },
};

export function validateBody(rules: Record<string, Rule>, body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("內容要是 JSON 物件");
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const rule = rules[k];
    if (!rule) throw invalid(`不認得的欄位 ${k}；可以用：${Object.keys(rules).join("、")}`, k);
    if (v === null || v === undefined) continue;
    if (typeof v !== "string") throw invalid(`${k} 要是文字`, k);
    const s = v.trim();
    if (!s) continue;
    if (s.length > rule.max || (k !== "notes" && /[\u0000-\u001f]/.test(s))) throw invalid(`${k} 最多 ${rule.max} 個字`, k);
    if (rule.pattern && !rule.pattern.test(s)) throw invalid(rule.message ?? `${k} 格式不對`, k);
    if (rule.values && !rule.values.includes(s)) throw invalid(`${k} 只能是：${rule.values.join("、")}`, k);
    clean[k] = k === "email" ? s.toLowerCase() : s;
  }
  for (const [k, rule] of Object.entries(rules)) if (rule.required && !clean[k]) throw invalid(`缺少 ${k}`, k);
  return clean;
}

async function readBody(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw invalid("Content-Type 要是 application/json");
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw invalid(`內容不能超過 ${MAX_BODY} 個字元`);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw invalid("內容不是合法的 JSON");
  }
}

// ---------- auth ----------

export function bearer(req: Request) {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

async function authenticate(req: Request, env: Env, api: ApiStore): Promise<ApiKey> {
  const token = bearer(req);
  const hash = KEY_PATTERN.test(token) ? await sha256Hex(token) : null;
  const key = hash ? await api.keyByHash(hash) : null;
  if (key && hash && !key.revoked_at && safeEqual(key.hash, hash)) return key;
  if (!(await underLimit(env, `auth-fail:${req.headers.get("cf-connecting-ip") ?? "unknown"}`))) throw new ApiError(429, "rate_limited", "失敗太多次，請一分鐘後再試");
  throw new ApiError(401, "unauthorized", token ? "API 金鑰不對或已經停用" : "缺少 API 金鑰：Authorization: Bearer dok_live_…");
}

function requireScope(key: ApiKey, scope: Scope) {
  if (!key.scopes.includes(scope)) throw new ApiError(403, "insufficient_scope", `這把金鑰沒有 ${scope} 權限`);
}

async function requireWritable(store: Store, site: string) {
  const account = await store.getAccount(site);
  if (!account) return;
  const l = lifecycle(account);
  if (!l.writable) throw new ApiError(423, "account_locked", l.message || "這家公司目前只能看，不能新增或修改", { stage: l.stage });
}

const IDEMPOTENCY = /^[A-Za-z0-9_.:-]{8,100}$/;

async function create(req: Request, resource: string, erp: ERPNext, store: Store, key: ApiKey) {
  const write = WRITES[resource];
  const args = validateBody(write.rules, await readBody(req));
  if (resource === "leads" && !args.name && !args.email && !args.phone) throw invalid("name、email、phone 至少要填一個");
  const idem = req.headers.get("idempotency-key");
  if (idem !== null && !IDEMPOTENCY.test(idem)) throw invalid("Idempotency-Key 要是 8–100 個英數字、底線、點、冒號或連字號", "Idempotency-Key");
  const claim = idem ? `idem:${key.site}:${key.id}:${resource}:${idem}` : null;
  if (claim && !(await store.claim(claim))) throw new ApiError(409, "idempotency_key_reused", "這個 Idempotency-Key 已經用過了");
  let result: Record<string, any>;
  try {
    result = await erp.method<Record<string, any>>(write.method, args);
  } catch (e) {
    if (claim) await store.release(claim);
    throw upstream(e);
  }
  if (!result?.ok) {
    if (claim) await store.release(claim);
    if (result?.conflict) throw new ApiError(409, "conflict", String(result.message ?? "已經有這筆資料").slice(0, 300), { existing_id: result.customer ?? null });
    throw new ApiError(422, "erpnext_rejected", String(result?.message ?? "ERPNext 不接受這筆資料").slice(0, 300));
  }
  if (resource === "customers") return { status: 201, body: { data: out(result.customer ?? {}) } };
  return { status: result.existing ? 200 : 201, body: { data: { id: result.party, party_type: result.party_type, existing: Boolean(result.existing) } } };
}

/** `/v1/*`: the company comes from the API key, never from the request. */
export async function publicApi(req: Request, env: Env, app: App): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const api = apiStoreFor(env, app);
    if (!api) throw new ApiError(503, "not_configured", "對外 API 還沒設定好");
    const store = app.store(env);
    const key = await authenticate(req, env, api);
    if (!(await underLimit(env, `key:${key.id}`))) throw new ApiError(429, "rate_limited", `每把金鑰每分鐘最多 ${RATE_LIMIT} 次，請稍後再試`);
    const now = Date.now();
    if (!key.last_used_at || now - Date.parse(key.last_used_at) > TOUCH_EVERY_MS) await api.touchKey(key.id, new Date(now).toISOString());

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const resource = parts[1] ?? "";
    if (parts.length !== 2 || (!RESOURCES[resource] && !WRITES[resource])) throw new ApiError(404, "not_found", "沒有這個 API；請看 docs/PUBLIC-API.md");
    const allow = [RESOURCES[resource] ? "GET" : "", WRITES[resource] ? "POST" : ""].filter(Boolean).join(", ");
    const tenant: Tenant | null = await store.getTenant(key.site);
    if (!tenant) throw new ApiError(503, "not_configured", "這家公司的 ERPNext 還沒接上");
    const erp = new ERPNext(tenant, app.fetcher);

    if (req.method === "GET" && RESOURCES[resource]) {
      requireScope(key, "read");
      const r = RESOURCES[resource];
      const q = listQuery(r, url.searchParams);
      let rows: Record<string, unknown>[];
      try {
        rows = await erp.list(r.doctype, { fields: r.fields, filters: q.filters, orderBy: q.orderBy, start: q.offset, limit: q.limit + 1 });
      } catch (e) {
        throw upstream(e);
      }
      const more = rows.length > q.limit;
      return respond(requestId, { data: rows.slice(0, q.limit).map(out), has_more: more, next_offset: more ? q.offset + q.limit : null });
    }
    if (req.method === "POST" && WRITES[resource]) {
      requireScope(key, "write");
      await requireWritable(store, key.site);
      const r = await create(req, resource, erp, store, key);
      return respond(requestId, r.body, r.status);
    }
    throw new ApiError(405, "method_not_allowed", `這個 API 只接受 ${allow}`, { allow });
  } catch (e) {
    return errorResponse(requestId, e instanceof ApiError ? e : upstream(e));
  }
}

// ---------- management (ADMIN_TOKEN, or SHELL_TOKEN for one company) ----------

export function keyView(k: ApiKey) {
  const { hash: _hash, ...rest } = k;
  return { ...rest, display: `${k.prefix}…` };
}

/** Admin routes the shell may also use for the company it is acting for. */
export function isIntegrationRoute(parts: string[]) {
  return parts[1] === "tenants" && Boolean(parts[2]) && (parts[3] === "api-keys" || parts[3] === "webhooks");
}

export async function manageIntegrations(req: Request, env: Env, app: App, parts: string[], actor: string): Promise<Response> {
  const api = apiStoreFor(env, app);
  if (!api) return Response.json({ error: "對外 API 還沒設定好" }, { status: 503 });
  const store = app.store(env);
  const site = parts[2];
  if (parts[3] === "webhooks") return manageWebhooks(req, parts, { site, actor, api, store, fetcher: app.fetcher, glueHost: new URL(req.url).hostname });

  const id = parts[4];
  if (!id && req.method === "GET") return Response.json({ max: MAX_KEYS, keys: (await api.listKeys(site)).map(keyView) });
  if (!id && req.method === "POST") {
    if (!(await store.getTenant(site))) return Response.json({ error: "找不到這家公司" }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { label?: unknown; scopes?: unknown } | null;
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 80) : "";
    if (!label) return Response.json({ error: "請幫金鑰取個名字，例如「蝦皮同步」" }, { status: 400 });
    const scopes = Array.isArray(body?.scopes) ? [...new Set(body.scopes)] : ["read"];
    if (!scopes.length || scopes.some((s) => s !== "read" && s !== "write")) return Response.json({ error: "權限只能是 read 或 write" }, { status: 400 });
    if (scopes.includes("write") && !scopes.includes("read")) scopes.unshift("read");
    const active = (await api.listKeys(site)).filter((k) => !k.revoked_at).length;
    if (active >= MAX_KEYS) return Response.json({ error: `每家公司最多 ${MAX_KEYS} 把有效金鑰，先停用不用的` }, { status: 409 });
    const secret = `${KEY_PREFIX}${toHex(crypto.getRandomValues(new Uint8Array(24)))}`;
    const key: ApiKey = {
      id: `key_${toHex(crypto.getRandomValues(new Uint8Array(8)))}`,
      site,
      prefix: secret.slice(0, KEY_PREFIX.length + 6),
      hash: await sha256Hex(secret),
      label,
      scopes: scopes as Scope[],
      created_by: actor,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    };
    await api.addKey(key);
    await store.addAccountEvent(site, actor, "新增 API 金鑰", `${label}（${key.prefix}…，${key.scopes.join("+")}）`);
    return Response.json({ key: keyView(key), secret }, { status: 201 });
  }
  if (id && parts[5] === "revoke" && req.method === "POST") {
    if (!(await api.revokeKey(site, id, new Date().toISOString()))) return Response.json({ error: "not found" }, { status: 404 });
    await store.addAccountEvent(site, actor, "停用 API 金鑰", id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}
