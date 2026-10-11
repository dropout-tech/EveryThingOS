import { describe, expect, it, vi } from "vitest";
import { MemoryApiStore } from "../src/apiStore";
import { consume, handle, type App, type Env } from "../src/app";
import { toBase64 } from "../src/crypto";
import { runJob, type Deps, type Job } from "../src/jobs";
import { fixedWindow, RATE_LIMIT, RATE_WINDOW_MS, taipeiDatetime } from "../src/publicApi";
import { MemoryStore, type Tenant } from "../src/store";
import { AUTO_DISABLE_AFTER, checkUrl, isPrivateAddress, resolvesPublic, sign, verifySignature, type WebhookJob } from "../src/webhooks";

const A: Tenant = { site: "a.dropout.tw", erpnext_url: "https://erp-a.example", erpnext_key: "ka", erpnext_secret: "sa", erpnext_webhook_secret: "ha", unsubscribe_secret: "ua" };
const B: Tenant = { site: "b.dropout.tw", erpnext_url: "https://erp-b.example", erpnext_key: "kb", erpnext_secret: "sb", erpnext_webhook_secret: "hb", unsubscribe_secret: "ub" };

type Call = { url: string; method: string; body: any; headers: Record<string, string> };

const dns = (ip: string) => ({ Answer: [{ type: ip.includes(":") ? 28 : 1, data: ip }] });

function harness(routes: Record<string, (call: Call) => unknown> = {}) {
  const store = new MemoryStore();
  store.tenants.set(A.site, A);
  store.tenants.set(B.site, B);
  const api = new MemoryApiStore();
  const calls: Call[] = [];
  const sent: Job[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const raw = typeof init?.body === "string" ? init.body : undefined;
    let body: any = raw;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      /* keep text */
    }
    const call: Call = { url, method: init?.method ?? "GET", body, headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    calls.push(call);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      const type = new URL(url).searchParams.get("type");
      if (name === "rebind.example" && type === "A") return Response.json(dns("10.0.0.5"));
      return Response.json(type === "A" ? dns("93.184.216.34") : {});
    }
    for (const [pattern, fn] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const res = fn(call);
        return res instanceof Response ? res : Response.json(res);
      }
    }
    return Response.json({ data: [] });
  }) as unknown as typeof fetch;
  const env = {
    JOBS: { send: async (j: Job) => void sent.push(j) },
    TENANT_KEY: toBase64(new Uint8Array(32)),
    ADMIN_TOKEN: "admin",
    SHELL_TOKEN: "shell",
  } as unknown as Env;
  const app: App = { store: () => store, fetcher, api: () => api };
  const deps: Deps = { store, fetcher, summaryModel: "m", api, queue: env.JOBS };
  return { store, api, calls, sent, env, app, deps, fetcher };
}

type H = ReturnType<typeof harness>;

const admin = (method: string, path: string, token = "admin", body?: unknown) =>
  new Request(`https://glue.example${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-actor": "boss@a.tw" },
  });

const v1 = (method: string, path: string, key?: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://glue.example${path}`, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
  });

async function newKey(h: H, site = A.site, scopes: string[] = ["read"], token = "shell") {
  const res = await handle(admin("POST", `/admin/tenants/${site}/api-keys`, token, { label: "蝦皮同步", scopes }), h.env, h.app);
  expect(res.status).toBe(201);
  return (await res.json()) as { key: { id: string; prefix: string; display: string; scopes: string[] }; secret: string };
}

const body = async (res: Response) => (await res.json()) as any;

describe("API keys", () => {
  it("shows the key once, stores only its hash, and lists without secrets", async () => {
    const h = harness();
    const { key, secret } = await newKey(h);
    expect(secret).toMatch(/^dok_live_[0-9a-f]{48}$/);
    expect(key.display).toBe(`${secret.slice(0, 15)}…`);
    expect(JSON.stringify(h.api.keys)).not.toContain(secret);
    expect(h.api.keys[0].hash).toHaveLength(64);
    const list = await body(await handle(admin("GET", `/admin/tenants/${A.site}/api-keys`, "shell"), h.env, h.app));
    expect(list.keys).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(h.api.keys[0].hash);
    expect(list.keys[0]).toMatchObject({ label: "蝦皮同步", scopes: ["read"], created_by: "boss@a.tw" });
    expect((await h.store.listAccountEvents(A.site))[0]).toMatchObject({ action: "新增 API 金鑰", actor: "boss@a.tw" });
  });

  it("caps active keys per company and refuses bad input", async () => {
    const h = harness();
    for (let i = 0; i < 10; i++) await newKey(h);
    expect((await handle(admin("POST", `/admin/tenants/${A.site}/api-keys`, "shell", { label: "x" }), h.env, h.app)).status).toBe(409);
    await handle(admin("POST", `/admin/tenants/${A.site}/api-keys/${h.api.keys[0].id}/revoke`, "shell"), h.env, h.app);
    expect((await handle(admin("POST", `/admin/tenants/${A.site}/api-keys`, "shell", { label: "x" }), h.env, h.app)).status).toBe(201);
    expect((await handle(admin("POST", `/admin/tenants/${B.site}/api-keys`, "shell", { label: "" }), h.env, h.app)).status).toBe(400);
    expect((await handle(admin("POST", `/admin/tenants/${B.site}/api-keys`, "shell", { label: "x", scopes: ["admin"] }), h.env, h.app)).status).toBe(400);
    expect((await handle(admin("POST", `/admin/tenants/nobody/api-keys`, "shell", { label: "x" }), h.env, h.app)).status).toBe(404);
  });

  it("management needs a glue token; the shell token still cannot reach other admin routes", async () => {
    const h = harness();
    expect((await handle(admin("GET", `/admin/tenants/${A.site}/api-keys`, "wrong"), h.env, h.app)).status).toBe(403);
    expect((await handle(admin("PUT", `/admin/tenants/${A.site}/api-keys`, "shell"), h.env, h.app)).status).toBe(403);
    expect((await handle(admin("GET", "/admin/accounts", "shell"), h.env, h.app)).status).toBe(403);
    expect((await handle(admin("GET", `/admin/tenants/${A.site}/api-keys`, "admin"), h.env, h.app)).status).toBe(200);
  });

  it("one company cannot revoke another company's key", async () => {
    const h = harness();
    const { key, secret } = await newKey(h, A.site);
    expect((await handle(admin("POST", `/admin/tenants/${B.site}/api-keys/${key.id}/revoke`, "shell"), h.env, h.app)).status).toBe(404);
    expect((await handle(v1("GET", "/v1/customers", secret), h.env, h.app)).status).toBe(200);
  });
});

describe("/v1 auth and tenant isolation", () => {
  it("401 without a key, with a wrong key, and after revoking", async () => {
    const h = harness();
    const { key, secret } = await newKey(h);
    let res = await handle(v1("GET", "/v1/customers"), h.env, h.app);
    expect(res.status).toBe(401);
    expect((await body(res)).error.code).toBe("unauthorized");
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect((await handle(v1("GET", "/v1/customers", `dok_live_${"0".repeat(48)}`), h.env, h.app)).status).toBe(401);
    expect((await handle(v1("GET", "/v1/customers", "admin"), h.env, h.app)).status).toBe(401);
    expect((await handle(v1("GET", "/v1/customers", secret), h.env, h.app)).status).toBe(200);
    await handle(admin("POST", `/admin/tenants/${A.site}/api-keys/${key.id}/revoke`, "shell"), h.env, h.app);
    expect((await handle(v1("GET", "/v1/customers", secret), h.env, h.app)).status).toBe(401);
  });

  it("the company comes from the key: each key reaches only its own ERPNext", async () => {
    const h = harness();
    const a = await newKey(h, A.site);
    const b = await newKey(h, B.site);
    await handle(v1("GET", "/v1/customers", a.secret), h.env, h.app);
    await handle(v1("GET", "/v1/customers", b.secret), h.env, h.app);
    expect(h.calls.map((c) => new URL(c.url).host)).toEqual(["erp-a.example", "erp-b.example"]);
    expect(h.calls[0].headers.authorization).toBe("token ka:sa");
    const res = await handle(v1("GET", `/v1/customers?site=${B.site}`, a.secret), h.env, h.app);
    expect(res.status).toBe(400);
    expect(h.calls).toHaveLength(2);
    expect(h.api.keys[0].last_used_at).not.toBeNull();
  });

  it("read keys cannot write; write keys can", async () => {
    const h = harness({ "dropout_core.public_api.create_customer": () => ({ message: { ok: true, customer: { name: "CUST-0001", customer_name: "安安商行", tax_id: "22099131" } } }) });
    const read = await newKey(h, A.site, ["read"]);
    const write = await newKey(h, A.site, ["write"]);
    expect(write.key.scopes).toEqual(["read", "write"]);
    let res = await handle(v1("POST", "/v1/customers", read.secret, { customer_name: "安安商行" }), h.env, h.app);
    expect(res.status).toBe(403);
    expect((await body(res)).error.code).toBe("insufficient_scope");
    res = await handle(v1("POST", "/v1/customers", write.secret, { customer_name: "安安商行", tax_id: "22099131", email: "Boss@AnAn.tw" }), h.env, h.app);
    expect(res.status).toBe(201);
    expect((await body(res)).data).toMatchObject({ id: "CUST-0001", customer_name: "安安商行" });
    expect(h.calls.at(-1)!.body).toEqual({ customer_name: "安安商行", tax_id: "22099131", email: "boss@anan.tw" });
  });

  it("unknown paths are 404 and wrong methods 405 with Allow", async () => {
    const h = harness();
    const { secret } = await newKey(h, A.site, ["write"]);
    expect((await handle(v1("GET", "/v1/users", secret), h.env, h.app)).status).toBe(404);
    expect((await handle(v1("GET", "/v1/customers/CUST-1", secret), h.env, h.app)).status).toBe(404);
    const res = await handle(v1("DELETE", "/v1/customers", secret), h.env, h.app);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, POST");
    expect((await handle(v1("GET", "/v1/leads", secret), h.env, h.app)).status).toBe(405);
  });
});

describe("/v1 reads", () => {
  it("sends only whitelisted fields and filters, and pages with limit + 1", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ name: `SO-${i}`, customer: "C1", grand_total: 100 * i }));
    const h = harness({ "/api/resource/Sales%20Order": () => ({ data: rows }) });
    const { secret } = await newKey(h);
    const res = await handle(v1("GET", "/v1/sales-orders?limit=2&offset=4&status=To%20Bill&customer=C1&modified_since=2026-10-01T00:00:00Z&order=modified", secret), h.env, h.app);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ data: [{ id: "SO-0", customer: "C1", grand_total: 0 }, { id: "SO-1", customer: "C1", grand_total: 100 }], has_more: true, next_offset: 6 });
    const q = new URL(h.calls[0].url).searchParams;
    expect(JSON.parse(q.get("fields")!)).toContain("per_billed");
    expect(JSON.parse(q.get("filters")!)).toEqual([["customer", "=", "C1"], ["status", "=", "To Bill"], ["modified", ">=", "2026-10-01 08:00:00"]]);
    expect(q.get("limit_page_length")).toBe("3");
    expect(q.get("limit_start")).toBe("4");
    expect(q.get("order_by")).toBe("modified asc");
  });

  it("rejects unknown or malformed parameters before calling ERPNext", async () => {
    const h = harness();
    const { secret } = await newKey(h);
    for (const qs of ["limit=101", "limit=0", "limit=abc", "offset=-1", "fields=password", "filters=[]", "status=Hacked", "modified_since=yesterday", "order=name", "limit=1&limit=2", "tax_id=123"]) {
      const res = await handle(v1("GET", `/v1/${qs.startsWith("status") ? "invoices" : "customers"}?${qs}`, secret), h.env, h.app);
      expect(res.status, qs).toBe(400);
      expect((await body(res)).error.code).toBe("invalid_request");
    }
    expect(h.calls).toHaveLength(0);
  });

  it("strips LIKE wildcards from q", async () => {
    const h = harness();
    const { secret } = await newKey(h);
    await handle(v1("GET", `/v1/items?q=${encodeURIComponent("%螺絲_")}`, secret), h.env, h.app);
    expect(JSON.parse(new URL(h.calls[0].url).searchParams.get("filters")!)).toEqual([["item_name", "like", "%螺絲%"]]);
  });

  it("ERPNext down → 502 without upstream details", async () => {
    const h = harness({ "/api/resource/": () => new Response("Traceback: secret sa", { status: 503 }) });
    const { secret } = await newKey(h);
    const res = await handle(v1("GET", "/v1/invoices", secret), h.env, h.app);
    expect(res.status).toBe(502);
    const b = await body(res);
    expect(b.error.code).toBe("erpnext_unavailable");
    expect(JSON.stringify(b)).not.toContain("Traceback");
    expect(b.error.request_id).toBe(res.headers.get("x-request-id"));
  });

  it("converts dates to ERPNext's Taiwan wall clock", () => {
    expect(taipeiDatetime("2026-10-01")).toBe("2026-10-01 00:00:00");
    expect(taipeiDatetime("2026-10-01T09:30:00+08:00")).toBe("2026-10-01 09:30:00");
    expect(taipeiDatetime("2026-10-01T01:30:00Z")).toBe("2026-10-01 09:30:00");
    expect(taipeiDatetime("2026-13-45")).toBeNull();
    expect(taipeiDatetime("1 OR 1=1")).toBeNull();
  });
});

describe("/v1 writes", () => {
  it("validates bodies strictly", async () => {
    const h = harness();
    const { secret } = await newKey(h, A.site, ["write"]);
    const cases: [string, unknown][] = [
      ["/v1/customers", { customer_name: "A", owner: "Administrator" }],
      ["/v1/customers", {}],
      ["/v1/customers", { customer_name: "A", tax_id: "1234" }],
      ["/v1/customers", { customer_name: "A", customer_type: "Robot" }],
      ["/v1/customers", { customer_name: 5 }],
      ["/v1/customers", "[1,2]"],
      ["/v1/customers", "{not json"],
      ["/v1/leads", { notes: "只有備註" }],
      ["/v1/leads", { email: "not-an-email" }],
    ];
    for (const [path, b] of cases) expect((await handle(v1("POST", path, secret, b), h.env, h.app)).status, JSON.stringify(b)).toBe(400);
    expect((await handle(v1("POST", "/v1/leads", secret, { name: "x" }, { "content-type": "text/plain" }), h.env, h.app)).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });

  it("leads go through create_lead; a known person comes back as existing", async () => {
    let existing = false;
    const h = harness({ "dropout_core.actions.create_lead": () => ({ message: { ok: true, existing, party_type: "Lead", party: "CRM-LEAD-0001" } }) });
    const { secret } = await newKey(h, A.site, ["write"]);
    let res = await handle(v1("POST", "/v1/leads", secret, { name: "林安安", email: "anan@example.com", notes: "從 momo 來的" }), h.env, h.app);
    expect(res.status).toBe(201);
    expect((await body(res)).data).toEqual({ id: "CRM-LEAD-0001", party_type: "Lead", existing: false });
    existing = true;
    res = await handle(v1("POST", "/v1/leads", secret, { email: "anan@example.com" }), h.env, h.app);
    expect(res.status).toBe(200);
  });

  it("ERPNext refusals become 409 / 422 with ERPNext's own short message", async () => {
    let reply: unknown = { ok: false, conflict: true, customer: "CUST-9", message: "統一編號 22099131 已經是 CUST-9" };
    const h = harness({ create_customer: () => ({ message: reply }) });
    const { secret } = await newKey(h, A.site, ["write"]);
    let res = await handle(v1("POST", "/v1/customers", secret, { customer_name: "A", tax_id: "22099131" }), h.env, h.app);
    expect(res.status).toBe(409);
    expect((await body(res)).error).toMatchObject({ code: "conflict", existing_id: "CUST-9" });
    reply = { ok: false, message: "統一編號 22099132 檢查碼不正確" };
    res = await handle(v1("POST", "/v1/customers", secret, { customer_name: "A", tax_id: "22099132" }), h.env, h.app);
    expect(res.status).toBe(422);
    expect((await body(res)).error.message).toContain("檢查碼");
  });

  it("refuses writes with 423 while the contract is read-only or suspended; reads stay open", async () => {
    const h = harness();
    const { secret } = await newKey(h, A.site, ["write"]);
    await handle(admin("PUT", `/admin/accounts/${A.site}`, "admin", { company: "安安", renews_on: "2020-01-01" }), h.env, h.app);
    let res = await handle(v1("POST", "/v1/leads", secret, { name: "x" }), h.env, h.app);
    expect(res.status).toBe(423);
    expect((await body(res)).error).toMatchObject({ code: "account_locked", stage: "read_only" });
    expect((await handle(v1("GET", "/v1/customers", secret), h.env, h.app)).status).toBe(200);
    await handle(admin("POST", `/admin/accounts/${A.site}/renew`, "admin", {}), h.env, h.app);
    await handle(admin("POST", `/admin/accounts/${A.site}/state`, "admin", { state: "suspended" }), h.env, h.app);
    expect((await handle(v1("POST", "/v1/leads", secret, { name: "x" }), h.env, h.app)).status).toBe(423);
    expect(h.calls.filter((c) => c.url.includes("create_lead"))).toHaveLength(0);
  });

  it("Idempotency-Key: a reused key is refused, a failed call frees it", async () => {
    let down = true;
    const h = harness({ create_lead: () => (down ? new Response("x", { status: 502 }) : { message: { ok: true, party_type: "Lead", party: "L1" } }) });
    const { secret } = await newKey(h, A.site, ["write"]);
    const post = () => handle(v1("POST", "/v1/leads", secret, { name: "x" }, { "idempotency-key": "order-20261011-001" }), h.env, h.app);
    expect((await post()).status).toBe(502);
    down = false;
    expect((await post()).status).toBe(201);
    const again = await post();
    expect(again.status).toBe(409);
    expect((await body(again)).error.code).toBe("idempotency_key_reused");
    expect((await handle(v1("POST", "/v1/leads", secret, { name: "x" }, { "idempotency-key": "bad key!" }), h.env, h.app)).status).toBe(400);
  });
});

describe("rate limits", () => {
  it("uses the Rate Limiting binding per key and answers 429 with Retry-After", async () => {
    const h = harness();
    const seen: string[] = [];
    let left = 2;
    h.env.API_LIMIT = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: left-- > 0 }) } as unknown as RateLimit;
    const { key, secret } = await newKey(h);
    expect((await handle(v1("GET", "/v1/items", secret), h.env, h.app)).status).toBe(200);
    expect((await handle(v1("GET", "/v1/items", secret), h.env, h.app)).status).toBe(200);
    const res = await handle(v1("GET", "/v1/items", secret), h.env, h.app);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(seen).toEqual([`key:${key.id}`, `key:${key.id}`, `key:${key.id}`]);
    expect(h.calls).toHaveLength(2);
  });

  it("counts failed logins per IP", async () => {
    const h = harness();
    h.env.API_LIMIT = { limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("auth-fail:203.0.113.9") }) } as unknown as RateLimit;
    expect((await handle(v1("GET", "/v1/items", "nope", undefined, { "cf-connecting-ip": "203.0.113.9" }), h.env, h.app)).status).toBe(429);
    expect((await handle(v1("GET", "/v1/items", "nope", undefined, { "cf-connecting-ip": "198.51.100.1" }), h.env, h.app)).status).toBe(401);
  });

  it("falls back to a fixed window when the binding is missing", () => {
    const t = 1_000 * RATE_WINDOW_MS;
    for (let i = 0; i < RATE_LIMIT; i++) expect(fixedWindow("k-test", t + i)).toBe(true);
    expect(fixedWindow("k-test", t + RATE_LIMIT)).toBe(false);
    expect(fixedWindow("other", t)).toBe(true);
    expect(fixedWindow("k-test", t + RATE_WINDOW_MS)).toBe(true);
  });
});

describe("webhook URL guard", () => {
  it("accepts public https and refuses everything that could reach inside", () => {
    expect("url" in checkUrl("https://hooks.zapier.com/hooks/catch/1/abc/")).toBe(true);
    expect("url" in checkUrl("https://n8n.example.com:5678/webhook/x")).toBe(true);
    for (const bad of [
      "http://hooks.example.com/x",
      "ftp://example.com/x",
      "https://localhost/x",
      "https://api.localhost/x",
      "https://127.0.0.1/x",
      "https://2130706433/x",
      "https://0x7f.1/x",
      "https://10.1.2.3/x",
      "https://172.20.0.1/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://100.64.0.1/x",
      "https://0.0.0.0/x",
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://[fd00::1]/x",
      "https://[fe80::1]/x",
      "https://intranet/x",
      "https://printer.local/x",
      "https://user:pass@example.com/x",
      "not a url",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect("error" in checkUrl(bad), bad).toBe(true);
    }
    expect("error" in checkUrl("https://glue.example/v1/customers", ["glue.example"])).toBe(true);
    expect("error" in checkUrl("https://x.erp-a.example/", ["erp-a.example"])).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("refuses names that resolve to private addresses", async () => {
    const h = harness();
    expect(await resolvesPublic("hooks.example.com", h.fetcher)).toBeNull();
    expect(await resolvesPublic("rebind.example", h.fetcher)).toContain("內部網路");
  });
});

describe("webhook signatures", () => {
  it("signs t.body with HMAC-SHA256 and verifies within five minutes only", async () => {
    const body = '{"id":"evt_1"}';
    const now = 1_760_000_000_000;
    const header = await sign("whsec_test", body, now / 1000);
    expect(header).toMatch(/^t=1760000000,v1=[0-9a-f]{64}$/);
    expect(await verifySignature("whsec_test", header, body, now)).toBe(true);
    expect(await verifySignature("whsec_test", header, body + " ", now)).toBe(false);
    expect(await verifySignature("whsec_other", header, body, now)).toBe(false);
    expect(await verifySignature("whsec_test", header, body, now + 301_000)).toBe(false);
    expect(await verifySignature("whsec_test", null, body, now)).toBe(false);
  });
});

async function newHook(h: H, site = A.site, url = "https://hooks.example.com/dropout", events = ["sales_order.submitted", "lead.created"]) {
  const res = await handle(admin("POST", `/admin/tenants/${site}/webhooks`, "shell", { url, events, label: "Zapier" }), h.env, h.app);
  return { res, out: (await res.json()) as any };
}

const soEvent = (key = "Sales Order:SO-1:won") => ({ name: "EV-1", event_type: "won", idempotency_key: key, party_type: "Customer", party: "C1", reference_doctype: "Sales Order", reference_name: "SO-1", payload: { amount: 1050, currency: "TWD", secret_note: "x" }, occurred_at: "2026-10-11 10:00:00" });

describe("webhooks", () => {
  it("registers https endpoints only, returns the secret once, caps per company", async () => {
    const h = harness();
    const { res, out } = await newHook(h);
    expect(res.status).toBe(201);
    expect(out.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(JSON.stringify(out.webhook)).not.toContain(out.secret);
    const list = await body(await handle(admin("GET", `/admin/tenants/${A.site}/webhooks`, "shell"), h.env, h.app));
    expect(JSON.stringify(list)).not.toContain(out.secret);
    expect(list.events).toContain("invoice.submitted");
    expect((await newHook(h, A.site, "http://hooks.example.com/x")).res.status).toBe(400);
    expect((await newHook(h, A.site, "https://rebind.example/x")).res.status).toBe(400);
    expect((await newHook(h, A.site, "https://erp-a.example/api/method/x")).res.status).toBe(400);
    expect((await newHook(h, A.site, "https://glue.example/v1/leads")).res.status).toBe(400);
    expect((await newHook(h, A.site, "https://hooks.example.com/x", ["everything"])).res.status).toBe(400);
    for (let i = 0; i < 4; i++) await newHook(h);
    expect((await newHook(h)).res.status).toBe(409);
  });

  it("an ERPNext event fans out once per subscribed webhook of that company only", async () => {
    const h = harness();
    await newHook(h, A.site);
    await newHook(h, A.site, "https://hooks.example.com/invoices", ["invoice.submitted"]);
    await newHook(h, B.site);
    const job: Job = { kind: "erpnext_event", site: A.site, event: soEvent() };
    await runJob(job, h.deps);
    await runJob(job, h.deps);
    const hooks = h.sent.filter((j): j is WebhookJob => j.kind === "webhook");
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ site: A.site, webhook_id: h.api.hooks[0].id, event: { id: "evt_EV-1", type: "sales_order.submitted", created_at: "2026-10-11T02:00:00.000Z", data: { doctype: "Sales Order", id: "SO-1", amount: 1050, currency: "TWD" } } });
    expect(JSON.stringify(hooks[0])).not.toContain("secret_note");
  });

  it("delivers a signed POST the receiver can verify, without following redirects", async () => {
    const h = harness({ "hooks.example.com": () => new Response("ok") });
    const { out } = await newHook(h);
    await runJob({ kind: "erpnext_event", site: A.site, event: soEvent() }, h.deps);
    const result = await runJob(h.sent[0], h.deps);
    expect(result).toEqual({ delivered: 200 });
    const call = h.calls.find((c) => c.url === "https://hooks.example.com/dropout")!;
    expect(call.headers["x-dropout-event"]).toBe("sales_order.submitted");
    expect(await verifySignature(out.secret, call.headers["x-dropout-signature"], JSON.stringify(call.body))).toBe(true);
    const init = (h.fetcher as any).mock.calls.find((c: any[]) => String(c[0]) === "https://hooks.example.com/dropout")[1];
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const log = await body(await handle(admin("GET", `/admin/tenants/${A.site}/webhooks/${out.webhook.id}/deliveries`, "shell"), h.env, h.app));
    expect(log.deliveries[0]).toMatchObject({ ok: true, status: 200, attempt: 1, event_type: "sales_order.submitted" });
  });

  it("failed deliveries retry through the queue, then auto-disable with a notice", async () => {
    const h = harness({ "hooks.example.com": () => new Response("no", { status: 500 }) });
    await newHook(h);
    await runJob({ kind: "erpnext_event", site: A.site, event: soEvent() }, h.deps);
    const job = h.sent[0];
    const messages = [{ body: job, attempts: 1, ack: vi.fn(), retry: vi.fn() }];
    await consume({ queue: "dropout-jobs", messages } as unknown as MessageBatch<Job>, h.env, h.app);
    expect(messages[0].retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(h.api.hooks[0]).toMatchObject({ failures: 1, enabled: true });
    expect(h.api.deliveries[0]).toMatchObject({ ok: false, status: 500, error: "HTTP 500" });

    h.api.hooks[0].failures = AUTO_DISABLE_AFTER - 1;
    expect(await runJob(job, h.deps)).toEqual({ disabled: true });
    expect(h.api.hooks[0]).toMatchObject({ enabled: false });
    expect(h.api.hooks[0].disabled_reason).toContain("自動停用");
    expect((await h.store.listAccountEvents(A.site))[0]).toMatchObject({ action: "停用 Webhook" });
    expect(JSON.stringify(await h.store.listAccountEvents(A.site))).not.toContain("/dropout");
    expect(await runJob(job, h.deps)).toEqual({ skipped: "disabled" });

    await handle(admin("POST", `/admin/tenants/${A.site}/webhooks/${h.api.hooks[0].id}/enable`, "shell", { enabled: true }), h.env, h.app);
    expect(h.api.hooks[0]).toMatchObject({ enabled: true, failures: 0, disabled_reason: null });
  });

  it("a timeout counts as a failure", async () => {
    const h = harness({
      "hooks.example.com": () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      },
    });
    await newHook(h);
    await runJob({ kind: "erpnext_event", site: A.site, event: soEvent() }, h.deps);
    await expect(runJob(h.sent[0], h.deps)).rejects.toThrow("10 秒沒回應");
  });

  it("test button sends a ping; other companies cannot see or touch the webhook", async () => {
    const h = harness({ "hooks.example.com": () => new Response("ok") });
    const { out } = await newHook(h);
    const ping = await body(await handle(admin("POST", `/admin/tenants/${A.site}/webhooks/${out.webhook.id}/test`, "shell"), h.env, h.app));
    expect(ping).toMatchObject({ ok: true, status: 200 });
    for (const [method, action] of [["GET", "deliveries"], ["POST", "test"], ["POST", "enable"], ["POST", "delete"]]) {
      expect((await handle(admin(method, `/admin/tenants/${B.site}/webhooks/${out.webhook.id}/${action}`, "shell"), h.env, h.app)).status).toBe(404);
    }
    expect(h.api.hooks).toHaveLength(1);
    await handle(admin("POST", `/admin/tenants/${A.site}/webhooks/${out.webhook.id}/delete`, "shell"), h.env, h.app);
    expect(h.api.hooks).toHaveLength(0);
  });
});
