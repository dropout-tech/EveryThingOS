import { describe, expect, it, vi } from "vitest";
import { handle, type App, type Env } from "../src/app";
import { toBase64 } from "../src/crypto";
import { ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS, MemoryPortalStore } from "../src/portal";
import { MemoryStore, type Tenant } from "../src/store";

const A: Tenant = { site: "a.dropout.tw", erpnext_url: "https://erp-a.example", erpnext_key: "ka", erpnext_secret: "sa", erpnext_webhook_secret: "ha", unsubscribe_secret: "ua" };
const B: Tenant = { site: "b.dropout.tw", erpnext_url: "https://erp-b.example", erpnext_key: "kb", erpnext_secret: "sb", erpnext_webhook_secret: "hb", unsubscribe_secret: "ub" };

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

type Call = { url: string; method: string; body: any; headers: Record<string, string> };

const DOC = { doctype: "Quotation", kind: "quote", name: "SAL-QTN-0001", status: "open", total: 21000, lines: [] };

function harness(erp: (call: Call) => Response | unknown = () => ({ message: DOC })) {
  const store = new MemoryStore();
  store.tenants.set(A.site, A);
  store.tenants.set(B.site, B);
  const portal = new MemoryPortalStore();
  const calls: Call[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const call: Call = { url: String(input), method: init?.method ?? "GET", body: raw ? JSON.parse(raw) : undefined, headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    calls.push(call);
    const res = erp(call);
    return res instanceof Response ? res : Response.json(res);
  }) as unknown as typeof fetch;
  const env = { TENANT_KEY: toBase64(new Uint8Array(32)), ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell" } as unknown as Env;
  const app: App = { store: () => store, fetcher, portal: () => portal };
  return { store, portal, calls, env, app };
}

type H = ReturnType<typeof harness>;

const req = (method: string, path: string, body?: unknown, token = "shell") =>
  new Request(`https://glue.example${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-actor": "sales@a.tw" },
  });

const base = (site = A.site) => `/admin/tenants/${site}/portal-links`;

async function create(h: H, body: Record<string, unknown> = { doctype: "Quotation", docname: "SAL-QTN-0001", party: "安安商行", amount: 21000 }, site = A.site) {
  const res = await handle(req("POST", base(site), body), h.env, h.app);
  expect(res.status).toBe(201);
  return ((await res.json()) as { link: { id: string; state: string; expires_at: string; created_by: string } }).link;
}

describe("portal links", () => {
  it("needs the shell or admin token", async () => {
    const h = harness();
    expect((await handle(req("GET", base(), undefined, "nope"), h.env, h.app)).status).toBe(403);
    expect((await handle(new Request(`https://glue.example${base()}`), h.env, h.app)).status).toBe(403);
    expect((await handle(req("GET", base(), undefined, "admin"), h.env, h.app)).status).toBe(200);
  });

  it("creates, lists and keeps the actor", async () => {
    const h = harness();
    const link = await create(h);
    expect(link.id).toMatch(/^pl_[0-9a-f]{24}$/);
    expect(link.state).toBe("active");
    expect(link.created_by).toBe("sales@a.tw");
    const days = (Date.parse(link.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const list = (await (await handle(req("GET", base()), h.env, h.app)).json()) as { links: { id: string }[] };
    expect(list.links.map((l) => l.id)).toEqual([link.id]);
    const byDoc = (await (await handle(req("GET", `${base()}?doctype=Quotation&docname=OTHER`), h.env, h.app)).json()) as { links: unknown[] };
    expect(byDoc.links).toEqual([]);
  });

  it("validates input", async () => {
    const h = harness();
    for (const body of [
      { doctype: "Purchase Invoice", docname: "X" },
      { doctype: "Quotation", docname: "" },
      { doctype: "Quotation", docname: "x".repeat(141) },
      { doctype: "Quotation", docname: "X", days: 0 },
      { doctype: "Quotation", docname: "X", days: 91 },
      { doctype: "Quotation", docname: "X", days: 1.5 },
    ]) {
      expect((await handle(req("POST", base(), body), h.env, h.app)).status).toBe(400);
    }
    expect((await handle(req("POST", base("nobody.dropout.tw"), { doctype: "Quotation", docname: "X" }), h.env, h.app)).status).toBe(404);
  });

  it("never crosses companies", async () => {
    const h = harness();
    const link = await create(h);
    expect((await handle(req("GET", `${base(B.site)}/${link.id}`), h.env, h.app)).status).toBe(404);
    expect((await handle(req("POST", `${base(B.site)}/${link.id}/open`, {}), h.env, h.app)).status).toBe(404);
    expect((await handle(req("POST", `${base(B.site)}/${link.id}/revoke`, {}), h.env, h.app)).status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("opens with the tenant's integration key and counts views", async () => {
    const h = harness();
    const link = await create(h);
    const res = await handle(req("POST", `${base()}/${link.id}/open`, { ip: "1.2.3.4" }), h.env, h.app);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { doc: typeof DOC; link: { view_count: number; first_viewed_at: string } };
    expect(out.doc.name).toBe("SAL-QTN-0001");
    expect(out.link.view_count).toBe(1);
    expect(out.link.first_viewed_at).toBeTruthy();
    expect(h.calls[0].url).toBe("https://erp-a.example/api/method/dropout_core.portal.document");
    expect(h.calls[0].headers.authorization).toBe("token ka:sa");
    expect(h.calls[0].body).toEqual({ doctype: "Quotation", name: "SAL-QTN-0001" });
    await handle(req("POST", `${base()}/${link.id}/open`, {}), h.env, h.app);
    expect(h.portal.links[0].view_count).toBe(2);
    expect(h.portal.links[0].first_viewed_at).toBe(out.link.first_viewed_at);
  });

  it("revoked and expired links stop working", async () => {
    const h = harness();
    const link = await create(h);
    const revoked = await handle(req("POST", `${base()}/${link.id}/revoke`, {}), h.env, h.app);
    expect(((await revoked.json()) as { link: { state: string } }).link.state).toBe("revoked");
    const open = await handle(req("POST", `${base()}/${link.id}/open`, {}), h.env, h.app);
    expect(open.status).toBe(410);
    expect(((await open.json()) as { state: string }).state).toBe("revoked");
    expect((await handle(req("POST", `${base()}/${link.id}/expiry`, { days: 7 }), h.env, h.app)).status).toBe(409);

    const other = await create(h);
    h.portal.links.find((l) => l.id === other.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = await handle(req("POST", `${base()}/${other.id}/open`, {}), h.env, h.app);
    expect(expired.status).toBe(410);
    expect(((await expired.json()) as { state: string }).state).toBe("expired");
    const extended = await handle(req("POST", `${base()}/${other.id}/expiry`, { days: 30 }), h.env, h.app);
    expect(((await extended.json()) as { link: { state: string } }).link.state).toBe("active");
    expect((await handle(req("POST", `${base()}/${other.id}/expiry`, { days: 365 }), h.env, h.app)).status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("accepts a quotation once, hashing the address", async () => {
    const h = harness((call) =>
      call.url.endsWith("accept_quotation") ? { message: { status: "accepted", accepted: { name: call.body.full_name, at: "2026-10-11 10:00:00" } } } : { message: DOC },
    );
    const link = await create(h);
    const res = await handle(req("POST", `${base()}/${link.id}/accept`, { name: " 林  安安 ", signature: PNG, consent: true, ip: "1.2.3.4" }), h.env, h.app);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accepted: { name: string } }).accepted.name).toBe("林 安安");
    const sent = h.calls.find((c) => c.url.endsWith("accept_quotation"))!;
    expect(sent.body).toMatchObject({ name: "SAL-QTN-0001", full_name: "林 安安", signature: PNG, link: link.id, consent: 1 });
    expect(sent.body.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(sent.body)).not.toContain("1.2.3.4");
    const stored = h.portal.links[0];
    expect(stored.accepted_name).toBe("林 安安");
    expect(stored.accepted_ip_hash).toBe(sent.body.ip_hash);

    const again = await handle(req("POST", `${base()}/${link.id}/accept`, { name: "別人", consent: true }), h.env, h.app);
    expect(((await again.json()) as { already: boolean }).already).toBe(true);
    expect(h.calls.filter((c) => c.url.endsWith("accept_quotation"))).toHaveLength(1);
    const view = (await (await handle(req("GET", `${base()}/${link.id}`), h.env, h.app)).json()) as { link: Record<string, unknown> };
    expect(view.link.accepted_name).toBe("林 安安");
    expect(view.link).not.toHaveProperty("accepted_ip_hash");
    expect(view.link).not.toHaveProperty("attempt_count");
  });

  it("checks acceptance input before calling ERPNext", async () => {
    const h = harness();
    const link = await create(h);
    for (const body of [
      { name: "王", consent: true },
      { name: "王小明" },
      { name: "王小明", consent: "yes" },
      { name: "王小明", consent: true, signature: "data:image/svg+xml;base64,PHN2Zz4=" },
      { name: "王小明", consent: true, signature: `data:image/png;base64,${"A".repeat(500_000)}` },
    ]) {
      expect((await handle(req("POST", `${base()}/${link.id}/accept`, body), h.env, h.app)).status).toBe(400);
    }
    expect(h.calls).toEqual([]);
    const invoice = await create(h, { doctype: "Sales Invoice", docname: "ACC-SINV-0001" });
    expect((await handle(req("POST", `${base()}/${invoice.id}/accept`, { name: "王小明", consent: true }), h.env, h.app)).status).toBe(400);
  });

  it("rate limits acceptance attempts per link", async () => {
    const h = harness(() => Response.json({ _server_messages: JSON.stringify([JSON.stringify({ message: "這張報價已過期，請跟業務要一張新的" })]) }, { status: 417 }));
    const link = await create(h);
    for (let i = 0; i < ATTEMPT_LIMIT; i++) {
      const res = await handle(req("POST", `${base()}/${link.id}/accept`, { name: "王小明", consent: true }), h.env, h.app);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe("這張報價已過期，請跟業務要一張新的");
    }
    expect((await handle(req("POST", `${base()}/${link.id}/accept`, { name: "王小明", consent: true }), h.env, h.app)).status).toBe(429);
    expect(h.calls).toHaveLength(ATTEMPT_LIMIT);
    expect(h.portal.links[0].accepted_at).toBeNull();
    h.portal.links[0].attempt_window = new Date(Date.now() - ATTEMPT_WINDOW_MS - 1000).toISOString();
    expect((await handle(req("POST", `${base()}/${link.id}/accept`, { name: "王小明", consent: true }), h.env, h.app)).status).toBe(422);
  });

  it("returns a payment link only when ERPNext gives a real one", async () => {
    let answer: unknown = { status: "ok", url: "https://erp-a.example/tw_pay?gateway=ecpay&pr=PR-1&token=t" };
    const h = harness(() => ({ message: answer }));
    const invoice = await create(h, { doctype: "Sales Invoice", docname: "ACC-SINV-0001" });
    const pay = () => handle(req("POST", `${base()}/${invoice.id}/pay`, {}), h.env, h.app).then((r) => r.json() as Promise<{ status: string; url?: string }>);
    expect(await pay()).toEqual({ status: "ok", url: "https://erp-a.example/tw_pay?gateway=ecpay&pr=PR-1&token=t" });
    expect(h.calls[0].body).toEqual({ sales_invoice: "ACC-SINV-0001" });
    answer = { status: "unavailable" };
    expect(await pay()).toEqual({ status: "unavailable" });
    answer = { status: "ok", url: "javascript:alert(1)" };
    expect(await pay()).toEqual({ status: "unavailable" });
    const quote = await create(h);
    expect((await handle(req("POST", `${base()}/${quote.id}/pay`, {}), h.env, h.app)).status).toBe(400);
  });

  it("proxies the ERPNext PDF", async () => {
    const h = harness((call) => (call.url.includes("download_pdf") ? new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }) : { message: DOC }));
    const invoice = await create(h, { doctype: "Sales Invoice", docname: "ACC-SINV-0001" });
    const res = await handle(req("GET", `${base()}/${invoice.id}/pdf`), h.env, h.app);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await res.text()).toBe("%PDF-1.4");
    expect(h.calls[0].url).toBe("https://erp-a.example/api/method/frappe.utils.print_format.download_pdf?doctype=Sales+Invoice&name=ACC-SINV-0001");
    expect(h.calls[0].headers.authorization).toBe("token ka:sa");
  });

  it("says when ERPNext is down", async () => {
    const h = harness(() => {
      throw new Error("ECONNREFUSED");
    });
    const link = await create(h);
    const res = await handle(req("POST", `${base()}/${link.id}/open`, {}), h.env, h.app);
    expect(res.status).toBe(502);
    expect(h.portal.links[0].view_count).toBe(0);
  });
});
