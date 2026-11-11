import { sha256Hex } from "./crypto";
import type { Tenant } from "./store";

const MAX_BODY = 16_384;
const MAX_UPSTREAM = 32_768;
const TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const PHONE = /^\+[1-9][0-9]{6,14}$/;
const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/u;
// JavaScript's $ may match immediately before a final newline. These protocol
// fields need a complete match, equivalent to the receiver's Python \Z.
const exact = (pattern: RegExp, value: string) => pattern.exec(value)?.[0] === value;
type ErrorCode = "invalid_request" | "not_found" | "conflict" | "account_locked" | "erpnext_error" | "erpnext_unavailable" | "not_configured";
export class ServiceApiError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string) { super(message); }
}
const invalid = () => new ServiceApiError(400, "invalid_request", "服務紀錄格式不正確，請依 Dodo API 契約檢查欄位");
const unavailable = () => new ServiceApiError(502, "erpnext_unavailable", "ERPNext 結果尚未確認；請保留原操作識別碼，勿改號重送");
const invalidReceipt = () => new ServiceApiError(502, "erpnext_error", "ERPNext 回應未通過驗證；請保留原操作識別碼查證");

type Party = { party_type: "Customer" | "Lead"; id: string; confirmed: true };
type Handoff = { description: string; priority: "normal" | "urgent"; contact_name: string | null; contact_phone: string | null; contact_email: string | null; preferred_contact_window: string | null };
export type ServiceActivity = {
  schema_version: 1; source: "dodo"; source_tenant_id: string; source_project_id: string; source_record_id: string;
  source_record_type: "voice_call" | "handoff"; occurred_at: string; summary: string;
  outcome: "needs_followup" | "resolved" | "no_contact" | "unknown"; party: Party | null; handoff: Handoff | null;
};
type Link = { id: string; path: string };
export type ServiceReceipt = { schema_version: 1; source: "dodo"; operation_id: string; request_hash: string; state: "completed"; activity: Link; handoff: Link | null; committed_at: string };
type ServiceRoute = { kind: "party-candidates" | "service-activities" } | { kind: "operations"; operationId: string };
type Context = { tenant: Tenant; fetcher: typeof fetch; authorize: () => Promise<void>; writable: () => Promise<void> };

export function serviceRoute(path: string): ServiceRoute | null {
  if (path === "/v1/party-candidates") return { kind: "party-candidates" };
  if (path === "/v1/service-activities") return { kind: "service-activities" };
  const operation = path.match(/^\/v1\/operations\/([^/]+)$/);
  return operation ? { kind: "operations", operationId: operation[1] } : null;
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}
function scalar(value: unknown, max: number, required = true, multiline = false): string {
  if (typeof value !== "string" || [...value].length > max || (required && !value.trim())) throw invalid();
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) throw invalid();
    if ((cp < 32 || (cp >= 127 && cp <= 159)) && !(multiline && (cp === 9 || cp === 10))) throw invalid();
  }
  return value;
}
function optional(value: unknown, max: number): string | null { return value === undefined || value === null ? null : scalar(value, max, false); }
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw invalid();
  return value;
}
function sourceId(value: unknown): string {
  if (typeof value !== "string" || !exact(SOURCE_ID, value)) throw invalid();
  return value;
}
function operationId(value: unknown): string {
  if (typeof value !== "string" || !exact(UUID, value)) throw invalid();
  return value;
}
function phone(value: unknown): string {
  if (typeof value !== "string" || !exact(PHONE, value)) throw invalid();
  return value;
}

export function normalizeServiceActivity(value: unknown): ServiceActivity {
  const data = object(value, ["schema_version", "source", "source_tenant_id", "source_project_id", "source_record_id", "source_record_type", "occurred_at", "summary", "outcome", "party", "handoff"]);
  if (data.schema_version !== 1 || data.source !== "dodo" || (data.source_record_type !== "voice_call" && data.source_record_type !== "handoff") || typeof data.outcome !== "string" || !["needs_followup", "resolved", "no_contact", "unknown"].includes(data.outcome)) throw invalid();
  let party: Party | null = null;
  if (data.party !== undefined && data.party !== null) {
    const p = object(data.party, ["party_type", "id", "confirmed"]);
    if ((p.party_type !== "Customer" && p.party_type !== "Lead") || p.confirmed !== true) throw invalid();
    party = { party_type: p.party_type, id: scalar(p.id, 140), confirmed: true };
  }
  let handoff: Handoff | null = null;
  if (data.handoff !== undefined && data.handoff !== null) {
    const h = object(data.handoff, ["description", "priority", "contact_name", "contact_phone", "contact_email", "preferred_contact_window"]);
    if (h.priority !== "normal" && h.priority !== "urgent") throw invalid();
    const email = optional(h.contact_email, 140);
    if (email !== null && !EMAIL.test(email)) throw invalid();
    handoff = {
      description: scalar(h.description, 2000, true, true), priority: h.priority,
      contact_name: optional(h.contact_name, 140),
      contact_phone: h.contact_phone === undefined || h.contact_phone === null ? null : phone(h.contact_phone),
      contact_email: email, preferred_contact_window: optional(h.preferred_contact_window, 200),
    };
  }
  if ((data.outcome === "needs_followup" && !handoff) || (data.outcome === "no_contact" && handoff)) throw invalid();
  return {
    schema_version: 1, source: "dodo", source_tenant_id: sourceId(data.source_tenant_id), source_project_id: sourceId(data.source_project_id), source_record_id: sourceId(data.source_record_id),
    source_record_type: data.source_record_type as ServiceActivity["source_record_type"], occurred_at: timestamp(data.occurred_at), summary: scalar(data.summary, 2000, true, true),
    outcome: data.outcome as ServiceActivity["outcome"], party, handoff,
  };
}

/** Fixed schema has ASCII property names. Text is preserved, with literal Unicode. */
export function canonicalServiceJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalServiceJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalServiceJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("cancelled"));
    if (signal.aborted) { void promise.catch(() => {}); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
async function boundedJson(stream: ReadableStream<Uint8Array> | null, max: number, signal: AbortSignal): Promise<unknown> {
  if (!stream) throw new Error("missing body");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, finished = false;
  try {
    for (;;) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("body limit");
      chunks.push(value);
    }
    finished = true;
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}
async function inputBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw invalid();
  try { return await boundedJson(request.body, MAX_BODY, AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])); }
  catch { throw invalid(); }
}

function rpcError(code: unknown): never {
  if (code === "invalid_request") throw invalid();
  if (code === "not_found") throw new ServiceApiError(404, "not_found", "找不到此服務操作或指定的 CRM 對象");
  if (code === "conflict") throw new ServiceApiError(409, "conflict", "原操作識別碼已對應不同的服務內容");
  if (code === "account_locked") throw new ServiceApiError(423, "account_locked", "這家公司目前只能讀取，不能送出服務紀錄");
  if (code === "forbidden") throw new ServiceApiError(502, "erpnext_error", "ERPNext 整合帳號缺少服務接收權限");
  if (code === "internal_error") throw unavailable();
  throw invalidReceipt();
}

async function rpc(ctx: Context, request: Request, method: "party_candidates" | "create_service_activity" | "get_operation", args: Record<string, unknown>, write = false): Promise<Record<string, unknown>> {
  if (write) await ctx.writable();
  await ctx.authorize();
  let result: unknown, failed: unknown;
  try {
    const base = new URL(ctx.tenant.erpnext_url);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new ServiceApiError(503, "not_configured", "ERPNext 服務端點必須使用已設定的 HTTPS 網址");
    const url = `${base.href.replace(/\/$/, "")}/api/method/dropout_core.service_api.${method}`;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    const response = await abortable(ctx.fetcher(url, {
      method: "POST", redirect: "manual", signal,
      headers: { Authorization: `token ${ctx.tenant.erpnext_key}:${ctx.tenant.erpnext_secret}`, "Content-Type": "application/json", Accept: "application/json", "X-Frappe-Site-Name": ctx.tenant.site },
      body: JSON.stringify(args),
    }), signal);
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw unavailable(); }
    result = await boundedJson(response.body, MAX_UPSTREAM, signal);
  } catch (error) { failed = error instanceof ServiceApiError ? error : unavailable(); }
  // A late key revocation/scope or site change must not disclose the response.
  // A write may already have committed; callers recover with the same operation.
  if (write) await ctx.writable();
  await ctx.authorize();
  if (failed) throw failed;
  let message: Record<string, unknown>;
  try {
    const outer = object(result, ["message"]);
    message = object(outer.message, ["ok", "code", "receipt", "replayed", "data", "has_more"]);
    if (message.ok === false) object(message, ["ok", "code"]);
  } catch { throw invalidReceipt(); }
  if (message.ok === false) rpcError(message.code);
  if (message.ok !== true) throw invalidReceipt();
  return message;
}

function receipt(value: unknown, id: string, expected?: { hash: string; handoff: boolean }): ServiceReceipt {
  try {
    const r = object(value, ["schema_version", "source", "operation_id", "request_hash", "state", "activity", "handoff", "committed_at"]);
    if (r.schema_version !== 1 || r.source !== "dodo" || r.operation_id !== id || r.state !== "completed" || typeof r.request_hash !== "string" || !exact(/^[0-9a-f]{64}$/, r.request_hash) || (expected && r.request_hash !== expected.hash)) throw invalidReceipt();
    const activity = object(r.activity, ["id", "path"]);
    if (activity.id !== `dodo-${id}` || activity.path !== `/app/dropout-service-activity/dodo-${id}`) throw invalidReceipt();
    let handoff: Link | null = null;
    if (r.handoff !== null) {
      const h = object(r.handoff, ["id", "path"]);
      if (typeof h.id !== "string" || !exact(/^[A-Za-z0-9][A-Za-z0-9_-]{0,139}$/, h.id) || h.path !== `/app/todo/${h.id}`) throw invalidReceipt();
      handoff = { id: h.id, path: h.path as string };
    }
    if (expected && Boolean(handoff) !== expected.handoff) throw invalidReceipt();
    return { schema_version: 1, source: "dodo", operation_id: id, request_hash: r.request_hash, state: "completed", activity: { id: activity.id as string, path: activity.path as string }, handoff, committed_at: timestamp(r.committed_at) };
  } catch { throw invalidReceipt(); }
}

export async function handleServiceApi(request: Request, route: ServiceRoute, ctx: Context): Promise<{ status: number; body: unknown }> {
  if (new URL(request.url).search) throw invalid();
  if (route.kind === "operations") {
    const id = operationId(route.operationId);
    const response = await rpc(ctx, request, "get_operation", { operation_id: id });
    try { object(response, ["ok", "receipt"]); } catch { throw invalidReceipt(); }
    return { status: 200, body: { data: receipt(response.receipt, id) } };
  }
  if (route.kind === "party-candidates") {
    const input = object(await inputBody(request), ["phone"]);
    const response = await rpc(ctx, request, "party_candidates", { phone: phone(input.phone) });
    try {
      object(response, ["ok", "data", "has_more"]);
      if (!Array.isArray(response.data) || response.data.length > 10 || typeof response.has_more !== "boolean") throw invalidReceipt();
      const seen = new Set<string>();
      const data = response.data.map((value: unknown) => {
        const p = object(value, ["party_type", "id", "display_name"]);
        if (p.party_type !== "Customer" && p.party_type !== "Lead") throw invalidReceipt();
        const id = scalar(p.id, 140), display_name = scalar(p.display_name, 140);
        const key = JSON.stringify([p.party_type, id]);
        if (seen.has(key)) throw invalidReceipt();
        seen.add(key);
        return { party_type: p.party_type, id, display_name };
      });
      return { status: 200, body: { data, has_more: response.has_more } };
    } catch { throw invalidReceipt(); }
  }
  await ctx.writable();
  const id = operationId(request.headers.get("idempotency-key"));
  const payload = normalizeServiceActivity(await inputBody(request));
  const hash = await sha256Hex(canonicalServiceJson(payload));
  const response = await rpc(ctx, request, "create_service_activity", { operation_id: id, payload }, true);
  try { object(response, ["ok", "receipt", "replayed"]); } catch { throw invalidReceipt(); }
  if (typeof response.replayed !== "boolean") throw invalidReceipt();
  return { status: response.replayed ? 200 : 201, body: { data: receipt(response.receipt, id, { hash, handoff: Boolean(payload.handoff) }), replayed: response.replayed } };
}
