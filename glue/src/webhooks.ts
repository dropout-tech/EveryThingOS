import type { ApiStore, Webhook } from "./apiStore";
import { hmacSha256, safeEqual, toHex } from "./crypto";
import type { Fetch } from "./clients";
import type { ErpEvent } from "./jobs";
import type { Store, Tenant } from "./store";

/** Public event name → the DropOut Event type ERPNext already emits (dropout_core/events.py). */
export const WEBHOOK_EVENTS = {
  "customer.created": "customer_created",
  "lead.created": "lead_created",
  "quote.sent": "quote_sent",
  "sales_order.submitted": "won",
  "delivery.submitted": "fulfilled",
  "invoice.submitted": "invoiced",
  "payment.received": "paid",
  "automation.fired": "automation_fired",
} as const;

export type WebhookEventType = keyof typeof WEBHOOK_EVENTS;

export const MAX_WEBHOOKS = 5;
export const AUTO_DISABLE_AFTER = 20;
export const DELIVERY_TIMEOUT_MS = 10_000;
export const SIGNATURE_TOLERANCE_S = 300;

export type WebhookEvent = { id: string; type: WebhookEventType | "ping"; created_at: string; data: Record<string, unknown> };

export type WebhookJob = { kind: "webhook"; site: string; webhook_id: string; event: WebhookEvent };

type FanOutDeps = { store: Store; api?: ApiStore; queue?: { send(job: WebhookJob): Promise<unknown> } };

const PAYLOAD_KEYS = ["amount", "currency", "is_return", "customer_name", "lead_name", "rule", "title"];

export function publicType(erpType: string): WebhookEventType | null {
  return (Object.entries(WEBHOOK_EVENTS).find(([, t]) => t === erpType)?.[0] as WebhookEventType) ?? null;
}

/** Only references and a few known payload keys leave DropOut; integrators fetch the rest through /v1. */
export function toWebhookEvent(event: ErpEvent, type: WebhookEventType): WebhookEvent {
  const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
  const data: Record<string, unknown> = {
    doctype: event.reference_doctype ?? null,
    id: event.reference_name ?? null,
    party_type: event.party_type ?? null,
    party: event.party ?? null,
  };
  for (const k of PAYLOAD_KEYS) if (payload[k] !== undefined) data[k] = payload[k];
  const at = (event as ErpEvent & { occurred_at?: string }).occurred_at;
  return { id: `evt_${event.name || event.idempotency_key}`, type, created_at: at ? taipeiToIso(at) : new Date().toISOString(), data };
}

function taipeiToIso(value: string) {
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}+08:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` */
export async function sign(secret: string, body: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${toHex(await hmacSha256(secret, `${ts}.${body}`))}`;
}

export async function verifySignature(secret: string, header: string | null, body: string, now = Date.now()) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const ts = Number(parts.t);
  if (!parts.v1 || !Number.isInteger(ts) || Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_S) return false;
  return safeEqual(parts.v1, toHex(await hmacSha256(secret, `${ts}.${body}`)));
}

function ipv4Private(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function ipv6Private(host: string) {
  if (!host.includes(":")) return null;
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  // IPv4-mapped/translated, unique local, link local, multicast, documentation.
  return /^(::ffff:|64:ff9b:|fc|fd|fe[89ab]|ff|2001:db8)/.test(h);
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(host: string) {
  return ipv4Private(host) ?? ipv6Private(host) ?? false;
}

/**
 * Static checks on a webhook URL. `blocked` holds DropOut's own hosts (the glue,
 * the company's ERPNext and Chatwoot), so a webhook can never call back into us.
 */
export function checkUrl(raw: string, blocked: string[] = []): { url: URL } | { error: string } {
  if (typeof raw !== "string" || raw.length > 2048) return { error: "網址太長" };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "網址格式不對" };
  }
  if (url.protocol !== "https:") return { error: "只接受 https:// 開頭的網址" };
  if (url.username || url.password) return { error: "網址裡不能放帳號密碼" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isPrivateAddress(host)) return { error: "不能送到內部網路或本機位址" };
  if (host.includes(":")) return { error: "請用網域名稱，不要直接寫 IPv6 位址" };
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return { error: "不能送到內部網路或本機位址" };
  if (blocked.some((b) => b && (host === b || host.endsWith(`.${b}`)))) return { error: "不能送回 DropOut 自己的系統" };
  return { url };
}

/**
 * Resolves the host over DNS-over-HTTPS and refuses names that point at private
 * addresses. Run at registration and before every delivery to narrow DNS rebinding.
 */
export async function resolvesPublic(host: string, fetcher: Fetch): Promise<string | null> {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return isPrivateAddress(host) ? "不能送到內部網路或本機位址" : null;
  const found: string[] = [];
  for (const type of ["A", "AAAA"]) {
    let body: { Answer?: { type: number; data: string }[] };
    try {
      const res = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: "application/dns-json" } });
      if (!res.ok) return "暫時查不到這個網址，請稍後再試";
      body = (await res.json()) as typeof body;
    } catch {
      return "暫時查不到這個網址，請稍後再試";
    }
    for (const a of body.Answer ?? []) if (a.type === 1 || a.type === 28) found.push(a.data);
  }
  if (!found.length) return "查不到這個網址";
  if (found.some(isPrivateAddress)) return "這個網址指到內部網路，不能用";
  return null;
}

export function blockedHosts(t: Tenant | null, glueHost: string) {
  const host = (u?: string) => {
    try {
      return u ? new URL(u).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  };
  return [glueHost.toLowerCase(), host(t?.erpnext_url), host(t?.chatwoot_url), host(t?.vexa?.url)].filter(Boolean);
}

/** From the queue consumer: one delivery job per subscribed webhook, once per event. */
export async function fanOut(site: string, event: ErpEvent, deps: FanOutDeps) {
  const type = publicType(event.event_type);
  if (!type || !deps.api || !deps.queue) return 0;
  const hooks = (await deps.api.listWebhooks(site)).filter((h) => h.enabled && h.events.includes(type));
  let queued = 0;
  for (const h of hooks) {
    const key = `wh:${h.id}:${event.idempotency_key}`;
    if (!(await deps.store.claim(key))) continue;
    try {
      await deps.queue.send({ kind: "webhook", site, webhook_id: h.id, event: toWebhookEvent(event, type) });
      queued++;
    } catch (e) {
      await deps.store.release(key);
      throw e;
    }
  }
  return queued;
}

export class DeliveryError extends Error {}

type SendResult = { status: number | null; error: string | null; ms: number };

async function send(h: Webhook, event: WebhookEvent, fetcher: Fetch): Promise<SendResult> {
  const started = Date.now();
  const done = (status: number | null, error: string | null): SendResult => ({ status, error, ms: Date.now() - started });
  const checked = checkUrl(h.url);
  if ("error" in checked) return done(null, checked.error);
  const dns = await resolvesPublic(checked.url.hostname, fetcher);
  if (dns) return done(null, dns);
  const body = JSON.stringify(event);
  try {
    const res = await fetcher(checked.url.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "DropOut-Webhooks/1",
        "x-dropout-event": event.type,
        "x-dropout-delivery": event.id,
        "x-dropout-signature": await sign(h.secret, body),
      },
      body,
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.status >= 200 && res.status < 300) return done(res.status, null);
    return done(res.status, res.status >= 300 && res.status < 400 ? `HTTP ${res.status}（不會跟著轉址）` : `HTTP ${res.status}`);
  } catch (e) {
    const name = (e as Error)?.name;
    return done(null, name === "TimeoutError" || name === "AbortError" ? `${DELIVERY_TIMEOUT_MS / 1000} 秒沒回應` : "連不到對方伺服器");
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "（網址錯誤）";
  }
}

/**
 * Queue job: POST one signed event. A failure throws so the queue retries with
 * backoff; after AUTO_DISABLE_AFTER consecutive failures the webhook turns off
 * and the company's history says why.
 */
export async function deliver(job: WebhookJob, deps: { store: Store; api?: ApiStore; fetcher: Fetch }) {
  if (!deps.api) throw new DeliveryError("api store not configured");
  const h = await deps.api.getWebhook(job.site, job.webhook_id);
  if (!h) return { skipped: "deleted" };
  if (!h.enabled) return { skipped: "disabled" };
  const previous = (await deps.api.listDeliveries(job.site, h.id)).filter((d) => d.event_id === job.event.id).length;
  const r = await send(h, job.event, deps.fetcher);
  const now = new Date().toISOString();
  await deps.api.addDelivery({ webhook_id: h.id, site: job.site, event_id: job.event.id, event_type: job.event.type, attempt: previous + 1, status: r.status, ok: !r.error, error: r.error, duration_ms: r.ms, created_at: now });
  if (!r.error) {
    await deps.api.updateWebhook(job.site, h.id, { failures: 0, last_success_at: now });
    return { delivered: r.status };
  }
  const failures = h.failures + 1;
  if (failures >= AUTO_DISABLE_AFTER) {
    await deps.api.updateWebhook(job.site, h.id, { failures, last_failure_at: now, enabled: false, disabled_reason: `連續 ${failures} 次送不到，已自動停用。最後一次：${r.error}` });
    await deps.store.addAccountEvent(job.site, "對外通知", "停用 Webhook", `${hostOf(h.url)} 連續 ${failures} 次送不到`);
    return { disabled: true };
  }
  await deps.api.updateWebhook(job.site, h.id, { failures, last_failure_at: now });
  throw new DeliveryError(`webhook ${hostOf(h.url)}: ${r.error}`);
}

export function webhookView(h: Webhook) {
  const { secret: _secret, ...rest } = h;
  return rest;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ error: message }, status);

function randomHex(bytes: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** `/admin/tenants/:site/webhooks…`, for ADMIN_TOKEN or the shell acting for that one company. */
export async function manageWebhooks(req: Request, parts: string[], ctx: { site: string; actor: string; api: ApiStore; store: Store; fetcher: Fetch; glueHost: string }) {
  const { site, api } = ctx;
  const id = parts[4];
  if (!id && req.method === "GET") {
    return json({ events: Object.keys(WEBHOOK_EVENTS), max: MAX_WEBHOOKS, webhooks: (await api.listWebhooks(site)).map(webhookView) });
  }
  if (!id && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { url?: unknown; events?: unknown; label?: unknown } | null;
    if (!body || typeof body.url !== "string") return fail("請填網址");
    const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
    if (!events.length || events.some((e) => typeof e !== "string" || !(e in WEBHOOK_EVENTS))) return fail("請從清單選要通知的事件");
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    const existing = await api.listWebhooks(site);
    if (existing.length >= MAX_WEBHOOKS) return fail(`每家公司最多 ${MAX_WEBHOOKS} 個 Webhook，先刪掉不用的`, 409);
    const tenant = await ctx.store.getTenant(site);
    if (!tenant) return fail("找不到這家公司", 404);
    const checked = checkUrl(body.url, blockedHosts(tenant, ctx.glueHost));
    if ("error" in checked) return fail(checked.error);
    const dns = await resolvesPublic(checked.url.hostname, ctx.fetcher);
    if (dns) return fail(dns);
    const secret = `whsec_${randomHex(24)}`;
    const hook: Webhook = {
      id: `wh_${randomHex(8)}`,
      site,
      url: checked.url.toString(),
      events: events as string[],
      secret,
      label: label || checked.url.hostname,
      created_by: ctx.actor,
      created_at: new Date().toISOString(),
      enabled: true,
      failures: 0,
      disabled_reason: null,
      last_success_at: null,
      last_failure_at: null,
    };
    await api.addWebhook(hook);
    await ctx.store.addAccountEvent(site, ctx.actor, "新增 Webhook", hook.label);
    return json({ webhook: webhookView(hook), secret }, 201);
  }
  if (!id) return fail("not found", 404);
  const hook = await api.getWebhook(site, id);
  if (!hook) return fail("not found", 404);
  const action = parts[5];
  if (action === "deliveries" && req.method === "GET") return json({ deliveries: await api.listDeliveries(site, id) });
  if (action === "enable" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    const enabled = body.enabled !== false;
    await api.updateWebhook(site, id, enabled ? { enabled: true, failures: 0, disabled_reason: null } : { enabled: false, disabled_reason: "手動停用" });
    await ctx.store.addAccountEvent(site, ctx.actor, enabled ? "啟用 Webhook" : "停用 Webhook", hook.label);
    return json({ ok: true, enabled });
  }
  if (action === "delete" && req.method === "POST") {
    await api.deleteWebhook(site, id);
    await ctx.store.addAccountEvent(site, ctx.actor, "刪除 Webhook", hook.label);
    return json({ ok: true });
  }
  if (action === "test" && req.method === "POST") {
    const event: WebhookEvent = { id: `evt_ping_${randomHex(6)}`, type: "ping", created_at: new Date().toISOString(), data: { message: "DropOut OS 測試通知" } };
    const r = await send(hook, event, ctx.fetcher);
    await api.addDelivery({ webhook_id: id, site, event_id: event.id, event_type: "ping", attempt: 1, status: r.status, ok: !r.error, error: r.error, duration_ms: r.ms, created_at: new Date().toISOString() });
    return json({ ok: !r.error, status: r.status, error: r.error, duration_ms: r.ms });
  }
  return fail("not found", 404);
}
