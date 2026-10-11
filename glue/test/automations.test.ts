import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryApiStore } from "../src/apiStore";
import { consume, handle, scheduled, type App, type Env } from "../src/app";
import { MemoryAutomationStore } from "../src/automation-store";
import { evaluate, isDue, MAX_HITS, runAutomations, validateParams, type AutomationJob } from "../src/automations";
import { toBase64 } from "../src/crypto";
import { runJob, type Deps, type Job } from "../src/jobs";
import { MemoryStore, type Tenant } from "../src/store";

const T: Tenant = { site: "a.dropout.tw", erpnext_url: "https://erp-a.example", erpnext_key: "ka", erpnext_secret: "sa", erpnext_webhook_secret: "ha", unsubscribe_secret: "ua", mail_from: "billing@a.example" };

/** 10:00 on 2026-10-12 in Taiwan. */
const NOW = new Date("2026-10-12T02:00:00Z");
const TODAY = "2026-10-12";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

type Call = { url: string; method: string; body: any };

const INVOICES = [
  { name: "ACC-SINV-0001", customer: "CUST-1", customer_name: "林記五金", due_date: "2026-10-01", outstanding_amount: 12600, contact_email: "Lin@Example.tw", owner: "sales@a.tw" },
  { name: "ACC-SINV-0002", customer: "CUST-2", customer_name: "大同行", due_date: "2026-10-04", outstanding_amount: 5000, contact_email: "", owner: "sales@a.tw" },
];

function harness(routes: Record<string, (call: Call) => unknown> = {}) {
  const store = new MemoryStore();
  store.tenants.set(T.site, T);
  store.accounts.set(T.site, { site: T.site, company: "甲公司", plan: "annual", state: "active", renews_on: "2027-10-10", hosts: ["a.os.dropout.tw"], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
  const automations = new MemoryAutomationStore();
  const api = new MemoryApiStore();
  const calls: Call[] = [];
  const sent: Job[] = [];
  const emails: any[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const call: Call = { url, method: init?.method ?? "GET", body: raw ? JSON.parse(raw) : undefined };
    calls.push(call);
    for (const [pattern, fn] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const res = fn(call);
        return res instanceof Response ? res : Response.json(res);
      }
    }
    if (url.includes("/api/resource/Sales Invoice?")) return Response.json({ data: INVOICES });
    if (url.includes("assign_to.add")) return Response.json({ message: [] });
    return Response.json({ data: [] });
  }) as unknown as typeof fetch;
  const env = {
    JOBS: { send: async (j: Job) => void sent.push(j) },
    EMAIL: { send: async (m: any) => (emails.push(m), { messageId: "m1" }) },
    TENANT_KEY: toBase64(new Uint8Array(32)),
    ADMIN_TOKEN: "admin",
    SHELL_TOKEN: "shell",
  } as unknown as Env;
  const app: App = { store: () => store, fetcher, api: () => api, automations: () => automations };
  const deps: Deps = { store, fetcher, email: env.EMAIL, summaryModel: "m", api, queue: env.JOBS, automations };
  return { store, automations, api, calls, sent, emails, env, app, deps };
}

type H = ReturnType<typeof harness>;

const req = (method: string, path: string, body?: unknown, token = "shell") =>
  new Request(`https://glue.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-actor": "boss@a.tw" } });

async function enable(h: H, rule: string, params: Record<string, unknown> = {}) {
  const res = await handle(req("PUT", `/admin/tenants/${T.site}/automations/${rule}`, { enabled: true, params }), h.env, h.app);
  expect(res.status).toBe(200);
}

const cron = (h: H, now = NOW) => runAutomations({ store: h.store, automations: h.automations, fetcher: h.app.fetcher, queue: h.env.JOBS }, now);

function batch(jobs: Job[], attempts = 1) {
  const results = { ack: 0, retry: [] as number[] };
  const messages = jobs.map((body) => ({ body, attempts, ack: () => void results.ack++, retry: (o?: { delaySeconds?: number }) => void results.retry.push(o?.delaySeconds ?? 0) }));
  return { batch: { queue: "dropout-jobs", messages } as unknown as MessageBatch<Job>, results };
}

describe("rule parameters", () => {
  it("fills defaults, drops unknown keys and refuses out-of-range numbers", () => {
    expect(validateParams("invoice_overdue", { days: "10", hack: 1 })).toEqual({ params: { days: 10, email: true } });
    expect(validateParams("invoice_overdue", { days: 0 })).toHaveProperty("error");
    expect(validateParams("invoice_overdue", { days: 3.5 })).toHaveProperty("error");
    expect(validateParams("invoice_overdue", { email: "yes" })).toHaveProperty("error");
    expect(validateParams("low_stock", { fill_to: 900 })).toHaveProperty("error");
    expect(validateParams("quote_followup", [1, 2])).toHaveProperty("error");
  });

  it("needs a real email for the big-order rule before it can be switched on", () => {
    expect(validateParams("big_order", {})).toEqual({ params: { amount: 100000, notify: "" } });
    expect(validateParams("big_order", {}, { enabling: true })).toHaveProperty("error");
    expect(validateParams("big_order", { notify: "not-an-email" })).toHaveProperty("error");
    expect(validateParams("big_order", { notify: " Boss@A.tw ", amount: 50000 }, { enabling: true })).toEqual({ params: { amount: 50000, notify: "boss@a.tw" } });
  });
});

describe("rule evaluation", () => {
  it("overdue invoices: emails the customer when there is an address and always gives the creator a ToDo", () => {
    const hits = evaluate("invoice_overdue", { days: 7, email: true }, { rule: "invoice_overdue", rows: INVOICES }, TODAY, "甲公司");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ target: "ACC-SINV-0001", day: "2026-10-08", title: "林記五金 的發票 ACC-SINV-0001 逾期 11 天" });
    expect(hits[0].actions.map((a) => a.type)).toEqual(["email", "todo"]);
    expect(hits[0].actions[0]).toMatchObject({ to: "lin@example.tw" });
    expect(hits[1].actions.map((a) => a.type)).toEqual(["todo"]);
    expect(hits[1].detail).toContain("客人沒有 Email");
    expect(evaluate("invoice_overdue", { days: 9, email: false }, { rule: "invoice_overdue", rows: INVOICES }, TODAY).map((h) => h.actions.length)).toEqual([1]);
  });

  it("low stock: tops up to the chosen share of the safety level and skips items already on an open request", () => {
    const facts = {
      rule: "low_stock" as const,
      items: [
        { name: "SKU-A", item_name: "主力零件", stock_uom: "Nos", reorder_warehouse: "本倉 - A", reorder_level: 12, reorder_qty: 0 },
        { name: "SKU-B", item_name: "常備零件", stock_uom: "Nos", reorder_warehouse: "本倉 - A", reorder_level: 10, reorder_qty: 30 },
        { name: "SKU-C", item_name: "包材", stock_uom: "Box", reorder_warehouse: "本倉 - A", reorder_level: 5, reorder_qty: 0 },
      ],
      bins: [
        { item_code: "SKU-A", warehouse: "本倉 - A", actual_qty: 3 },
        { item_code: "SKU-B", warehouse: "本倉 - A", actual_qty: 4 },
        { item_code: "SKU-C", warehouse: "本倉 - A", actual_qty: 1 },
      ],
      open: [{ name: "MAT-MR-2026-00001", item_code: "SKU-C", warehouse: "本倉 - A" }],
    };
    const hits = evaluate("low_stock", { fill_to: 150 }, facts, TODAY);
    expect(hits.map((h) => [h.target, h.actions[0]])).toEqual([
      ["SKU-A|本倉 - A", { type: "material_request", item_code: "SKU-A", item_name: "主力零件", warehouse: "本倉 - A", qty: 15, uom: "Nos" }],
      ["SKU-B|本倉 - A", { type: "material_request", item_code: "SKU-B", item_name: "常備零件", warehouse: "本倉 - A", qty: 30, uom: "Nos" }],
    ]);
  });

  it("quotes, leads, contracts and big orders pick the right person and trigger day", () => {
    const quote = evaluate("quote_followup", { days: 5 }, { rule: "quote_followup", rows: [{ name: "SAL-QTN-1", quotation_to: "Customer", party_name: "CUST-1", customer_name: "林記", transaction_date: "2026-10-01", grand_total: 9000, owner: "Guest" }] }, TODAY);
    expect(quote[0]).toMatchObject({ day: "2026-10-06", actions: [] });
    const lead = evaluate("lead_idle", { days: 3 }, { rule: "lead_idle", rows: [{ name: "CRM-LEAD-1", lead_name: "王小姐", lead_owner: "amy@a.tw", owner: "bot@a.tw", modified: "2026-10-08 15:00:00.000000" }, { name: "CRM-LEAD-2", lead_name: "新來的", modified: "2026-10-11 09:00:00" }] }, TODAY);
    expect(lead).toHaveLength(1);
    expect(lead[0]).toMatchObject({ day: "2026-10-11", actions: [{ type: "todo", user: "amy@a.tw", doctype: "Lead" }] });
    const contract = evaluate("contract_renewal", { days: 30 }, { rule: "contract_renewal", rows: [{ name: "CT-1", party_type: "Customer", party_name: "林記", end_date: "2026-11-01", owner: "sales@a.tw" }, { name: "CT-2", party_name: "太晚", end_date: "2027-03-01", owner: "sales@a.tw" }] }, TODAY);
    expect(contract.map((h) => [h.target, h.day])).toEqual([["CT-1", "2026-11-01"]]);
    const order = evaluate("big_order", { amount: 100000, notify: "boss@a.tw" }, { rule: "big_order", rows: [{ name: "SAL-ORD-9", customer: "C", customer_name: "大客戶", base_grand_total: 250000, transaction_date: TODAY, owner: "sales@a.tw" }, { name: "SAL-ORD-8", base_grand_total: 9000, transaction_date: TODAY }] }, TODAY);
    expect(order.map((h) => h.actions[0])).toEqual([expect.objectContaining({ type: "todo", user: "boss@a.tw", doctype: "Sales Order", name: "SAL-ORD-9" })]);
  });

  it("caps one run at MAX_HITS documents", () => {
    const rows = Array.from({ length: MAX_HITS + 10 }, (_, i) => ({ name: `Q-${i}`, transaction_date: "2026-09-01", owner: "s@a.tw" }));
    expect(evaluate("quote_followup", { days: 1 }, { rule: "quote_followup", rows }, TODAY)).toHaveLength(MAX_HITS);
  });

  it("daily rules wait for the Taiwan workday and run once a day; hourly rules every hour", () => {
    const early = new Date("2026-10-11T23:30:00Z"); // 07:30 Taiwan
    expect(isDue({ rule: "invoice_overdue", last_evaluated_at: null }, early)).toBe(false);
    expect(isDue({ rule: "invoice_overdue", last_evaluated_at: null }, NOW)).toBe(true);
    expect(isDue({ rule: "invoice_overdue", last_evaluated_at: "2026-10-12T00:10:00Z" }, NOW)).toBe(false);
    expect(isDue({ rule: "invoice_overdue", last_evaluated_at: "2026-10-11T03:00:00Z" }, NOW)).toBe(true);
    expect(isDue({ rule: "big_order", last_evaluated_at: "2026-10-12T01:30:00Z" }, NOW)).toBe(false);
    expect(isDue({ rule: "big_order", last_evaluated_at: "2026-10-12T00:50:00Z" }, NOW)).toBe(true);
    expect(isDue({ rule: "nope", last_evaluated_at: null }, NOW)).toBe(false);
  });
});

describe("cron and idempotency", () => {
  it("records each hit once and queues one job, however often the cron runs", async () => {
    const h = harness();
    await enable(h, "invoice_overdue");
    expect(await cron(h)).toEqual({ queued: 2, failed: 0 });
    expect(await cron(h, new Date(NOW.getTime() + 5 * 60_000))).toEqual({ queued: 0, failed: 0 });
    await h.automations.markEvaluated(T.site, "invoice_overdue", "2026-10-11T00:00:00Z", null);
    expect(await cron(h, new Date("2026-10-13T02:00:00Z"))).toEqual({ queued: 0, failed: 0 });
    expect(h.automations.runs.map((r) => [r.target, r.day, r.status])).toEqual([
      ["ACC-SINV-0001", "2026-10-08", "queued"],
      ["ACC-SINV-0002", "2026-10-11", "queued"],
    ]);
    expect(h.sent).toHaveLength(2);
    const list = h.calls.find((c) => c.url.includes("Sales Invoice?"))!;
    expect(list.url).toContain('["due_date","<=","2026-10-05"]');
  });

  it("forgets the run when the job could not be queued, so the next tick tries again", async () => {
    const h = harness();
    await enable(h, "invoice_overdue");
    h.env.JOBS.send = vi.fn(async () => {
      throw new Error("queue down");
    }) as never;
    expect(await cron(h)).toEqual({ queued: 0, failed: 1 });
    expect(h.automations.runs).toHaveLength(0);
    expect((await h.automations.listRules(T.site))[0].last_error).toBe("queue down");
  });

  it("notes ERPNext being down on the rule without creating runs", async () => {
    const h = harness({ "/api/resource/Sales Invoice?": () => new Response("Bad Gateway", { status: 502 }) });
    await enable(h, "invoice_overdue");
    expect(await cron(h)).toEqual({ queued: 0, failed: 1 });
    expect(h.automations.runs).toHaveLength(0);
    expect((await h.automations.listRules(T.site))[0].last_error).toBe("ERPNext 回應 502");
  });

  it("pauses for companies whose contract is read-only", async () => {
    const h = harness();
    await enable(h, "invoice_overdue");
    h.store.accounts.get(T.site)!.state = "suspended";
    expect(await cron(h)).toEqual({ queued: 0, failed: 0 });
    expect((await h.automations.listRules(T.site))[0].last_error).toContain("暫停");
    expect(h.calls.some((c) => c.url.includes("Sales Invoice"))).toBe(false);
  });

  it("runs from the 5-minute cron", async () => {
    const h = harness();
    await enable(h, "invoice_overdue");
    const out = await scheduled(h.env, h.app, NOW);
    expect(out.automations).toEqual({ queued: 2, failed: 0 });
  });
});

describe("actions", () => {
  async function queued(h: H) {
    await enable(h, "invoice_overdue");
    await cron(h);
    return h.sent.splice(0) as AutomationJob[];
  }

  it("assigns a ToDo through Frappe, emails the customer once and logs the result", async () => {
    const h = harness();
    const [first, second] = await queued(h);
    await runJob(first, h.deps);
    await runJob(first, h.deps);
    await runJob(second, h.deps);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]).toMatchObject({ from: "billing@a.example", to: "lin@example.tw", subject: "付款提醒：發票 ACC-SINV-0001" });
    expect(h.emails[0].text).toContain("甲公司");
    const assigns = h.calls.filter((c) => c.url.endsWith("/api/method/frappe.desk.form.assign_to.add"));
    expect(assigns).toHaveLength(2);
    expect(assigns[0].body).toEqual({ args: { assign_to: ["sales@a.tw"], doctype: "Sales Invoice", name: "ACC-SINV-0001", description: expect.stringContaining("[自動化] 跟 林記五金 收款"), date: TODAY, priority: "Medium" } });
    expect(h.automations.runs.map((r) => [r.status, r.result])).toEqual([
      ["done", "寄提醒給 lin@example.tw；給 sales@a.tw 一個待辦"],
      ["done", "給 sales@a.tw 一個待辦"],
    ]);
  });

  it("does not send the email again when a later step fails and the queue retries", async () => {
    let fail = true;
    const h = harness({ "assign_to.add": () => (fail ? new Response("boom", { status: 503 }) : Response.json({ message: [] })) });
    const [first] = await queued(h);
    const { batch: b1, results: r1 } = batch([first]);
    await consume(b1, h.env, h.app);
    expect(r1.retry).toEqual([30]);
    fail = false;
    const { batch: b2, results: r2 } = batch([first], 2);
    await consume(b2, h.env, h.app);
    expect(r2.ack).toBe(1);
    expect(h.emails).toHaveLength(1);
    expect(h.automations.runs[0]).toMatchObject({ status: "done", result: "信先前已寄出；給 sales@a.tw 一個待辦" });
  });

  it("marks the run failed and keeps a dead letter when ERPNext refuses", async () => {
    const h = harness({ "assign_to.add": () => new Response('{"exc_type":"PermissionError"}', { status: 403 }) });
    const [, second] = await queued(h);
    const { batch: b, results } = batch([second]);
    await consume(b, h.env, h.app);
    expect(results.ack).toBe(1);
    expect(h.automations.runs[1].status).toBe("failed");
    expect(h.automations.runs[1].error).toContain("403");
    expect(h.store.dead).toHaveLength(1);
  });

  it("skips the customer email when the company has no sender address", async () => {
    const h = harness();
    h.store.tenants.set(T.site, { ...T, mail_from: undefined });
    const [first] = await queued(h);
    await runJob(first, h.deps);
    expect(h.emails).toHaveLength(0);
    expect(h.automations.runs[0].result).toContain("沒有設定寄件信箱");
  });

  it("opens a draft Material Request for low stock, but not when one is already open", async () => {
    let open: unknown[] = [];
    const h = harness({
      "/api/resource/Item?": () => ({ data: [{ name: "SKU-A", item_name: "主力零件", stock_uom: "Nos", reorder_warehouse: "本倉 - A", reorder_level: 12, reorder_qty: 0 }] }),
      "/api/resource/Bin?": () => ({ data: [{ item_code: "SKU-A", warehouse: "本倉 - A", actual_qty: 2 }] }),
      "/api/resource/Material Request?": () => ({ data: open }),
      "/api/resource/Warehouse/": () => ({ data: { name: "本倉 - A", company: "甲公司" } }),
      "/api/resource/Material Request": () => ({ data: { name: "MAT-MR-2026-00007" } }),
    });
    await enable(h, "low_stock", { fill_to: 200 });
    await cron(h);
    const [job] = h.sent.splice(0) as AutomationJob[];
    await runJob(job, h.deps);
    const insert = h.calls.find((c) => c.method === "POST" && c.url.endsWith("/api/resource/Material Request"))!;
    expect(insert.body).toMatchObject({ material_request_type: "Purchase", company: "甲公司", items: [{ item_code: "SKU-A", qty: 22, uom: "Nos", warehouse: "本倉 - A", conversion_factor: 1 }] });
    expect(h.automations.runs[0].result).toBe("開了請購單草稿 MAT-MR-2026-00007");

    open = [{ name: "MAT-MR-2026-00007", item_code: "SKU-A", warehouse: "本倉 - A" }];
    await h.automations.markEvaluated(T.site, "low_stock", "2026-10-12T00:00:00Z", null);
    expect(await cron(h, new Date("2026-10-13T02:00:00Z"))).toEqual({ queued: 0, failed: 0 });
  });

  it("tells subscribed webhooks that an automation fired", async () => {
    const h = harness();
    await h.api.addWebhook({ id: "wh_1", site: T.site, url: "https://hooks.example/x", events: ["automation.fired"], secret: "whsec_x", label: "x", created_by: "b", created_at: NOW.toISOString(), enabled: true, failures: 0, disabled_reason: null, last_success_at: null, last_failure_at: null });
    const [first] = await queued(h);
    await runJob(first, h.deps);
    const hook = h.sent.find((j) => j.kind === "webhook");
    expect(hook).toMatchObject({ kind: "webhook", webhook_id: "wh_1", event: { type: "automation.fired", data: { doctype: "Sales Invoice", id: "ACC-SINV-0001", rule: "invoice_overdue" } } });
  });
});

describe("admin routes", () => {
  it("lists every template with defaults, and only lets the shell act for one company", async () => {
    const h = harness();
    const res = await handle(req("GET", `/admin/tenants/${T.site}/automations`), h.env, h.app);
    const body = (await res.json()) as { rules: { rule: string; enabled: boolean; params: Record<string, unknown> }[]; runs: unknown[]; mail: boolean };
    expect(body.rules.map((r) => r.rule)).toEqual(["invoice_overdue", "quote_followup", "lead_idle", "low_stock", "contract_renewal", "big_order"]);
    expect(body.rules[0]).toMatchObject({ enabled: false, params: { days: 7, email: true } });
    expect(body.mail).toBe(true);
    expect((await handle(req("GET", `/admin/tenants/${T.site}/automations`, undefined, "nope"), h.env, h.app)).status).toBe(403);
  });

  it("validates updates and records who changed what", async () => {
    const h = harness();
    const bad = await handle(req("PUT", `/admin/tenants/${T.site}/automations/big_order`, { enabled: true, params: { amount: 5 } }), h.env, h.app);
    expect(bad.status).toBe(400);
    const missing = await handle(req("PUT", `/admin/tenants/${T.site}/automations/big_order`, { enabled: true }), h.env, h.app);
    expect(((await missing.json()) as { error: string }).error).toContain("要通知誰");
    expect((await handle(req("PUT", `/admin/tenants/${T.site}/automations/drop_tables`, { enabled: true }), h.env, h.app)).status).toBe(404);
    expect((await handle(req("PUT", `/admin/tenants/${T.site}/automations/quote_followup`, { enabled: "yes" }), h.env, h.app)).status).toBe(400);
    const ok = await handle(req("PUT", `/admin/tenants/${T.site}/automations/big_order`, { enabled: true, params: { amount: 200000, notify: "boss@a.tw" } }), h.env, h.app);
    expect(await ok.json()).toMatchObject({ ok: true, rule: { rule: "big_order", enabled: true, params: { amount: 200000, notify: "boss@a.tw" }, updated_by: "boss@a.tw" } });
    await handle(req("PUT", `/admin/tenants/${T.site}/automations/big_order`, { enabled: false }), h.env, h.app);
    expect(h.store.events.map((e) => [e.actor, e.action])).toEqual([
      ["boss@a.tw", "開啟自動化"],
      ["boss@a.tw", "關閉自動化"],
    ]);
  });

  it("dry-runs with unsaved numbers, touches nothing and says which hits already ran", async () => {
    const h = harness();
    await enable(h, "invoice_overdue");
    await cron(h);
    h.sent.length = 0;
    const res = await handle(req("POST", `/admin/tenants/${T.site}/automations/invoice_overdue/dry-run`, { params: { days: 3 } }), h.env, h.app);
    const body = (await res.json()) as { hits: { target: string; day: string; done_before: boolean }[] };
    expect(body.hits.map((x) => [x.target, x.day, x.done_before])).toEqual([
      ["ACC-SINV-0001", "2026-10-04", false],
      ["ACC-SINV-0002", "2026-10-07", false],
    ]);
    const same = (await (await handle(req("POST", `/admin/tenants/${T.site}/automations/invoice_overdue/dry-run`, {}), h.env, h.app)).json()) as typeof body;
    expect(same.hits.every((x) => x.done_before)).toBe(true);
    expect(h.sent).toHaveLength(0);
    expect(h.calls.some((c) => c.method === "POST" && c.url.includes("erp-a.example"))).toBe(false);
  });

  it("answers 502 with a plain reason when ERPNext is down during a dry run", async () => {
    const h = harness({ "/api/resource/Quotation?": () => { throw new TypeError("fetch failed"); } });
    const res = await handle(req("POST", `/admin/tenants/${T.site}/automations/quote_followup/dry-run`, {}), h.env, h.app);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "連不到 ERPNext" });
  });
});
