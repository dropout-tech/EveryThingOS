import { describe, expect, it, vi } from "vitest";
import { handle, scheduled, type App, type Env } from "../src/app";
import { toBase64 } from "../src/crypto";
import { alertText, DOWN_AFTER, transition, uptime, webhookBody } from "../src/monitor";
import { MemoryMonitorStore } from "../src/monitor-store";
import { MemoryStore, type Tenant } from "../src/store";

const tenant = (site: string): Tenant => ({
  site,
  erpnext_url: `https://erp.example/${site}`,
  erpnext_key: "erp-key",
  erpnext_secret: "erp-secret",
  erpnext_webhook_secret: "hook-secret",
  unsubscribe_secret: "unsub-secret",
});

const account = (site: string, company: string, host: string, state: "active" | "suspended" | "cancelled" = "active") => ({
  site,
  company,
  plan: "annual",
  state,
  renews_on: "2027-10-10",
  hosts: [host],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

/** `down` holds URL fragments that should fail; anything else answers like a healthy site. */
function harness(env: Partial<Env> = {}) {
  const store = new MemoryStore();
  const monitor = new MemoryMonitorStore();
  const down = new Set<string>();
  const calls: { url: string; init?: RequestInit }[] = [];
  const emails: any[] = [];
  for (const [site, company, host] of [
    ["make.dropout.tw", "琢奧精密製造", "make.os.dropout.tw"],
    ["edu.dropout.tw", "琢奧教育", "edu.os.dropout.tw"],
  ]) {
    store.tenants.set(site, tenant(site));
    store.accounts.set(site, account(site, company, host));
  }
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if ([...down].some((d) => url.includes(d))) {
      if (url.includes("timeout")) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      return new Response("Bad Gateway", { status: 502 });
    }
    if (url.endsWith("/api/method/ping")) return Response.json({ message: "pong" });
    if (url.endsWith("/api/health")) return Response.json({ ok: true });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  const fullEnv = {
    TENANT_KEY: toBase64(new Uint8Array(32)),
    ADMIN_TOKEN: "admin",
    SHELL_TOKEN: "shell",
    EMAIL: { send: async (m: any) => (emails.push(m), { messageId: "m1" }) },
    PLATFORM_MAIL_FROM: "DropOut OS <ops@dropout.tw>",
    PLATFORM_NOTIFY: "ops@dropout.tw",
    ...env,
  } as unknown as Env;
  const app: App = { store: () => store, fetcher, monitor: () => monitor };
  return { store, monitor, down, calls, emails, env: fullEnv, app };
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 11, 4, minute));
const get = (path: string, token?: string) => new Request(`https://glue.example${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("health", () => {
  it("answers without auth, checks D1 and says 503 when it is down", async () => {
    const h = harness();
    let res = await handle(get("/health"), h.env, h.app);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, checks: { d1: { ok: true } }, version: "dev" });

    h.monitor.healthy = false;
    res = await handle(get("/health"), { ...h.env, CF_VERSION_METADATA: { id: "v-123", tag: "", timestamp: "" } }, h.app);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, checks: { d1: { ok: false } }, version: "v-123" });
    expect(JSON.stringify(body)).not.toContain("admin");
  });
});

describe("uptime", () => {
  it("needs two failures in a row before down, one success to come back", () => {
    const fail = { ok: false, status: 502, ms: 10, error: "HTTP 502" };
    const ok = { ok: true, status: 200, ms: 10, error: null };
    let r = transition(undefined, "s", "erpnext", fail, "2026-10-11T04:00:00.000Z");
    expect(r.change).toBeNull();
    expect(r.next).toMatchObject({ up: true, failures: 1 });
    for (let i = 2; i <= DOWN_AFTER; i++) r = transition(r.next, "s", "erpnext", fail, "2026-10-11T04:05:00.000Z");
    expect(r.change).toBe("down");
    expect(r.since).toBe("2026-10-11T04:00:00.000Z");
    expect(transition(r.next, "s", "erpnext", fail, "2026-10-11T04:10:00.000Z").change).toBeNull();
    const back = transition(r.next, "s", "erpnext", ok, "2026-10-11T04:15:00.000Z");
    expect(back).toMatchObject({ change: "up", since: "2026-10-11T04:00:00.000Z", next: { up: true, failures: 0, first_failed_at: null } });
    expect(transition(undefined, "s", "erpnext", fail, "t").next.up).toBe(true);
  });

  it("probes ERPNext ping and the shell host, opens one incident, alerts ops once per change, closes it on recovery", async () => {
    const h = harness({ ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/x" });
    h.down.add("erp.example/make.dropout.tw");

    expect(await uptime(h.env, h.app, at(0))).toMatchObject({ probed: 4, down: 0, skipped: 0 });
    const ping = h.calls.find((c) => c.url === "https://erp.example/make.dropout.tw/api/method/ping")!;
    expect((ping.init?.headers as Record<string, string>)["X-Frappe-Site-Name"]).toBe("make.dropout.tw");
    expect(JSON.stringify(ping.init?.headers)).not.toContain("erp-secret");
    expect(h.calls.some((c) => c.url === "https://edu.os.dropout.tw/api/health")).toBe(true);

    expect(await uptime(h.env, h.app, at(5))).toMatchObject({ down: 1, alerted: ["webhook", "email"] });
    expect(h.monitor.incidents).toMatchObject([{ site: "make.dropout.tw", target: "erpnext", started_at: at(0).toISOString(), resolved_at: null, error: "HTTP 502" }]);
    const hook = h.calls.find((c) => c.url.startsWith("https://hooks.slack.com"))!;
    expect(JSON.parse(hook.init!.body as string).text).toContain("連不上：琢奧精密製造（make.dropout.tw）ERPNext");
    expect(h.emails[0]).toMatchObject({ to: "ops@dropout.tw", subject: "[DropOut OS 監看] 1 個連不上" });

    expect(await uptime(h.env, h.app, at(10))).toMatchObject({ down: 0, alerted: [] });
    expect(h.monitor.incidents).toHaveLength(1);

    h.down.clear();
    expect(await uptime(h.env, h.app, at(15))).toMatchObject({ up: 1, alerted: ["webhook", "email"] });
    expect(h.monitor.incidents[0].resolved_at).toBe(at(15).toISOString());
    expect(h.emails[1].text).toContain("停了約 15 分鐘");
    const history = (await h.store.listAccountEvents("make.dropout.tw")).map((e) => `${e.actor}:${e.action}`);
    expect(history).toEqual(["監看:恢復", "監看:連不上"]);
  });

  it("treats timeouts and wrong answers as failures and keeps going when a site throws", async () => {
    const h = harness();
    h.store.tenants.set("edu.dropout.tw", { ...tenant("edu.dropout.tw"), erpnext_url: "https://timeout.example" });
    h.down.add("timeout.example");
    h.down.add("make.os.dropout.tw");
    await uptime(h.env, h.app, at(0));
    await uptime(h.env, h.app, at(5));
    const checks = await h.monitor.listChecks();
    expect(checks.find((c) => c.site === "edu.dropout.tw" && c.target === "erpnext")).toMatchObject({ up: false, last_error: "逾時（8 秒）" });
    expect(checks.find((c) => c.site === "make.dropout.tw" && c.target === "shell")).toMatchObject({ up: false, last_status: 502 });
    expect(checks.find((c) => c.site === "make.dropout.tw" && c.target === "erpnext")).toMatchObject({ up: true });

    const broken = harness();
    broken.store.getTenant = async (site) => {
      if (site === "edu.dropout.tw") throw new Error("sealed config unreadable");
      return tenant(site);
    };
    expect(await uptime(broken.env, broken.app, at(0))).toMatchObject({ probed: 2 });
  });

  it("skips cancelled companies and forgets their open incidents; stops starting probes when the run budget is spent", async () => {
    const h = harness();
    h.down.add("erp.example/edu.dropout.tw");
    await uptime(h.env, h.app, at(0));
    await uptime(h.env, h.app, at(5));
    expect(h.monitor.incidents.filter((i) => !i.resolved_at)).toHaveLength(1);
    h.store.accounts.set("edu.dropout.tw", account("edu.dropout.tw", "琢奧教育", "edu.os.dropout.tw", "cancelled"));
    h.calls.length = 0;
    await uptime(h.env, h.app, at(10));
    expect(h.calls.some((c) => c.url.includes("edu"))).toBe(false);
    expect(h.monitor.incidents.filter((i) => !i.resolved_at)).toHaveLength(0);
    expect((await h.monitor.listChecks()).every((c) => c.site !== "edu.dropout.tw")).toBe(true);

    const slow = harness();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await uptime(slow.env, slow.app, at(0), 0)).toMatchObject({ probed: 0, skipped: 2 });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "monitor.budget_exhausted", skipped: 2 });
    spy.mockRestore();
  });

  it("checks the sites that waited longest first", async () => {
    const h = harness();
    await uptime(h.env, h.app, at(0));
    const c = h.monitor.checks.get("edu.dropout.tw|erpnext")!;
    h.monitor.checks.set("edu.dropout.tw|erpnext", { ...c, checked_at: "2026-10-11T03:00:00.000Z" });
    h.calls.length = 0;
    await uptime(h.env, h.app, at(5));
    expect(h.calls[0].url).toContain("edu.dropout.tw");
  });

  it("runs from the 5-minute cron and never takes the cron down with it", async () => {
    const h = harness();
    expect((await scheduled(h.env, h.app, at(0))).monitor).toMatchObject({ probed: 4 });
    const broken = harness();
    broken.monitor.listChecks = async () => {
      throw new Error("D1 unavailable");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await scheduled(broken.env, broken.app, at(0))).monitor).toBeNull();
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", event: "monitor.failed", error: "D1 unavailable" });
    spy.mockRestore();
  });

  it("formats alerts per webhook and keeps them short", () => {
    const change = { site: "s", company: "安安", target: "shell" as const, change: "down" as const, error: "HTTP 502", since: at(0).toISOString(), at: at(5).toISOString() };
    expect(webhookBody("https://discord.com/api/webhooks/1/x", "hi", [change])).toEqual({ content: "hi" });
    expect(webhookBody("https://chat.googleapis.com/v1/spaces/x", "hi", [change])).toEqual({ text: "hi" });
    expect(webhookBody("https://ops.example/hook", "hi", [change])).toMatchObject({ text: "hi", content: "hi", message: "hi", events: [change] });
    const many = alertText(Array.from({ length: 80 }, (_, i) => ({ ...change, site: `s${i}` })));
    expect(many.subject).toBe("[DropOut OS 監看] 80 個連不上");
    expect(many.text.length).toBeLessThanOrEqual(1900);
    expect(many.text).toContain("12:00 起");
  });

  it("does not post to a webhook that is not https", async () => {
    const h = harness({ ALERT_WEBHOOK_URL: "http://ops.example/hook", EMAIL: undefined });
    h.down.add("make.os.dropout.tw");
    await uptime(h.env, h.app, at(0));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await uptime(h.env, h.app, at(5))).toMatchObject({ down: 1, alerted: [] });
    expect(h.calls.some((c) => c.url.startsWith("http://ops.example"))).toBe(false);
    spy.mockRestore();
  });
});

describe("public status", () => {
  it("shows fleet levels, availability and grouped incidents without company names or hosts", async () => {
    const h = harness();
    const base = Date.now() - 20 * 60_000;
    const recent = (minute: number) => new Date(base + minute * 60_000);
    h.down.add("erp.example/");
    for (const m of [0, 5, 10]) await uptime(h.env, h.app, recent(m));
    let res = await handle(get("/status"), h.env, h.app);
    expect(res.headers.get("cache-control")).toContain("max-age=60");
    let body = (await res.json()) as any;
    expect(body.components).toMatchObject({ erpnext: "down", shell: "up" });
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0]).toMatchObject({ target: "erpnext", resolved_at: null });
    const text = JSON.stringify(body);
    for (const leak of ["make", "edu", "琢奧", "dropout.tw", "erp.example", "HTTP 502"]) expect(text).not.toContain(leak);

    h.down.clear();
    h.down.add("erp.example/edu.dropout.tw");
    await uptime(h.env, h.app, recent(15));
    body = (await (await handle(get("/status"), h.env, h.app)).json()) as any;
    expect(body.status).toBe("degraded");
    expect(body.availability_30d.erpnext).toBeLessThan(100);
    expect(body.availability_30d.shell).toBe(100);
    expect(body.site).toBeUndefined();

    expect((await handle(get("/status?site=make.dropout.tw"), h.env, h.app)).status).toBe(403);
    res = await handle(get("/status?site=make.dropout.tw", "shell"), h.env, h.app);
    body = (await res.json()) as any;
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(body.site.components).toEqual({ erpnext: "up", shell: "up" });
    expect(body.site.incidents).toMatchObject([{ target: "erpnext", resolved_at: recent(15).toISOString() }]);
  });

  it("says unknown before any check and degraded when the checks are stale or D1 fails", async () => {
    const h = harness();
    expect(((await (await handle(get("/status"), h.env, h.app)).json()) as any)).toMatchObject({ status: "up", components: { glue: "up", erpnext: "unknown", shell: "unknown" } });
    await uptime(h.env, h.app, new Date(Date.now() - 3_600_000));
    expect(((await (await handle(get("/status"), h.env, h.app)).json()) as any).components).toEqual({ glue: "degraded", erpnext: "unknown", shell: "unknown" });
    h.monitor.listChecks = async () => {
      throw new Error("D1 unavailable");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handle(get("/status"), h.env, h.app);
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).status).toBe("degraded");
    spy.mockRestore();
  });
});
