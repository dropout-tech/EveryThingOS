import { describe, expect, it, vi } from "vitest";
import { aesCbcEncrypt, hmacSha256, seal, toBase64, toHex, unseal } from "../src/crypto";
import { ecpayInvoiceDecrypt, ecpayInvoiceEncrypt, inclusiveLines } from "../src/einvoice";
import { addYears, lifecycle, reminderFor, taiwanDate } from "../src/accounts";
import { consume, daily, handle, MAX_ATTEMPTS, scheduleMeetings, scheduled, type App, type Env } from "../src/app";
import { runJob, type Deps, type Job } from "../src/jobs";
import { unsubscribeSignature, verifySvix } from "../src/mail";
import { eventsInWindow, findMeetingLink, zonedToUtc } from "../src/meetings";
import { ecpayCheckMacValue, newebpayDecode, newebpayTradeSha } from "../src/pay";
import { MemoryStore, type Tenant } from "../src/store";

const KEY = "pwFHCqoQZGmho4w6";
const IV = "EkRm7iFT261dpevs";

const tenant: Tenant = {
  site: "make.dropout.tw",
  erpnext_url: "https://erp.example",
  erpnext_key: "k",
  erpnext_secret: "s",
  erpnext_webhook_secret: "hook-secret",
  chatwoot_url: "https://chat.example",
  chatwoot_account_id: 3,
  chatwoot_token: "cw",
  chatwoot_path_token: "path-token",
  mail_from: "hello@make.example",
  mail_provider: "generic",
  mail_webhook_secret: "mail-secret",
  unsubscribe_secret: "unsub-secret",
  ecpay: { merchant_id: "3002607", hash_key: KEY, hash_iv: IV },
  vexa: { url: "https://vexa.example", api_key: "vk", webhook_token: "vt" },
  calendars: ["https://calendar.example/basic.ics"],
};

type Call = { url: string; body: any; method: string };

function harness(routes: Record<string, (body: any) => unknown> = {}) {
  const store = new MemoryStore();
  store.tenants.set(tenant.site, tenant);
  const calls: Call[] = [];
  const sent: Job[] = [];
  const emails: any[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body && typeof init.body === "string" ? safeJson(init.body) : init?.body;
    calls.push({ url, body, method: init?.method ?? "GET" });
    for (const [pattern, fn] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const out = fn(body);
        if (out instanceof Response) return out;
        return Response.json(out);
      }
    }
    return Response.json({ message: {} });
  }) as unknown as typeof fetch;
  const env = {
    JOBS: { send: async (j: Job) => void sent.push(j) },
    EMAIL: { send: async (m: any) => (emails.push(m), { messageId: "m1" }) },
    AI: { run: async () => ({ response: "重點：試產延到下週" }) },
    TENANT_KEY: toBase64(new Uint8Array(32)),
    ADMIN_TOKEN: "admin",
    SHELL_TOKEN: "shell",
  } as unknown as Env;
  const app: App = { store: () => store, fetcher };
  const deps: Deps = { store, fetcher, email: env.EMAIL, ai: env.AI, summaryModel: "m" };
  return { store, calls, sent, emails, env, app, deps, fetcher };
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://glue.example${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

function batch(jobs: Job[], attempts = 1) {
  const results: { ack: number; retry: number[] } = { ack: 0, retry: [] };
  const messages = jobs.map((body) => ({
    body,
    attempts,
    ack: () => void results.ack++,
    retry: (o?: { delaySeconds?: number }) => void results.retry.push(o?.delaySeconds ?? 0),
  }));
  return { batch: { queue: "dropout-jobs", messages } as unknown as MessageBatch<Job>, results };
}

describe("signatures", () => {
  it("matches ECPay's published CheckMacValue example (same vector as the Python app)", async () => {
    const params = {
      ChoosePayment: "ALL", EncryptType: "1", ItemName: "Apple iphone 15", MerchantID: "3002607",
      MerchantTradeDate: "2023/03/12 15:30:23", MerchantTradeNo: "ecpay20230312153023", PaymentType: "aio",
      ReturnURL: "https://www.ecpay.com.tw/receive.php", TotalAmount: "30000", TradeDesc: "促銷方案",
    };
    expect(await ecpayCheckMacValue(params, KEY, IV)).toBe("6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840");
  });

  it("decodes a NewebPay notification and rejects a forged one", async () => {
    const key = "12345678901234567890123456789012";
    const iv = "1234567890123456";
    const info = toHex(await aesCbcEncrypt(JSON.stringify({ Status: "SUCCESS", Result: { MerchantOrderNo: "DO1", Amt: 990, TradeNo: "T1" } }), key, iv));
    const sha = await newebpayTradeSha(info, key, iv);
    expect((await newebpayDecode({ TradeInfo: info, TradeSha: sha }, key, iv))?.Result?.Amt).toBe(990);
    expect(await newebpayDecode({ TradeInfo: info, TradeSha: "0".repeat(64) }, key, iv)).toBeNull();
  });

  it("verifies Svix (Resend) signatures with a time window", async () => {
    const secret = "whsec_" + toBase64(new TextEncoder().encode("supersecretkey123"));
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"email.opened"}';
    const sig = toBase64(await hmacSha256(new TextEncoder().encode("supersecretkey123"), `msg_1.${ts}.${body}`));
    const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` });
    expect(await verifySvix(secret, headers, body)).toBe(true);
    expect(await verifySvix(secret, headers, body + " ")).toBe(false);
    expect(await verifySvix(secret, headers, body, Date.now() + 3600_000)).toBe(false);
  });

  it("seals tenant secrets with AES-GCM", async () => {
    const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
    const sealed = await seal("hello", key);
    expect(sealed).not.toContain("hello");
    expect(await unseal(sealed, key)).toBe("hello");
  });
});

describe("e-invoice", () => {
  it("round-trips ECPay invoice encryption", async () => {
    const data = { RelateNumber: "SINV0001", Items: [{ ItemName: "螺絲 M3", ItemAmount: 105 }] };
    expect(await ecpayInvoiceDecrypt(await ecpayInvoiceEncrypt(data, "ejCk326UnaZWKisg", "q9jcZX8Ib9LM8wYk"), "ejCk326UnaZWKisg", "q9jcZX8Ib9LM8wYk")).toEqual(data);
  });

  it("makes tax-inclusive lines that sum exactly to the total", () => {
    const { total, lines } = inclusiveLines({
      name: "SINV-1", customer_name: "A", grand_total: 1050, net_total: 1000,
      items: [{ item_name: "a", qty: 3, amount: 333.33 }, { item_name: "b", qty: 1, amount: 666.67 }],
    });
    expect(lines.reduce((s, l) => s + l.ItemAmount, 0)).toBe(total);
  });

  it("issues on `invoiced` and writes the number back", async () => {
    const h = harness({
      "/api/resource/Sales%20Invoice/": () => ({ data: { name: "ACC-SINV-2026-00001", customer: "C1", customer_name: "安安商行", grand_total: 1050, net_total: 1000, items: [{ item_name: "a", qty: 1, amount: 1000 }] } }),
      "/api/resource/Customer/": () => ({ data: { tax_id: "22099131" } }),
    });
    const issue = vi.fn(async (_inv: unknown) => ({ number: "AB12345678" }));
    h.deps.einvoice = () => ({ issue, void: vi.fn(), allowance: vi.fn() }) as any;
    await runJob({ kind: "erpnext_event", site: tenant.site, event: { name: "e", event_type: "invoiced", idempotency_key: "k", reference_doctype: "Sales Invoice", reference_name: "ACC-SINV-2026-00001" } }, h.deps);
    expect(issue.mock.calls[0][0]).toMatchObject({ tax_id: "22099131", grand_total: 1050 });
    const write = h.calls.find((c) => c.url.endsWith("dropout_core.api.set_einvoice"));
    expect(write?.body).toMatchObject({ status: "已開立", number: "AB12345678" });
  });
});

describe("routes", () => {
  it("G1: queues one job per Chatwoot conversation and rejects a wrong token", async () => {
    const h = harness();
    const body = { event: "conversation_created", id: 42, channel: "Channel::Line", inbox_id: 7, contact_inbox: { source_id: "Uabc" }, meta: { sender: { name: "林安安" } } };
    expect((await handle(post(`/chatwoot/${tenant.site}/path-token`, body), h.env, h.app)).status).toBe(200);
    await handle(post(`/chatwoot/${tenant.site}/path-token`, body), h.env, h.app);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ kind: "chatwoot", channel: "line", external_id: "Uabc", source_account: "inbox:7" });
    expect((await handle(post(`/chatwoot/${tenant.site}/wrong`, body), h.env, h.app)).status).toBe(403);
  });

  it("G3/G4: form → lead → confirmation mail; confirm link calls ERPNext", async () => {
    const h = harness({ "capture_lead": () => ({ message: { consent_token: "tok", created: true } }) });
    await handle(post(`/forms/${tenant.site}`, { email: "AnAn@Example.com", name: "安安", consent: "on", form_id: "f1" }), h.env, h.app);
    expect(h.sent[0]).toMatchObject({ kind: "form", email: "anan@example.com", consent: true });
    await runJob(h.sent[0], h.deps);
    expect(h.emails[0].to).toBe("anan@example.com");
    expect(h.emails[0].text).toContain(`/confirm/${tenant.site}?token=tok`);
    await runJob(h.sent[0], h.deps);
    expect(h.emails).toHaveLength(1);

    const res = await handle(new Request(`https://glue.example/confirm/${tenant.site}?token=tok`), h.env, h.app);
    expect(res.status).toBe(200);
    expect(h.calls.some((c) => c.url.endsWith("confirm_consent") && c.body.token === "tok")).toBe(true);
  });

  it("G6: signed unsubscribe link → ERPNext + Chatwoot do-not-push label", async () => {
    const h = harness({
      "dropout_core.api.unsubscribe": () => ({ message: { emails: ["a@b.co"], identities: [{ channel: "line", external_id: "Uabc" }] } }),
      "/contacts/search": () => ({ payload: [{ id: 9 }] }),
      "/contacts/9/labels": () => ({ payload: ["vip"] }),
    });
    const sig = await unsubscribeSignature(tenant.unsubscribe_secret, "a@b.co");
    expect((await handle(post(`/unsubscribe/${tenant.site}?email=a@b.co&sig=bad`, ""), h.env, h.app)).status).toBe(400);
    await handle(post(`/unsubscribe/${tenant.site}?email=a@b.co&sig=${sig}`, ""), h.env, h.app);
    await runJob(h.sent[0], h.deps);
    const label = h.calls.filter((c) => c.url.endsWith("/contacts/9/labels") && c.method === "POST");
    expect(label[0].body.labels).toEqual(["vip", "勿推播"]);
  });

  it("verifies the Frappe webhook signature exactly as Frappe computes it", async () => {
    const h = harness();
    const body = JSON.stringify({ event_type: "paid", idempotency_key: "Payment Entry:PE-1:paid", party_type: "Customer", party: "C1", payload: '{"amount": 5}' }, null, 1);
    const sig = toBase64(await hmacSha256("hook-secret", body));
    expect((await handle(post(`/erpnext/events?site=${tenant.site}`, body, { "x-frappe-webhook-signature": sig }), h.env, h.app)).status).toBe(200);
    expect(h.sent[0]).toMatchObject({ kind: "erpnext_event", event: { payload: { amount: 5 } } });
    expect((await handle(post(`/erpnext/events?site=${tenant.site}`, body, { "x-frappe-webhook-signature": "x" }), h.env, h.app)).status).toBe(403);
  });

  it("G9: ECPay notify answers 1|OK, queues once, ignores simulated payments", async () => {
    const h = harness();
    const f: Record<string, string> = { MerchantID: "3002607", MerchantTradeNo: "DO123", RtnCode: "1", TradeAmt: "1500", TradeNo: "T9", SimulatePaid: "0" };
    f.CheckMacValue = await ecpayCheckMacValue(f, KEY, IV);
    const req = () => new Request(`https://glue.example/pay/ecpay?site=${tenant.site}`, { method: "POST", body: new URLSearchParams(f) });
    const res = await handle(req(), h.env, h.app);
    expect(await res.text()).toBe("1|OK");
    await handle(req(), h.env, h.app);
    expect(h.sent).toEqual([expect.objectContaining({ kind: "payment", trade_no: "DO123", amount: 1500 })]);
    const forged = new Request(`https://glue.example/pay/ecpay?site=${tenant.site}`, { method: "POST", body: new URLSearchParams({ ...f, TradeAmt: "1" }) });
    expect((await handle(forged, h.env, h.app)).status).toBe(400);
  });

  it("admin needs the bearer token", async () => {
    const h = harness();
    const req = (auth?: string) => new Request(`https://glue.example/admin/tenants/x`, { method: "PUT", body: JSON.stringify({ ...tenant, site: "x" }), headers: auth ? { authorization: auth } : {} });
    expect((await handle(req(), h.env, h.app)).status).toBe(403);
    expect((await handle(req("Bearer admin"), h.env, h.app)).status).toBe(200);
    expect(h.store.tenants.has("x")).toBe(true);
  });
});

describe("queue", () => {
  it("retries 5xx with backoff, dead-letters 4xx at once", async () => {
    const h = harness({ resolve_party: () => new Response("down", { status: 502 }) });
    const job: Job = { kind: "chatwoot", site: tenant.site, conversation_id: "1", channel: "line", external_id: "U", source_account: "inbox:1" };
    const a = batch([job]);
    await consume(a.batch, h.env, h.app);
    expect(a.results.retry).toEqual([30]);

    const h2 = harness({ resolve_party: () => new Response("bad", { status: 417 }) });
    const b = batch([job]);
    await consume(b.batch, h2.env, h2.app);
    expect(b.results.ack).toBe(1);
    expect(h2.store.dead[0]).toMatchObject({ kind: "chatwoot", site: tenant.site });
  });

  it("marks the e-invoice failed in ERPNext after the last attempt", async () => {
    const h = harness({ "/api/resource/": () => new Response("down", { status: 503 }) });
    h.store.tenants.set(tenant.site, { ...tenant, einvoice: { provider: "ecpay", merchant_id: "m", hash_key: KEY, hash_iv: IV } });
    const job: Job = { kind: "erpnext_event", site: tenant.site, event: { name: "e", event_type: "invoiced", idempotency_key: "k", reference_doctype: "Sales Invoice", reference_name: "SINV-9" } };
    const b = batch([job], MAX_ATTEMPTS);
    await consume(b.batch, h.env, h.app);
    expect(h.store.dead).toHaveLength(1);
    expect(h.calls.find((c) => c.url.endsWith("set_einvoice"))?.body).toMatchObject({ sales_invoice: "SINV-9", status: "失敗" });
  });
});

describe("meetings", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:weekly-1",
    "SUMMARY:每週產銷會議",
    "DTSTART;TZID=Asia/Taipei:20260105T100000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "EXDATE;TZID=Asia/Taipei:20261005T100000",
    "DESCRIPTION:加入 Google Meet：https://meet.google.com/abc-defg-hij\\n",
    "ATTENDEE;CN=安安:mailto:AnAn@Example.com",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:zoom-1",
    "SUMMARY:顧問訪談",
    "DTSTART:20261012T060000Z",
    "LOCATION:https://us02web.zoom.us/j/81234567890?pwd=AbC.123",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("finds Meet/Zoom links and Taipei wall-clock times", () => {
    expect(findMeetingLink("https://us02web.zoom.us/j/81234567890?pwd=AbC.123")).toMatchObject({ platform: "zoom", id: "81234567890", passcode: "AbC.123" });
    expect(zonedToUtc(2026, 10, 12, 10, 0, 0, "Asia/Taipei").toISOString()).toBe("2026-10-12T02:00:00.000Z");
  });

  it("expands weekly recurrences and honours EXDATE", () => {
    const monday = eventsInWindow(ics, new Date("2026-10-12T01:55:00Z"), new Date("2026-10-12T02:05:00Z"));
    expect(monday).toHaveLength(1);
    expect(monday[0]).toMatchObject({ summary: "每週產銷會議", attendees: ["anan@example.com"], link: { platform: "google_meet", id: "abc-defg-hij" } });
    expect(eventsInWindow(ics, new Date("2026-10-05T01:55:00Z"), new Date("2026-10-05T02:05:00Z"))).toHaveLength(0);
  });

  it("cron queues each meeting once; done → transcript → summary → ERPNext", async () => {
    const h = harness({
      "basic.ics": () => new Response(ics),
      "/transcripts/google_meet/abc-defg-hij": () => ({ segments: [{ speaker: "安安", text: "試產延到下週" }] }),
    });
    expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T01:58:00Z"))).toBe(1);
    expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T02:03:00Z"))).toBe(0);
    await runJob(h.sent[0], h.deps);
    expect(h.calls.find((c) => c.url.endsWith("/bots"))?.body).toMatchObject({ platform: "google_meet", native_meeting_id: "abc-defg-hij" });

    await handle(post(`/vexa/${tenant.site}/vt`, { platform: "google_meet", native_meeting_id: "abc-defg-hij", status: "completed", id: 5 }), h.env, h.app);
    await runJob(h.sent[1], h.deps);
    const write = h.calls.find((c) => c.url.endsWith("record_meeting"));
    expect(write?.body).toMatchObject({ meeting_id: "abc-defg-hij", attendees: ["anan@example.com"] });
    expect(write?.body.summary).toContain("每週產銷會議");
  });

  it("lists upcoming meetings for the shell and skips the ones staff turned off", async () => {
    const h = harness({ "basic.ics": () => new Response(ics) });
    vi.useFakeTimers({ now: new Date("2026-10-12T01:00:00Z"), toFake: ["Date"] });
    try {
      const get = () => new Request(`https://glue.example/admin/tenants/${tenant.site}/meetings?hours=6`, { headers: { authorization: "Bearer admin" } });
      const list = (await (await handle(get(), h.env, h.app)).json()) as { meetings: { key: string; title: string; skipped: boolean }[] };
      expect(list.meetings.map((m) => m.title)).toEqual(["每週產銷會議", "顧問訪談"]);
      const skip = (key: string, skip: boolean) => handle(post(`/admin/tenants/${tenant.site}/meetings/skip`, { key, skip }, { authorization: "Bearer admin" }), h.env, h.app);
      expect((await skip("meeting:other.site:x", true)).status).toBe(400);
      await skip(list.meetings[0].key, true);
      const again = (await (await handle(get(), h.env, h.app)).json()) as typeof list;
      expect(again.meetings[0].skipped).toBe(true);
      expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T01:58:00Z"))).toBe(0);
      await skip(list.meetings[0].key, false);
      expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T01:58:00Z"))).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("chat waiting queue", () => {
  const conv = (id: number) => ({ id, status: "open", waiting_since: 1_700_000_000, meta: { sender: { name: `客人${id}`, email: "a@b.c", phone_number: "+886" }, channel: "Channel::Line" }, messages: [{ message_type: 0, created_at: 1_700_000_000, content: "我的地址" }] });
  const get = (token = "shell") => new Request(`https://glue.example/admin/tenants/${tenant.site}/chat/waiting`, { headers: { authorization: `Bearer ${token}` } });

  it("reads open conversations page by page for the shell and drops message text and contact details", async () => {
    const page = (payload: unknown[]) => () => ({ data: { meta: { all_count: 3 }, payload } });
    const h = harness({ "page=1": page([conv(1), conv(2)]), "page=2": page([conv(3)]), "page=3": page([]) });
    const res = await handle(get(), h.env, h.app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; total: number; conversations: any[] };
    expect(body).toMatchObject({ enabled: true, total: 3 });
    expect(body.conversations.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(JSON.stringify(body)).not.toMatch(/地址|a@b\.c|\+886/);
    expect(h.calls.map((c) => c.url)).toEqual([1, 2, 3].map((n) => `https://chat.example/api/v1/accounts/3/conversations?status=open&assignee_type=all&page=${n}`));
    expect((await handle(get("nope"), h.env, h.app)).status).toBe(403);
  });

  it("says when the company has no inbox and when the inbox does not answer", async () => {
    const h = harness();
    h.store.tenants.set(tenant.site, { ...tenant, chatwoot_token: undefined });
    expect(await (await handle(get(), h.env, h.app)).json()).toEqual({ enabled: false, total: null, conversations: [] });
    const down = harness({ "/conversations?": () => new Response("boom", { status: 500 }) });
    expect((await handle(get(), down.env, down.app)).status).toBe(502);
  });
});

const req = (method: string, path: string, token: string, body?: unknown) =>
  new Request(`https://glue.example${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-actor": "ops@dropout.tw" },
  });

describe("accounts", () => {
  const now = new Date("2026-10-11T04:00:00Z");

  it("walks trial → due soon → past due → read only, and manual states win", () => {
    expect(lifecycle({ state: "active", trial_ends: "2026-10-20" }, now)).toMatchObject({ stage: "trial", writable: true, message: "試用還有 9 天（到 2026-10-20）。" });
    expect(lifecycle({ state: "active", trial_ends: "2026-10-11" }, now).message).toBe("試用今天到期（到 2026-10-11）。");
    expect(lifecycle({ state: "active", renews_on: "2027-10-10" }, now)).toMatchObject({ stage: "active", message: "" });
    expect(lifecycle({ state: "active", renews_on: "2026-11-30" }, now)).toMatchObject({ stage: "due_soon", writable: true });
    expect(lifecycle({ state: "active", renews_on: "2026-10-11" }, now).stage).toBe("due_soon");
    expect(lifecycle({ state: "active", renews_on: "2026-10-01" }, now)).toMatchObject({ stage: "past_due", writable: true, bots: true });
    expect(lifecycle({ state: "active", renews_on: "2026-09-01" }, now)).toMatchObject({ stage: "read_only", writable: false, bots: false });
    expect(lifecycle({ state: "suspended", state_reason: "帳款未付", renews_on: "2027-10-10" }, now)).toMatchObject({ stage: "suspended", writable: false });
    expect(lifecycle({ state: "cancelled" }, now).bots).toBe(false);
    expect(addYears("2028-02-29", 1)).toBe("2029-03-01");
    expect(taiwanDate(new Date("2026-10-11T17:00:00Z"))).toBe("2026-10-12");
  });

  it("registers a company, maps its host, renews and suspends with a history", async () => {
    const h = harness();
    let res = await handle(req("PUT", `/admin/accounts/${tenant.site}`, "admin", { company: "琢奧精密製造", hosts: ["https://Make.OS.dropout.tw/"], trial_ends: "2026-11-10", profile: { scene: "make", size: "small", modules: ["sales"] } }), h.env, h.app);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).account).toMatchObject({ hosts: ["make.os.dropout.tw"], lifecycle: { stage: "trial" } });

    res = await handle(req("PUT", "/admin/accounts/other.dropout.tw", "admin", { company: "別家", hosts: ["make.os.dropout.tw"] }), h.env, h.app);
    expect(res.status).toBe(409);

    res = await handle(req("POST", `/admin/accounts/${tenant.site}/renew`, "admin", { years: 1, reference: "ACC-SINV-0001" }), h.env, h.app);
    const renewed = ((await res.json()) as any).account;
    expect(renewed.renews_on).toBe(addYears(taiwanDate(), 1));
    expect(renewed.lifecycle.stage).toBe("active");

    res = await handle(req("POST", `/admin/accounts/${tenant.site}/state`, "admin", { state: "suspended", reason: "帳款未付" }), h.env, h.app);
    expect(((await res.json()) as any).account.lifecycle).toMatchObject({ stage: "suspended", writable: false });

    const detail = (await (await handle(req("GET", `/admin/accounts/${tenant.site}`, "admin"), h.env, h.app)).json()) as any;
    expect(detail.events.map((e: any) => e.action)).toEqual(["暫停", "續約", "建立"]);
    expect(detail.events[0].actor).toBe("ops@dropout.tw");
  });

  it("the shell token resolves hosts and reads one company, but cannot touch accounts or secrets", async () => {
    const h = harness();
    store_oauth(h);
    await handle(req("PUT", `/admin/accounts/${tenant.site}`, "admin", { company: "琢奧精密製造", hosts: ["make.os.dropout.tw"], renews_on: "2027-10-10" }), h.env, h.app);

    const dir = await handle(req("GET", "/shell/tenant?host=make.os.dropout.tw", "shell"), h.env, h.app);
    const body = (await dir.json()) as any;
    expect(body).toMatchObject({ site: tenant.site, company: "琢奧精密製造", erpnext: { url: "https://erp.example", oauth: { client_id: "cid" } }, chatwoot: { account_id: 3 }, lifecycle: { stage: "active" } });
    for (const secret of ["erpnext_secret", "erpnext_key", "hook-secret", "unsub-secret", "path-token", '"cw"', "vk"]) expect(JSON.stringify(body)).not.toContain(secret);
    expect((await handle(req("GET", "/shell/tenant?host=nobody.example", "shell"), h.env, h.app)).status).toBe(404);
    expect((await handle(req("GET", "/shell/tenant?host=make.os.dropout.tw", "wrong"), h.env, h.app)).status).toBe(403);

    expect((await handle(req("GET", "/admin/accounts", "shell"), h.env, h.app)).status).toBe(403);
    expect((await handle(req("PUT", `/admin/tenants/${tenant.site}`, "shell", tenant), h.env, h.app)).status).toBe(403);
    expect((await handle(req("GET", `/admin/tenants/${tenant.site}/dead-letters`, "shell"), h.env, h.app)).status).toBe(200);

    await h.store.addDeadLetter(tenant.site, "form", JSON.stringify({ kind: "form", site: tenant.site }), "boom");
    await h.store.addDeadLetter("other.site", "form", JSON.stringify({ kind: "form", site: "other.site" }), "boom");
    expect((await handle(req("POST", `/admin/dead-letters/2/replay?site=${tenant.site}`, "shell"), h.env, h.app)).status).toBe(404);
    expect((await handle(req("POST", "/admin/dead-letters/1/replay", "shell"), h.env, h.app)).status).toBe(404);
    expect((await handle(req("POST", `/admin/dead-letters/1/replay?site=${tenant.site}`, "shell"), h.env, h.app)).status).toBe(200);
  });

  it("stops meeting bots for read-only companies; daily refreshes usage and forgets old keys", async () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:z", "SUMMARY:週會", "DTSTART:20261012T020000Z", "LOCATION:https://meet.google.com/abc-defg-hij", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const h = harness({ "basic.ics": () => new Response(ics), "dropout_core.team.usage": () => ({ message: { users: 7, db_mb: 120 } }) });
    await handle(req("PUT", `/admin/accounts/${tenant.site}`, "admin", { company: "琢奧精密製造", renews_on: "2026-09-01" }), h.env, h.app);
    expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T01:58:00Z"))).toBe(0);
    await handle(req("POST", `/admin/accounts/${tenant.site}/renew`, "admin", {}), h.env, h.app);
    expect(await scheduleMeetings(h.env, h.app, new Date("2026-10-12T01:58:00Z"))).toBe(1);

    await h.store.claim("erp:old");
    h.store.seenAt.set("erp:old", "2026-01-01T00:00:00.000Z");
    await h.store.claim("skip:meeting:keep");
    h.store.seenAt.set("skip:meeting:keep", "2026-01-01T00:00:00.000Z");
    const out = await daily(h.env, h.app, new Date("2026-10-12T18:01:00Z"));
    expect(out).toMatchObject({ pruned: 1, refreshed: 1, failed: 0 });
    expect(await h.store.isClaimed("skip:meeting:keep")).toBe(true);
    expect((await h.store.getAccount(tenant.site))!.usage).toMatchObject({ users: 7 });
    expect((await scheduled(h.env, h.app, new Date("2026-10-12T10:00:00Z"))).daily).toBeNull();
  });

  it("reminds on set days before and after the end date", () => {
    const a = { site: "s", company: "安安", plan: "annual", state: "active" as const, hosts: [], created_at: "", updated_at: "" };
    const at = (d: string) => new Date(`${d}T18:01:00Z`);
    expect(reminderFor({ ...a, trial_ends: "2026-10-20" }, at("2026-10-12"))).toMatchObject({ key: "remind:s:trial:2026-10-20:7", subject: "EveryThingOS 試用還有 7 天（安安）" });
    expect(reminderFor({ ...a, trial_ends: "2026-10-21" }, at("2026-10-12"))).toBeNull();
    expect(reminderFor({ ...a, renews_on: "2026-11-12" }, at("2026-10-12"))!.key).toBe("remind:s:due_soon:2026-11-12:30");
    expect(reminderFor({ ...a, renews_on: "2026-10-12" }, at("2026-10-12"))!.subject).toContain("寬限期");
    expect(reminderFor({ ...a, renews_on: "2026-09-28" }, at("2026-10-12"))!.subject).toContain("只能看");
    expect(reminderFor({ ...a, state: "suspended", renews_on: "2026-10-20" }, at("2026-10-12"))).toBeNull();
  });

  it("daily pushes the contract status to ERPNext and mails each reminder once; state changes push right away", async () => {
    const h = harness({ "api.resend.com": () => ({ id: "r1" }) });
    Object.assign(h.env, { RESEND_API_KEY: "re_test", PLATFORM_MAIL_FROM: "EveryThingOS <billing@dropout.tw>", PLATFORM_NOTIFY: "ops@dropout.tw" });
    await handle(req("PUT", `/admin/accounts/${tenant.site}`, "admin", { company: "琢奧精密製造", trial_ends: "2026-10-20", contact_email: "boss@make.tw" }), h.env, h.app);
    const pushes = () => h.calls.filter((c) => c.url.endsWith("dropout_core.account.set_status"));
    expect(pushes().at(-1)!.body).toMatchObject({ stage: "trial", locked: 0 });

    const now = new Date("2026-10-12T18:01:00Z");
    expect(await daily(h.env, h.app, now)).toMatchObject({ reminded: 1, pushed: 1 });
    expect(await daily(h.env, h.app, now)).toMatchObject({ reminded: 0 });
    const mail = h.calls.filter((c) => c.url.includes("api.resend.com"));
    expect(mail).toHaveLength(1);
    expect(mail[0].body).toMatchObject({ to: ["boss@make.tw"], subject: "EveryThingOS 試用還有 7 天（琢奧精密製造）", reply_to: "ops@dropout.tw" });
    expect(h.emails.at(-1)).toMatchObject({ to: "ops@dropout.tw" });
    const detail = (await (await handle(req("GET", `/admin/accounts/${tenant.site}`, "admin"), h.env, h.app)).json()) as any;
    expect(detail.events[0]).toMatchObject({ action: "提醒", actor: "排程" });

    const res = await handle(req("POST", `/admin/accounts/${tenant.site}/state`, "admin", { state: "suspended", reason: "測試" }), h.env, h.app);
    expect(((await res.json()) as any).erpnext).toBe(true);
    expect(pushes().at(-1)!.body).toMatchObject({ stage: "suspended", locked: 1 });
  });
});

function store_oauth(h: ReturnType<typeof harness>) {
  h.store.tenants.set(tenant.site, { ...tenant, shell_oauth_client_id: "cid", shell_oauth_client_secret: "csecret" });
}
