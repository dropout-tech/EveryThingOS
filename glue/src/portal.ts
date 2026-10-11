import type { App, Env } from "./app";
import { sha256Hex, toHex } from "./crypto";
import type { Tenant } from "./store";

/**
 * 客戶入口. The shell signs the URL a customer opens and calls these routes
 * with its own token; this side keeps the link state (revoked, expired, views,
 * acceptance) and talks to the company's ERPNext with the tenant's integration
 * key, so customers never need an ERPNext login and the shell never needs one
 * for them.
 */

export const PORTAL_DOCTYPES = ["Quotation", "Sales Order", "Sales Invoice"] as const;
export type PortalDoctype = (typeof PORTAL_DOCTYPES)[number];

export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 14;
export const ATTEMPT_LIMIT = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60_000;
export const MAX_SIGNATURE_CHARS = 420_000;
const LIST_LIMIT = 200;

export type PortalLink = {
  id: string;
  site: string;
  doctype: PortalDoctype;
  docname: string;
  party: string;
  amount: number;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_ip_hash: string | null;
  attempt_window: string | null;
  attempt_count: number;
};

export type LinkState = "active" | "revoked" | "expired";

export interface PortalStore {
  add(l: PortalLink): Promise<void>;
  get(site: string, id: string): Promise<PortalLink | null>;
  list(site: string, doc?: { doctype: string; docname: string }): Promise<PortalLink[]>;
  revoke(site: string, id: string, at: string): Promise<boolean>;
  setExpiry(site: string, id: string, at: string): Promise<boolean>;
  view(site: string, id: string, at: string): Promise<void>;
  /** Counts one acceptance attempt; false once the link used up its window. */
  attempt(site: string, id: string, now: Date): Promise<boolean>;
  /** Only the first acceptance sticks. */
  accept(site: string, id: string, name: string, ipHash: string | null, at: string): Promise<boolean>;
}

export class D1PortalStore implements PortalStore {
  constructor(private db: D1Database) {}

  async add(l: PortalLink) {
    await this.db
      .prepare("INSERT INTO portal_links (id, site, doctype, docname, party, amount, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(l.id, l.site, l.doctype, l.docname, l.party, l.amount, l.created_by, l.created_at, l.expires_at)
      .run();
  }

  async get(site: string, id: string) {
    return (await this.db.prepare("SELECT * FROM portal_links WHERE site = ? AND id = ?").bind(site, id).first<PortalLink>()) ?? null;
  }

  async list(site: string, doc?: { doctype: string; docname: string }) {
    const q = doc
      ? this.db.prepare("SELECT * FROM portal_links WHERE site = ? AND doctype = ? AND docname = ? ORDER BY created_at DESC LIMIT ?").bind(site, doc.doctype, doc.docname, LIST_LIMIT)
      : this.db.prepare("SELECT * FROM portal_links WHERE site = ? ORDER BY created_at DESC LIMIT ?").bind(site, LIST_LIMIT);
    return (await q.all<PortalLink>()).results;
  }

  async revoke(site: string, id: string, at: string) {
    const res = await this.db.prepare("UPDATE portal_links SET revoked_at = ? WHERE site = ? AND id = ? AND revoked_at IS NULL").bind(at, site, id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async setExpiry(site: string, id: string, at: string) {
    const res = await this.db.prepare("UPDATE portal_links SET expires_at = ? WHERE site = ? AND id = ? AND revoked_at IS NULL").bind(at, site, id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async view(site: string, id: string, at: string) {
    await this.db
      .prepare("UPDATE portal_links SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?), last_viewed_at = ? WHERE site = ? AND id = ?")
      .bind(at, at, site, id)
      .run();
  }

  async attempt(site: string, id: string, now: Date) {
    const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString();
    const at = now.toISOString();
    const res = await this.db
      .prepare(
        `UPDATE portal_links SET
           attempt_count = CASE WHEN attempt_window IS NULL OR attempt_window < ?1 THEN 1 ELSE attempt_count + 1 END,
           attempt_window = CASE WHEN attempt_window IS NULL OR attempt_window < ?1 THEN ?2 ELSE attempt_window END
         WHERE site = ?3 AND id = ?4 AND (attempt_window IS NULL OR attempt_window < ?1 OR attempt_count < ?5)`,
      )
      .bind(windowStart, at, site, id, ATTEMPT_LIMIT)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async accept(site: string, id: string, name: string, ipHash: string | null, at: string) {
    const res = await this.db
      .prepare("UPDATE portal_links SET accepted_at = ?, accepted_name = ?, accepted_ip_hash = ? WHERE site = ? AND id = ? AND accepted_at IS NULL")
      .bind(at, name, ipHash, site, id)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
}

export class MemoryPortalStore implements PortalStore {
  links: PortalLink[] = [];

  private find(site: string, id: string) {
    return this.links.find((l) => l.site === site && l.id === id);
  }
  async add(l: PortalLink) {
    this.links.push(structuredClone(l));
  }
  async get(site: string, id: string) {
    const l = this.find(site, id);
    return l ? structuredClone(l) : null;
  }
  async list(site: string, doc?: { doctype: string; docname: string }) {
    return this.links
      .filter((l) => l.site === site && (!doc || (l.doctype === doc.doctype && l.docname === doc.docname)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((l) => structuredClone(l));
  }
  async revoke(site: string, id: string, at: string) {
    const l = this.find(site, id);
    if (!l || l.revoked_at) return false;
    l.revoked_at = at;
    return true;
  }
  async setExpiry(site: string, id: string, at: string) {
    const l = this.find(site, id);
    if (!l || l.revoked_at) return false;
    l.expires_at = at;
    return true;
  }
  async view(site: string, id: string, at: string) {
    const l = this.find(site, id);
    if (!l) return;
    l.view_count++;
    l.first_viewed_at ??= at;
    l.last_viewed_at = at;
  }
  async attempt(site: string, id: string, now: Date) {
    const l = this.find(site, id);
    if (!l) return false;
    const fresh = !l.attempt_window || Date.parse(l.attempt_window) < now.getTime() - ATTEMPT_WINDOW_MS;
    if (fresh) {
      l.attempt_window = now.toISOString();
      l.attempt_count = 1;
      return true;
    }
    if (l.attempt_count >= ATTEMPT_LIMIT) return false;
    l.attempt_count++;
    return true;
  }
  async accept(site: string, id: string, name: string, ipHash: string | null, at: string) {
    const l = this.find(site, id);
    if (!l || l.accepted_at) return false;
    Object.assign(l, { accepted_at: at, accepted_name: name, accepted_ip_hash: ipHash });
    return true;
  }
}

export function portalStoreFor(env: Env, app: Pick<App, "portal">): PortalStore | undefined {
  if (app.portal) return app.portal(env);
  return env.DB ? new D1PortalStore(env.DB) : undefined;
}

export function isPortalRoute(parts: string[]) {
  return parts[1] === "tenants" && Boolean(parts[2]) && parts[3] === "portal-links";
}

export function linkState(l: PortalLink, now = new Date()): LinkState {
  if (l.revoked_at) return "revoked";
  if (Date.parse(l.expires_at) <= now.getTime()) return "expired";
  return "active";
}

/** What the shell gets back: no attempt counters, no address hash. */
export function linkView(l: PortalLink, now = new Date()) {
  return {
    id: l.id,
    doctype: l.doctype,
    docname: l.docname,
    party: l.party,
    amount: l.amount,
    created_by: l.created_by,
    created_at: l.created_at,
    expires_at: l.expires_at,
    revoked_at: l.revoked_at,
    first_viewed_at: l.first_viewed_at,
    last_viewed_at: l.last_viewed_at,
    view_count: l.view_count,
    accepted_at: l.accepted_at,
    accepted_name: l.accepted_name,
    state: linkState(l, now),
  };
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

function newId() {
  return `pl_${toHex(crypto.getRandomValues(new Uint8Array(12)))}`;
}

function days(value: unknown, fallback?: number) {
  const n = value === undefined || value === null || value === "" ? fallback : Number(value);
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : null;
}

async function ipHash(env: Env, site: string, ip: unknown) {
  return typeof ip === "string" && ip && ip.length <= 64 ? (await sha256Hex(`${env.TENANT_KEY}:portal:${site}:${ip}`)).slice(0, 32) : null;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const b = (await req.json().catch(() => null)) as unknown;
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

function erpHeaders(t: Tenant): Record<string, string> {
  return { Authorization: `token ${t.erpnext_key}:${t.erpnext_secret}`, Accept: "application/json", "X-Frappe-Site-Name": t.site };
}

/** Frappe puts the reason a person should read in `_server_messages`. */
async function erpReason(res: Response) {
  try {
    const b = (await res.json()) as { _server_messages?: string; exception?: string };
    if (b._server_messages) {
      const first = JSON.parse(JSON.parse(b._server_messages)[0]) as { message?: string };
      if (first.message) return first.message.replace(/<[^>]+>/g, "").slice(0, 300);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

type ErpResult<T> = { ok: true; data: T } | { ok: false; status: number; reason: string | null };

async function erpCall<T>(t: Tenant, fetcher: typeof fetch, method: string, args: Record<string, unknown>): Promise<ErpResult<T>> {
  let res: Response;
  try {
    res = await fetcher(`${t.erpnext_url}/api/method/${method}`, {
      method: "POST",
      headers: { ...erpHeaders(t), "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, status: 0, reason: null };
  }
  if (!res.ok) return { ok: false, status: res.status, reason: await erpReason(res) };
  return { ok: true, data: ((await res.json()) as { message: T }).message };
}

function upstream(r: Extract<ErpResult<unknown>, { ok: false }>) {
  if (r.status === 0) return fail("連不到這家公司的 ERPNext，請稍後再試", 502);
  if (r.status === 417 || r.status === 400 || r.status === 409) return fail(r.reason ?? "ERPNext 不接受這個動作", 422);
  if (r.status === 404) return fail("這張單在 ERPNext 已經找不到了", 404);
  return fail(r.reason ?? `ERPNext 回應 ${r.status}`, 502);
}

export async function managePortal(req: Request, env: Env, app: App, parts: string[], actor: string, now = new Date()): Promise<Response> {
  const portal = portalStoreFor(env, app);
  if (!portal) return fail("客戶入口還沒設定好", 503);
  const store = app.store(env);
  const site = parts[2];
  const id = parts[4];
  const action = parts[5];
  const at = now.toISOString();

  if (!id && req.method === "GET") {
    const url = new URL(req.url);
    const doctype = url.searchParams.get("doctype");
    const docname = url.searchParams.get("docname");
    const links = await portal.list(site, doctype && docname ? { doctype, docname } : undefined);
    return json({ links: links.map((l) => linkView(l, now)) });
  }

  if (!id && req.method === "POST") {
    if (!(await store.getTenant(site))) return fail("找不到這家公司", 404);
    const b = await body(req);
    const doctype = b.doctype as PortalDoctype;
    if (!PORTAL_DOCTYPES.includes(doctype)) return fail("只能分享報價單、訂單或發票", 400);
    const docname = typeof b.docname === "string" ? b.docname.trim() : "";
    if (!docname || docname.length > 140) return fail("缺少單號", 400);
    const life = days(b.days, DEFAULT_DAYS);
    if (!life) return fail(`有效天數要是 1 到 ${MAX_DAYS} 天`, 400);
    const amount = Number(b.amount ?? 0);
    const link: PortalLink = {
      id: newId(),
      site,
      doctype,
      docname,
      party: typeof b.party === "string" ? b.party.trim().slice(0, 140) : "",
      amount: Number.isFinite(amount) && amount >= 0 && amount < 1e12 ? amount : 0,
      created_by: actor,
      created_at: at,
      expires_at: new Date(now.getTime() + life * 86_400_000).toISOString(),
      revoked_at: null,
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      accepted_at: null,
      accepted_name: null,
      accepted_ip_hash: null,
      attempt_window: null,
      attempt_count: 0,
    };
    await portal.add(link);
    return json({ link: linkView(link, now) }, 201);
  }

  if (!id || !/^pl_[0-9a-f]{24}$/.test(id)) return fail("not found", 404);
  const link = await portal.get(site, id);
  if (!link) return fail("找不到這個連結", 404);

  if (!action && req.method === "GET") return json({ link: linkView(link, now) });

  if (action === "revoke" && req.method === "POST") {
    await portal.revoke(site, id, at);
    return json({ link: linkView((await portal.get(site, id))!, now) });
  }

  if (action === "expiry" && req.method === "POST") {
    const life = days((await body(req)).days);
    if (!life) return fail(`有效天數要是 1 到 ${MAX_DAYS} 天`, 400);
    if (!(await portal.setExpiry(site, id, new Date(now.getTime() + life * 86_400_000).toISOString()))) return fail("已撤回的連結不能再延長，請重開一個", 409);
    return json({ link: linkView((await portal.get(site, id))!, now) });
  }

  // Everything below is the customer's side, relayed by the shell.
  const state = linkState(link, now);
  if (state !== "active") return fail(state === "revoked" ? "這個連結已經收回" : "這個連結已經過期", 410, { state, link: linkView(link, now) });
  const t = await store.getTenant(site);
  if (!t) return fail("找不到這家公司", 404);

  if (action === "open" && req.method === "POST") {
    const r = await erpCall<Record<string, unknown>>(t, app.fetcher, "dropout_core.portal.document", { doctype: link.doctype, name: link.docname });
    if (!r.ok) return upstream(r);
    await portal.view(site, id, at);
    return json({ link: linkView((await portal.get(site, id))!, now), doc: r.data });
  }

  if (action === "accept" && req.method === "POST") {
    if (link.doctype !== "Quotation") return fail("只有報價單可以線上接受", 400);
    if (link.accepted_at) return json({ ok: true, already: true, accepted: { name: link.accepted_name, at: link.accepted_at } });
    const b = await body(req);
    const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim() : "";
    if (name.length < 2 || name.length > 80) return fail("請輸入 2 到 80 個字的全名", 400);
    if (b.consent !== true) return fail("要先勾選同意，才能接受報價", 400);
    const signature = b.signature === undefined || b.signature === null || b.signature === "" ? null : b.signature;
    if (signature !== null && (typeof signature !== "string" || !signature.startsWith("data:image/png;base64,") || signature.length > MAX_SIGNATURE_CHARS)) {
      return fail("簽名要是 PNG 圖，而且不能太大", 400);
    }
    if (!(await portal.attempt(site, id, now))) return fail("試太多次了，請 15 分鐘後再試，或直接聯絡業務", 429);
    const hash = await ipHash(env, site, b.ip);
    const r = await erpCall<{ status: string; accepted: { name: string; at: string } }>(t, app.fetcher, "dropout_core.portal.accept_quotation", {
      name: link.docname,
      full_name: name,
      signature,
      link: link.id,
      ip_hash: hash,
      consent: 1,
    });
    if (!r.ok) return upstream(r);
    const acceptedName = r.data.accepted?.name ?? name;
    await portal.accept(site, id, acceptedName, hash, at);
    return json({ ok: true, already: r.data.status === "already_accepted", accepted: { name: acceptedName, at } });
  }

  if (action === "pay" && req.method === "POST") {
    if (link.doctype !== "Sales Invoice") return fail("只有發票可以線上付款", 400);
    const r = await erpCall<{ status: string; url?: string }>(t, app.fetcher, "dropout_core.portal.payment_link", { sales_invoice: link.docname });
    if (!r.ok) return upstream(r);
    if (r.data.status === "ok" && r.data.url && /^https?:\/\//.test(r.data.url)) return json({ status: "ok", url: r.data.url });
    return json({ status: r.data.status === "paid" ? "paid" : "unavailable" });
  }

  if (action === "pdf" && req.method === "GET") {
    const q = new URLSearchParams({ doctype: link.doctype, name: link.docname });
    let res: Response;
    try {
      res = await app.fetcher(`${t.erpnext_url}/api/method/frappe.utils.print_format.download_pdf?${q}`, { headers: erpHeaders(t), signal: AbortSignal.timeout(60_000) });
    } catch {
      return fail("連不到這家公司的 ERPNext，請稍後再試", 502);
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) return fail("PDF 現在產生不出來，請稍後再試", 502);
    return new Response(res.body, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${link.docname.replace(/[^\w.-]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }

  return fail("not found", 404);
}
