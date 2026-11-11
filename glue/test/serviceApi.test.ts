import { afterEach, describe, expect, it, vi } from "vitest";
import serviceGolden from "../../frappe-apps/dropout_core/dropout_core/tests/fixtures/dodo-service-v1.json";
import { MemoryApiStore } from "../src/apiStore";
import { handle, type App, type Env } from "../src/app";
import { sha256Hex, toBase64 } from "../src/crypto";
import { canonicalServiceJson, normalizeServiceActivity } from "../src/serviceApi";
import { MemoryStore, type Tenant } from "../src/store";

const A: Tenant = { site: "a.dropout.test", erpnext_url: "https://erp-a.example", erpnext_key: "key-a", erpnext_secret: "PRIVATE_ERP_SECRET", erpnext_webhook_secret: "hook-a", unsubscribe_secret: "u-a" };
const B: Tenant = { ...A, site: "b.dropout.test", erpnext_url: "https://erp-b.example", erpnext_key: "key-b" };
const OP = "11111111-2222-4333-8444-555555555555";
const OTHER_OP = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const payload = () => ({ schema_version: 1, source: "dodo", source_tenant_id: "tenant-a", source_project_id: "project-a", source_record_id: "call-a", source_record_type: "voice_call", occurred_at: "2026-11-11T01:02:03.004Z", summary: "客服需求 🐦\n請回覆", outcome: "needs_followup", handoff: { description: "請人工回覆", priority: "normal", contact_phone: "+886900000001", contact_email: "Ops@example.test" } });
type Call = { url: URL; init: RequestInit; body: any; site: string; method: string };
type Hook = (call: Call, normal: () => Promise<Response>) => Promise<Response>;

// This fixture models the RPC protocol, not MariaDB atomicity. The Frappe suite
// separately verifies real transactions, rollback and concurrent writers.
function harness(hook?: Hook) {
  const store = new MemoryStore();
  store.tenants.set(A.site, A); store.tenants.set(B.site, B);
  const api = new MemoryApiStore();
  const calls: Call[] = [];
  const receipts = new Map<string, any>();
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const call: Call = { url, init: init!, body: JSON.parse(String(init?.body)), site: headers.get("x-frappe-site-name")!, method: url.pathname.split(".").at(-1)! };
    calls.push(call);
    const normal = async () => {
      const { operation_id, payload: p } = call.body;
      const key = `${call.site}:${operation_id}`;
      if (call.method === "party_candidates") return Response.json({ message: { ok: true, data: [{ party_type: "Customer", id: "CUST-1", display_name: "測試企業" }], has_more: false } });
      if (call.method === "get_operation") return Response.json({ message: receipts.has(key) ? { ok: true, receipt: receipts.get(key) } : { ok: false, code: "not_found" } });
      if (call.method !== "create_service_activity") throw new Error("unexpected RPC");
      const request_hash = await sha256Hex(canonicalServiceJson(p));
      const old = receipts.get(key);
      if (old) return Response.json({ message: old.request_hash === request_hash ? { ok: true, receipt: old, replayed: true } : { ok: false, code: "conflict" } });
      const receipt = { schema_version: 1, source: "dodo", operation_id, request_hash, state: "completed", activity: { id: `dodo-${operation_id}`, path: `/app/dropout-service-activity/dodo-${operation_id}` }, handoff: p.handoff ? { id: "todo123abc", path: "/app/todo/todo123abc" } : null, committed_at: "2026-11-11T01:02:04.005Z" };
      receipts.set(key, receipt);
      return Response.json({ message: { ok: true, receipt, replayed: false } });
    };
    return hook ? hook(call, normal) : normal();
  }) as unknown as typeof fetch;
  const env = { TENANT_KEY: toBase64(new Uint8Array(32)), ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell", JOBS: { send: async () => {} } } as unknown as Env;
  const app: App = { store: () => store, api: () => api, fetcher };
  const run = (method: string, path: string, key?: string, value?: unknown, headers: Record<string, string> = {}) => handle(new Request(`https://glue.example${path}`, {
    method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers }, body: value === undefined ? undefined : typeof value === "string" ? value : JSON.stringify(value),
  }), env, app);
  const newKey = async (scopes = ["service:write"], site = A.site) => {
    const response = await run("POST", `/admin/tenants/${site}/api-keys`, "admin", { label: "Dodo test", scopes });
    expect(response.status).toBe(201);
    return await response.json() as { secret: string; key: { id: string; scopes: string[] } };
  };
  const create = (key: string, value: unknown = payload(), operation = OP) => run("POST", "/v1/service-activities", key, value, { "idempotency-key": operation });
  const lock = () => store.accounts.set(A.site, { site: A.site, company: "Synthetic", plan: "monthly", state: "suspended", hosts: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
  return { store, api, calls, receipts, fetcher, run, newKey, create, lock, env, app };
}
const json = async (response: Response) => await response.json() as any;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Dodo service scopes and site boundary", () => {
  it("service write grants only service read; generic keys cannot acquire the new capability", async () => {
    const h = harness();
    const service = await h.newKey();
    expect(service.key.scopes).toEqual(["service:read", "service:write"]);
    const generic = await h.newKey(["write"]);
    expect(generic.key.scopes).toEqual(["read", "write"]);
    expect((await h.run("GET", "/v1/customers", service.secret)).status).toBe(403);
    expect((await h.create(generic.secret)).status).toBe(403);
    expect((await h.run("POST", "/v1/party-candidates", generic.secret, { phone: "+886900000001" })).status).toBe(403);
    const read = await h.newKey(["service:read"]);
    expect((await h.create(read.secret)).status).toBe(403);
    expect((await h.run("POST", "/v1/party-candidates", read.secret, { phone: "+886900000001" })).status).toBe(200);
    expect(h.calls).toHaveLength(1);
  });

  it("keeps phone in a body, rejects overposting, and derives the upstream site solely from the key", async () => {
    const h = harness(); const a = await h.newKey(), b = await h.newKey(["service:write"], B.site);
    expect((await h.create(a.secret)).status).toBe(201);
    expect((await h.create(b.secret)).status).toBe(201);
    expect(h.receipts.size).toBe(2);
    await h.run("POST", "/v1/party-candidates", a.secret, { phone: "+886900000001" });
    expect(h.calls.map((c) => c.url.hostname)).toEqual(["erp-a.example", "erp-b.example", "erp-a.example"]);
    expect(h.calls.map((c) => c.site)).toEqual([A.site, B.site, A.site]);
    expect(h.calls.every((c) => !c.url.search && !c.url.href.includes("900000001"))).toBe(true);
    expect(h.calls.at(-1)!.body).toEqual({ phone: "+886900000001" });
    expect((await h.create(a.secret, { ...payload(), site: B.site })).status).toBe(400);
    expect((await h.run("GET", `/v1/operations/${OP}?site=${B.site}`, a.secret)).status).toBe(400);
    expect(h.calls).toHaveLength(3);
  });

  it("blocks missing/revoked keys before upstream and rejects late revocation before disclosure", async () => {
    let revoke: (() => Promise<unknown>) | undefined;
    const h = harness(async (_c, normal) => { const response = await normal(); await revoke?.(); return response; });
    expect((await h.create("bad-key")).status).toBe(401);
    const k = await h.newKey();
    revoke = () => h.api.revokeKey(A.site, k.key.id, new Date().toISOString());
    const response = await h.create(k.secret);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await json(response))).not.toContain("request_hash");
    expect(h.receipts.size).toBe(1); // the write can already have committed
    expect((await h.create(k.secret)).status).toBe(401);
    expect(h.calls).toHaveLength(1);
    revoke = undefined;
    const rotated = await h.newKey();
    expect((await h.run("GET", `/v1/operations/${OP}`, rotated.secret)).status).toBe(200);
  });

  it("does not send upstream if a key is revoked while the final account check is waiting", async () => {
    const h = harness(); const k = await h.newKey();
    let reads = 0;
    vi.spyOn(h.store, "getAccount").mockImplementation(async () => {
      if (++reads === 2) await h.api.revokeKey(A.site, k.key.id, new Date().toISOString());
      return null;
    });
    expect((await h.create(k.secret)).status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it.each(["scope", "site"])("fails closed if the key's %s changes during upstream I/O", async (kind) => {
    const h = harness(async (_c, normal) => {
      const result = await normal();
      if (kind === "scope") h.api.keys[0].scopes = ["read", "write"];
      else h.api.keys[0].site = B.site;
      return result;
    });
    const k = await h.newKey(); const response = await h.create(k.secret);
    expect(response.status).toBe(kind === "scope" ? 403 : 401);
    expect(JSON.stringify(await json(response))).not.toContain("request_hash");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].site).toBe(A.site);
  });

  it("locks every activity POST including replay; candidates and committed receipt reads remain available", async () => {
    const h = harness(); const k = await h.newKey();
    expect((await h.create(k.secret)).status).toBe(201);
    h.lock();
    expect((await h.create(k.secret)).status).toBe(423);
    expect((await h.create(k.secret, payload(), OTHER_OP)).status).toBe(423);
    expect(h.calls).toHaveLength(1);
    expect((await h.run("GET", `/v1/operations/${OP}`, k.secret)).status).toBe(200);
    expect((await h.run("POST", "/v1/party-candidates", k.secret, { phone: "+886900000001" })).status).toBe(200);
  });
});

describe("durable operation protocol", () => {
  it("matches the shared Python/TypeScript normalization, canonical JSON and SHA-256 golden vector", async () => {
    const normalized = normalizeServiceActivity(serviceGolden.input);
    expect(normalized).toEqual(serviceGolden.normalized);
    const canonical = canonicalServiceJson(normalized);
    expect(canonical).toBe(serviceGolden.canonical);
    expect(await sha256Hex(canonical)).toBe(serviceGolden.sha256);
  });

  it("replays across API key rotation, conflicts on changed body, and never reserves D1 seen keys", async () => {
    const h = harness(); const claim = vi.spyOn(h.store, "claim"), release = vi.spyOn(h.store, "release");
    const first = await h.newKey();
    const created = await json(await h.create(first.secret));
    await h.api.revokeKey(A.site, first.key.id, new Date().toISOString());
    const next = await h.newKey();
    const replayResponse = await h.create(next.secret);
    expect(replayResponse.status).toBe(200);
    expect(await json(replayResponse)).toEqual({ data: created.data, replayed: true });
    expect((await h.create(next.secret, { ...payload(), summary: "Changed" })).status).toBe(409);
    expect((await h.run("GET", `/v1/operations/${OTHER_OP}`, next.secret)).status).toBe(404);
    expect(h.receipts.size).toBe(1);
    expect(claim).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
  });

  it("recovers a committed operation after the successful response was lost without claiming success early", async () => {
    let lose = true;
    const h = harness(async (c, normal) => {
      const response = await normal();
      if (c.method === "create_service_activity" && lose) { lose = false; throw new Error("PRIVATE_ERP_SECRET lost response"); }
      return response;
    });
    const k = await h.newKey();
    const failed = await h.create(k.secret);
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await json(failed))).not.toContain("PRIVATE_ERP_SECRET");
    const read = await json(await h.run("GET", `/v1/operations/${OP}`, k.secret));
    expect(read.data.operation_id).toBe(OP);
    const replay = await h.create(k.secret);
    expect(replay.status).toBe(200);
    expect((await json(replay)).data).toEqual(read.data);
    expect(h.receipts.size).toBe(1);
  });

  it("canonicalizes omitted optional fields to null without changing case, spaces or Unicode scalars", () => {
    const raw = { ...payload(), summary: "  🐦\n\t內容  ", handoff: { description: "原文", priority: "normal", contact_name: "", preferred_contact_window: "", contact_email: "Ops@Example.TEST" } };
    const normalized = normalizeServiceActivity(raw);
    expect(normalized.summary).toBe(raw.summary);
    expect(normalized.party).toBeNull();
    expect(normalized.handoff).toEqual({ description: "原文", priority: "normal", contact_name: "", contact_phone: null, contact_email: "Ops@Example.TEST", preferred_contact_window: "" });
    expect(canonicalServiceJson({ z: "🐦", a: { b: "台灣", a: null } })).toBe('{"a":{"a":null,"b":"台灣"},"z":"🐦"}');
  });
});

describe("validation and bounded upstream transport", () => {
  it.each([
    { ...payload(), transcript: "PRIVATE_TRANSCRIPT" },
    { ...payload(), source_record_type: ["voice_call"] },
    { ...payload(), source: "another-app" },
    { ...payload(), source_project_id: "project-a\n" },
    { ...payload(), source_tenant_id: "tenant-a\r" },
    { ...payload(), occurred_at: "2026-02-30T01:02:03.004Z" },
    { ...payload(), occurred_at: "2026-11-11T01:02:03+08:00" },
    { ...payload(), summary: "\ud800" },
    { ...payload(), summary: "bad\u007f" },
    { ...payload(), summary: "x".repeat(2001) },
    { ...payload(), party: { party_type: "Customer", id: "C-1", confirmed: false } },
    { ...payload(), handoff: { ...payload().handoff, assigned_to: "admin" } },
    { ...payload(), handoff: { ...payload().handoff, contact_email: "bad@<host>.test" } },
    { ...payload(), handoff: { ...payload().handoff, contact_phone: "0900-000-001" } },
    { ...payload(), handoff: { ...payload().handoff, contact_phone: "+886900000001\n" } },
    { ...payload(), outcome: "no_contact" },
    { ...payload(), handoff: null },
  ])("rejects invalid activity without sending it upstream", async (value) => {
    const h = harness(); const k = await h.newKey();
    expect((await h.create(k.secret, value)).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });

  it("caps actual UTF-8 JSON bytes, requires canonical UUID, and preserves API error request IDs", async () => {
    const h = harness(); const k = await h.newKey();
    const oversized = { ...payload(), summary: "🐦".repeat(2000), handoff: { description: "🐦".repeat(2000), priority: "normal", contact_name: "台".repeat(140), preferred_contact_window: "台".repeat(200) } };
    const text = JSON.stringify(oversized);
    expect(text.length).toBeLessThan(16_384); expect(new TextEncoder().encode(text).length).toBeGreaterThan(16_384);
    const response = await h.create(k.secret, text);
    expect(response.status).toBe(400);
    expect((await json(response)).error.request_id).toBe(response.headers.get("x-request-id"));
    expect((await h.create(k.secret, payload(), "NOT-A-UUID")).status).toBe(400);
    expect((await h.create(k.secret, payload(), OTHER_OP.toUpperCase())).status).toBe(400);
    expect(h.calls).toHaveLength(0);
    const wrongMethod = await h.run("GET", "/v1/service-activities", k.secret);
    expect(wrongMethod.status).toBe(405); expect(wrongMethod.headers.get("allow")).toBe("POST");
  });

  it.each(["operation", "hash", "source", "activity-path", "handoff-path", "state", "extra", "handoff-missing", "replay-type"])("refuses a misleading upstream success: %s", async (kind) => {
    const h = harness(async (_c, normal) => {
      const response = await json(await normal()); const r = response.message.receipt;
      if (kind === "operation") r.operation_id = OTHER_OP;
      if (kind === "hash") r.request_hash = "0".repeat(64);
      if (kind === "source") r.source = "another-app";
      if (kind === "activity-path") r.activity.path = "https://evil.invalid/private";
      if (kind === "handoff-path") r.handoff = { id: "..", path: "/app/todo/.." };
      if (kind === "state") r.state = "pending";
      if (kind === "extra") r.summary = "PRIVATE_TRANSCRIPT";
      if (kind === "handoff-missing") r.handoff = null;
      if (kind === "replay-type") response.message.replayed = "false";
      return Response.json(response);
    });
    const k = await h.newKey(); const response = await h.create(k.secret);
    expect(response.status).toBe(502);
    const text = JSON.stringify(await json(response));
    expect(text).not.toContain("PRIVATE_TRANSCRIPT"); expect(text).not.toContain("evil.invalid"); expect(text).not.toContain("request_hash");
  });

  it("rejects redirects without forwarding ERP credentials and bounds response bodies", async () => {
    const h = harness(async () => new Response(null, { status: 307, headers: { location: "https://evil.invalid/credential" } }));
    const k = await h.newKey();
    expect((await h.create(k.secret)).status).toBe(502);
    expect(h.calls).toHaveLength(1); expect(h.calls[0].init.redirect).toBe("manual");
    expect(new Headers(h.calls[0].init.headers).get("authorization")).toBe("token key-a:PRIVATE_ERP_SECRET");
    const huge = harness(async () => new Response("x".repeat(32_769)));
    const key = await huge.newKey(); expect((await huge.create(key.secret)).status).toBe(502);
  });

  it.each(["hash", "todo"])("rejects a receipt lookup with a trailing newline in %s", async (field) => {
    const h = harness(); const k = await h.newKey();
    expect((await h.create(k.secret)).status).toBe(201);
    const record = h.receipts.get(`${A.site}:${OP}`);
    if (field === "hash") record.request_hash += "\n";
    else { record.handoff.id += "\n"; record.handoff.path += "\n"; }
    expect((await h.run("GET", `/v1/operations/${OP}`, k.secret)).status).toBe(502);
  });

  it("applies the timeout while reading an unfinished upstream response body", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const h = harness(async () => { entered(); return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"message":')); } })); });
    const k = await h.newKey(); const pending = h.create(k.secret);
    await started;
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await pending).status).toBe(502);
  });

  it.each(["duplicates", "oversized", "extra"])("sanitizes and bounds party candidates: %s", async (kind) => {
    const candidate = { party_type: "Customer", id: "C-1", display_name: "Synthetic" };
    const h = harness(async () => Response.json({ message: { ok: true, data: kind === "duplicates" ? [candidate, candidate] : kind === "oversized" ? Array.from({ length: 11 }, (_, i) => ({ ...candidate, id: `C-${i}` })) : [{ ...candidate, email: "PRIVATE_EMAIL" }], has_more: false } }));
    const k = await h.newKey();
    const response = await h.run("POST", "/v1/party-candidates", k.secret, { phone: "+886900000001" });
    expect(response.status).toBe(502); expect(JSON.stringify(await json(response))).not.toContain("PRIVATE_EMAIL");
  });
});
