import "server-only";
import { headers } from "next/headers";
import { readSession } from "./session";
import { liveConfig, type LiveConfig } from "./sources/config";
import {
  DEFAULT_DAYS,
  KIND_OF,
  PORTAL_DOCTYPES,
  type LinkState,
  type PortalBank,
  type PortalDoc,
  type PortalDoctype,
  type PortalKind,
  type PortalLink,
  type PortalStatus,
} from "./portal";

/**
 * Link tokens: base64url(JSON payload) "." base64url(HMAC-SHA256). The key is
 * derived per company from PORTAL_SECRET, so a token never opens another
 * company's document even with one shell for many companies. Live tokens only
 * point at a glue link row (which can be revoked or expired); demo tokens carry
 * a small snapshot of a practice document and are signed with a key everyone
 * can read in the source, which is why they never render on a connected company
 * and never carry bank details or contact data.
 */

const DEMO_SECRET = "dropout-portal-demo-only-not-a-secret";
const MIN_SECRET = 32;
const MAX_TOKEN = 2_000;
const CODE: Record<PortalDoctype, string> = { Quotation: "Q", "Sales Order": "SO", "Sales Invoice": "SI" };
const FROM_CODE: Record<string, PortalDoctype> = { Q: "Quotation", SO: "Sales Order", SI: "Sales Invoice" };

type LivePayload = { v: 1; m: "l"; s: string; d: string; n: string; l: string; e: number };
type DemoPayload = { v: 1; m: "d"; d: string; n: string; l: string; e: number; p: string; i: string; q: number; a: number; t: number; st: "open" | "unpaid" | "overdue" | "paid" };

export type LiveToken = { mode: "live"; site: string; doctype: PortalDoctype; docname: string; linkId: string; expiresAt: number };
export type DemoToken = { mode: "demo"; doctype: PortalDoctype; docname: string; linkId: string; expiresAt: number; party: string; item: string; qty: number; amount: number; tax: number; status: DemoPayload["st"] };
export type TokenCheck = LiveToken | DemoToken | { mode: "invalid" } | { mode: "expired"; doctype: PortalDoctype };

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmacKey(raw: Uint8Array<ArrayBuffer> | string) {
  return crypto.subtle.importKey("raw", typeof raw === "string" ? encoder.encode(raw) : raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** HMAC(secret, "portal:" + scope): one key per company, one for demo. */
async function scopedKey(secret: string, scope: string) {
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`portal:${scope}`)));
  return hmacKey(derived);
}

export function portalSecret() {
  const secret = process.env.PORTAL_SECRET;
  return secret && secret.length >= MIN_SECRET ? secret : null;
}

async function sign(payload: LivePayload | DemoPayload, secret: string, scope: string) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await scopedKey(secret, scope), encoder.encode(body)));
  return `${body}.${b64url(mac)}`;
}

/** crypto.subtle.verify compares in constant time. */
async function verifyMac(body: string, mac: string, secret: string, scope: string) {
  try {
    const sig = fromB64url(mac);
    if (sig.length !== 32) return false;
    return await crypto.subtle.verify("HMAC", await scopedKey(secret, scope), sig, encoder.encode(body));
  } catch {
    return false;
  }
}

function seconds(iso: string) {
  return Math.floor(Date.parse(iso) / 1000);
}

export async function signLive(site: string, link: Pick<PortalLink, "id" | "doctype" | "docname" | "expiresAt">) {
  const secret = portalSecret();
  if (!secret) throw new Error("PORTAL_SECRET 還沒設定");
  return sign({ v: 1, m: "l", s: site, d: CODE[link.doctype], n: link.docname, l: link.id, e: seconds(link.expiresAt) }, secret, `site:${site}`);
}

export type DemoSnapshot = { doctype: PortalDoctype; docname: string; party: string; item: string; qty: number; amount: number; tax: number; status: DemoPayload["st"] };

export async function signDemo(snapshot: DemoSnapshot, linkId: string, expiresAt: string) {
  return sign(
    { v: 1, m: "d", d: CODE[snapshot.doctype], n: snapshot.docname, l: linkId, e: seconds(expiresAt), p: snapshot.party, i: snapshot.item, q: snapshot.qty, a: snapshot.amount, t: snapshot.tax, st: snapshot.status },
    portalSecret() ?? DEMO_SECRET,
    "demo",
  );
}

const shortText = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e10;

/** `site` is the company this shell is serving right now; live tokens for any other company are invalid. */
export async function verifyToken(token: string, { live, site }: { live: boolean; site?: string }): Promise<TokenCheck> {
  if (!token || token.length > MAX_TOKEN || !/^[\w-]+\.[\w-]+$/.test(token)) return { mode: "invalid" };
  const [body, mac] = token.split(".");
  let payload: { v?: unknown; m?: unknown; s?: unknown; d?: string; n?: string; l?: string; e?: number; p?: string; i?: string; q?: number; a?: number; t?: number; st?: DemoPayload["st"] };
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { mode: "invalid" };
  }
  if (!payload || payload.v !== 1 || typeof payload.e !== "number") return { mode: "invalid" };
  const doctype = FROM_CODE[payload.d ?? ""];
  if (!doctype || !shortText(payload.n, 140) || !shortText(payload.l, 64)) return { mode: "invalid" };

  if (payload.m === "l") {
    const secret = portalSecret();
    if (!live || !secret || !site || payload.s !== site) return { mode: "invalid" };
    if (!(await verifyMac(body, mac, secret, `site:${site}`))) return { mode: "invalid" };
    if (payload.e * 1000 <= Date.now()) return { mode: "expired", doctype };
    return { mode: "live", site, doctype, docname: payload.n!, linkId: payload.l!, expiresAt: payload.e * 1000 };
  }
  if (payload.m === "d") {
    if (live) return { mode: "invalid" };
    if (!(await verifyMac(body, mac, portalSecret() ?? DEMO_SECRET, "demo"))) return { mode: "invalid" };
    if (!shortText(payload.p, 40) || !shortText(payload.i, 40) || !money(payload.a) || !money(payload.t) || !Number.isInteger(payload.q) || payload.q! < 1 || payload.q! > 10_000) return { mode: "invalid" };
    if (!["open", "unpaid", "overdue", "paid"].includes(payload.st ?? "")) return { mode: "invalid" };
    if (payload.e * 1000 <= Date.now()) return { mode: "expired", doctype };
    return { mode: "demo", doctype, docname: payload.n!, linkId: payload.l!, expiresAt: payload.e * 1000, party: payload.p!, item: payload.i!, qty: payload.q!, amount: payload.a!, tax: payload.t!, status: payload.st! };
  }
  return { mode: "invalid" };
}

/** live: ERPNext and the glue are connected and the shell has a portal secret. */
export type PortalMode = { mode: "demo" } | { mode: "live"; site: string; config: LiveConfig } | { mode: "unconfigured"; reason: string };

export async function portalMode(): Promise<PortalMode> {
  const config = await liveConfig();
  if (config.directoryError || config.unknownHost) return { mode: "unconfigured", reason: config.directoryError ?? "這個網址還沒開通" };
  if (!config.erpnext) return { mode: "demo" };
  if (!config.glue) return { mode: "unconfigured", reason: "客戶入口要接上 DropOut 膠水服務（GLUE_URL），才能記錄連結、撤回與簽名。" };
  if (!portalSecret()) return { mode: "unconfigured", reason: "伺服器還沒設定 PORTAL_SECRET（至少 32 個字元），所以不能產生分享連結。" };
  return { mode: "live", site: config.glue.site, config };
}

export async function requestOrigin() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")).split(",")[0].trim();
  return host ? `${proto}://${host}` : (process.env.SHELL_URL ?? "").replace(/\/+$/, "");
}

export async function requestIp() {
  const h = await headers();
  return (h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;
}

/** Link previews (LINE, Facebook, Slack…) fetch the page too; they must not count as the customer or see the document. */
export function isPreviewBot(userAgent: string | null) {
  return Boolean(userAgent && /bot|crawler|spider|preview|facebookexternalhit|line-poker|slackbot|whatsapp|telegram|discord|embedly|skype/i.test(userAgent));
}

// ---- glue ------------------------------------------------------------------

type GlueLink = {
  id: string;
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
  state: LinkState;
};

export class PortalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly state?: LinkState,
  ) {
    super(message);
  }
}

function fromGlue(l: GlueLink): PortalLink {
  return {
    id: l.id,
    doctype: l.doctype,
    docname: l.docname,
    party: l.party,
    amount: l.amount,
    createdBy: l.created_by,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
    firstViewedAt: l.first_viewed_at,
    lastViewedAt: l.last_viewed_at,
    viewCount: l.view_count,
    acceptedAt: l.accepted_at,
    acceptedName: l.accepted_name,
    state: l.state,
  };
}

async function actor(config: LiveConfig) {
  const session = await readSession(config.sessionSecret, config.tenant?.site);
  return session?.user ?? "integration";
}

async function glue(config: LiveConfig, path: string, init: { method?: string; body?: unknown; timeout?: number } = {}) {
  const g = config.glue!;
  let res: Response;
  try {
    res = await fetch(`${g.url}/admin/tenants/${encodeURIComponent(g.site)}/portal-links${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${g.adminToken}`, "content-type": "application/json", "x-actor": (await actor(config)).slice(0, 120) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeout ?? 25_000),
    });
  } catch {
    throw new PortalError("連不到 DropOut 膠水服務，請稍後再試", 502);
  }
  return res;
}

async function glueJson<T>(config: LiveConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await glue(config, path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; state?: LinkState };
  if (!res.ok) throw new PortalError(data.error ?? `膠水服務回應 ${res.status}`, res.status, data.state);
  return data;
}

export async function listLinks(config: LiveConfig, doc?: { doctype: string; docname: string }) {
  const q = doc ? `?${new URLSearchParams({ doctype: doc.doctype, docname: doc.docname })}` : "";
  return (await glueJson<{ links: GlueLink[] }>(config, q)).links.map(fromGlue);
}

export async function createLink(config: LiveConfig, input: { doctype: PortalDoctype; docname: string; party: string; amount: number; days: number }) {
  return fromGlue((await glueJson<{ link: GlueLink }>(config, "", { method: "POST", body: input })).link);
}

export async function revokeLink(config: LiveConfig, id: string) {
  return fromGlue((await glueJson<{ link: GlueLink }>(config, `/${id}/revoke`, { method: "POST", body: {} })).link);
}

export async function extendLink(config: LiveConfig, id: string, days: number) {
  return fromGlue((await glueJson<{ link: GlueLink }>(config, `/${id}/expiry`, { method: "POST", body: { days } })).link);
}

export async function openLink(config: LiveConfig, id: string, ip: string | null) {
  const out = await glueJson<{ link: GlueLink; doc: RawDoc }>(config, `/${id}/open`, { method: "POST", body: { ip } });
  return { link: fromGlue(out.link), doc: fromRawDoc(out.doc) };
}

export async function acceptLink(config: LiveConfig, id: string, body: { name: string; signature: string | null; consent: true; ip: string | null }) {
  return glueJson<{ ok: true; already: boolean; accepted: { name: string; at: string } }>(config, `/${id}/accept`, { method: "POST", body });
}

export async function payLink(config: LiveConfig, id: string) {
  return glueJson<{ status: "ok" | "paid" | "unavailable"; url?: string }>(config, `/${id}/pay`, { method: "POST", body: {} });
}

export async function linkPdf(config: LiveConfig, id: string) {
  return glue(config, `/${id}/pdf`, { timeout: 60_000 });
}

export async function withUrls(links: PortalLink[], site: string) {
  const origin = await requestOrigin();
  return Promise.all(links.map(async (l) => (l.state === "active" ? { ...l, url: `${origin}/q/${await signLive(site, l)}` } : l)));
}

// ---- documents --------------------------------------------------------------

type RawDoc = {
  doctype: PortalDoctype;
  name: string;
  status: PortalStatus;
  company: { name: string; tax_id?: string | null; phone?: string | null; email?: string | null; website?: string | null; logo?: string | null };
  customer: string;
  date: string;
  valid_till: string | null;
  due_date: string | null;
  delivery_date: string | null;
  currency: string;
  lines: PortalDoc["lines"];
  net: number;
  tax: number;
  total: number;
  terms: string | null;
  contact: PortalDoc["contact"];
  accepted: PortalDoc["accepted"];
  outstanding: number | null;
  einvoice: string | null;
  bank: PortalBank | null;
  online_pay: boolean;
};

function fromRawDoc(d: RawDoc): PortalDoc {
  return {
    doctype: d.doctype,
    kind: KIND_OF[d.doctype],
    name: d.name,
    status: d.status,
    company: { name: d.company.name, taxId: d.company.tax_id, phone: d.company.phone, email: d.company.email, website: d.company.website, logo: d.company.logo?.startsWith("https://") ? d.company.logo : null },
    customer: d.customer,
    date: d.date,
    validTill: d.valid_till,
    dueDate: d.due_date,
    deliveryDate: d.delivery_date,
    currency: d.currency,
    lines: d.lines ?? [],
    net: d.net,
    tax: d.tax,
    total: d.total,
    terms: d.terms,
    contact: d.contact,
    accepted: d.accepted,
    outstanding: d.outstanding,
    einvoice: d.einvoice,
    bank: d.bank,
    onlinePay: Boolean(d.online_pay),
  };
}

const DEMO_COMPANY = { name: "示範公司", taxId: "00000000", phone: "02-0000-0000", email: "demo@example.com", website: null, logo: null };
const DEMO_CONTACT = { name: "示範業務", email: "demo@example.com", phone: "0900-000-000" };
const DEMO_BANK: PortalBank = { bank: "示範銀行（代碼 000）", holder: "示範公司", account: "0000-000-000000", branch: "0000" };
const DEMO_TERMS: Record<PortalKind, string> = {
  quote: "這是示範報價。\n1. 報價有效期間內接受，依本報價內容供貨或提供服務。\n2. 付款：訂單成立後 30 天內匯款。\n3. 以上金額含營業稅 5%。",
  order: "這是示範訂單。\n1. 依本訂單內容供貨或提供服務。\n2. 付款：開立發票後 30 天內匯款。\n3. 以上金額含營業稅 5%。",
  invoice: "這是示範發票。\n1. 請在付款期限前付款。\n2. 匯款後請告訴業務帳號末五碼，方便對帳。\n3. 以上金額含營業稅 5%。",
};

function addDays(ms: number, days: number) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(ms + days * 86_400_000));
}

/** A practice document rebuilt from the signed snapshot; company, contact and bank are fixed demo values, never from the link. */
export function demoDoc(t: DemoToken): PortalDoc {
  const now = Date.now();
  const kind = KIND_OF[t.doctype];
  const rate = Math.round(t.amount / t.qty);
  return {
    doctype: t.doctype,
    kind,
    name: t.docname,
    status: kind === "quote" ? "open" : kind === "order" ? "open" : t.status,
    company: DEMO_COMPANY,
    customer: t.party,
    date: addDays(now, kind === "invoice" ? -7 : 0),
    validTill: kind === "quote" ? addDays(now, 14) : null,
    dueDate: kind === "invoice" ? addDays(now, t.status === "overdue" ? -3 : 23) : null,
    deliveryDate: kind === "order" ? addDays(now, 7) : null,
    currency: "TWD",
    lines: [{ item: t.item, description: null, qty: t.qty, uom: "件", rate, amount: t.amount }],
    net: t.amount,
    tax: t.tax,
    total: t.amount + t.tax,
    terms: DEMO_TERMS[kind],
    contact: DEMO_CONTACT,
    accepted: null,
    outstanding: kind === "invoice" ? (t.status === "paid" ? 0 : t.amount + t.tax) : null,
    einvoice: null,
    bank: kind === "invoice" && t.status !== "paid" ? DEMO_BANK : null,
    onlinePay: false,
  };
}

export function demoLinkId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `demo_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function parseDays(value: unknown, fallback = DEFAULT_DAYS) {
  const n = value === undefined || value === null || value === "" ? fallback : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
}

export function isPortalDoctype(value: unknown): value is PortalDoctype {
  return typeof value === "string" && (PORTAL_DOCTYPES as string[]).includes(value);
}
