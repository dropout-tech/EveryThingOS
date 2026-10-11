import { describe, expect, it, vi } from "vitest";
import { addDays, addYears, renewalEnd, taiwanDate, type Account } from "../src/accounts";
import { daily, handle, type App, type Env } from "../src/app";
import { annualPrice, billingDaily, merchantTradeDate, paySignature, type BillingCtx } from "../src/billing";
import { toBase64 } from "../src/crypto";
import { ecpayInvoiceDecrypt, ecpayInvoiceEncrypt } from "../src/einvoice";
import { healthScore } from "../src/health";
import { ecpayCheckMacValue } from "../src/pay";
import { MemoryStore, type Tenant } from "../src/store";

const KEY = "pwFHCqoQZGmho4w6";
const IV = "EkRm7iFT261dpevs";
const SITE = "make.dropout.tw";

const tenant: Tenant = { site: SITE, erpnext_url: "https://erp.example", erpnext_key: "k", erpnext_secret: "s", erpnext_webhook_secret: "h", unsubscribe_secret: "u" };

type Call = { url: string; body: any };

function harness({ einvoice = "ok" as "ok" | "fail" | "off", ecpay = true } = {}) {
  const store = new MemoryStore();
  store.tenants.set(SITE, tenant);
  const calls: Call[] = [];
  let einvoiceMode = einvoice;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ url, body });
    if (url.includes("einvoice-stage.ecpay.com.tw")) {
      if (einvoiceMode === "fail") return new Response("down", { status: 503 });
      return Response.json({ TransCode: 1, Data: await ecpayInvoiceEncrypt({ RtnCode: 1, InvoiceNo: "AB12345678", InvoiceDate: "2026-10-11 12:00:00" }, KEY, IV) });
    }
    if (url.includes("api.resend.com")) return Response.json({ id: "r1" });
    return Response.json({ message: {} });
  }) as unknown as typeof fetch;
  const env = {
    JOBS: { send: async () => undefined },
    TENANT_KEY: toBase64(new Uint8Array(32)),
    ADMIN_TOKEN: "admin",
    SHELL_TOKEN: "shell",
    GLUE_PUBLIC_URL: "https://glue.example",
    ...(ecpay ? { BILLING_ECPAY_MERCHANT_ID: "3002607", BILLING_ECPAY_HASH_KEY: KEY, BILLING_ECPAY_HASH_IV: IV } : {}),
    ...(einvoice !== "off" ? { BILLING_EINVOICE_MERCHANT_ID: "2000132", BILLING_EINVOICE_HASH_KEY: KEY, BILLING_EINVOICE_HASH_IV: IV } : {}),
  } as unknown as Env;
  const app: App = { store: () => store, fetcher };
  const ctx: BillingCtx = { env, store, fetcher, push: async () => true };
  const setEinvoice = (m: "ok" | "fail") => (einvoiceMode = m);
  return { store, calls, env, app, ctx, setEinvoice };
}

const today = taiwanDate();

function account(patch: Partial<Account> = {}): Account {
  return { site: SITE, company: "琢奧精密製造", plan: "annual", state: "active", hosts: ["make.os.dropout.tw"], contact_email: "boss@make.tw", created_at: "", updated_at: "", ...patch };
}

const call = (method: string, path: string, token: string, body?: unknown) =>
  new Request(`https://glue.example${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-actor": "ops@dropout.tw" },
  });

async function notify(h: ReturnType<typeof harness>, fields: Record<string, string>, sign = true) {
  const f = { ...fields };
  if (sign) f.CheckMacValue = await ecpayCheckMacValue(f, KEY, IV);
  const res = await handle(new Request("https://glue.example/billing/ecpay", { method: "POST", body: new URLSearchParams(f) }), h.env, h.app);
  return { status: res.status, text: await res.text() };
}

/** Opens the signed link and returns the checkout fields the page posts to ECPay. */
async function checkout(h: ReturnType<typeof harness>, id: string) {
  const res = await handle(new Request(`https://glue.example/billing/pay/${id}?sig=${await paySignature(h.env, id)}`), h.env, h.app);
  const html = await res.text();
  const fields = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&")]));
  return { res, html, fields };
}

const paid = (fields: Record<string, string>, patch: Record<string, string> = {}) => ({
  MerchantID: "3002607",
  MerchantTradeNo: fields.MerchantTradeNo,
  RtnCode: "1",
  RtnMsg: "交易成功",
  TradeAmt: fields.TotalAmount,
  TradeNo: "2410111200001",
  PaymentType: "Credit_CreditCard",
  SimulatePaid: "0",
  ...patch,
});

describe("price and renewal math", () => {
  it("bills NT$100,000 plus 5% tax", () => {
    expect(annualPrice()).toEqual({ net: 100_000, tax: 5_000, amount: 105_000 });
  });

  it("renews from the later of the end date and today", () => {
    expect(renewalEnd("2027-03-01", "2026-12-01")).toBe("2028-03-01");
    expect(renewalEnd("2026-11-01", "2026-12-01")).toBe("2027-12-01");
    expect(renewalEnd(null, "2026-12-01")).toBe("2027-12-01");
    expect(renewalEnd("2028-02-29", "2026-12-01")).toBe("2029-03-01");
    expect(merchantTradeDate(new Date("2026-10-11T16:30:05Z"))).toBe("2026/10/12 00:30:05");
  });
});

describe("renewal invoices", () => {
  it("opens exactly one invoice per company per period, only inside the renewal window", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 59) }));
    await h.store.putAccount(account({ site: "far", company: "遠", renews_on: addDays(today, 200) }));
    await h.store.putAccount(account({ site: "trial", company: "試", trial_ends: addDays(today, 3) }));
    await h.store.putAccount(account({ site: "paused", company: "停", state: "suspended", renews_on: addDays(today, 10) }));
    await h.store.putAccount(account({ site: "late", company: "晚", renews_on: addDays(today, -20) }));

    expect(await billingDaily(h.ctx)).toMatchObject({ opened: 2 });
    expect(await billingDaily(h.ctx)).toMatchObject({ opened: 0 });
    await Promise.all([billingDaily(h.ctx), billingDaily(h.ctx)]);
    const invoices = await h.store.listInvoices();
    expect(invoices.map((i) => i.site).sort()).toEqual(["late", SITE]);
    expect(invoices.find((i) => i.site === SITE)).toMatchObject({ status: "open", amount: 105_000, net: 100_000, tax: 5_000, buyer_name: "琢奧精密製造", period: addDays(today, 59) });
    expect(h.store.events.filter((e) => e.action === "開帳單")).toHaveLength(2);
  });

  it("does not reopen a voided invoice by itself, but an operator can", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 30), tax_id: "22099131" }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    expect(inv.buyer_tax_id).toBe("22099131");
    expect((await handle(call("POST", `/admin/invoices/${inv.id}/void`, "admin", { reason: "統編寫錯" }), h.env, h.app)).status).toBe(200);
    expect(await billingDaily(h.ctx)).toMatchObject({ opened: 0 });
    const res = await handle(call("POST", `/admin/accounts/${SITE}/invoices`, "admin"), h.env, h.app);
    expect(((await res.json()) as any).created).toBe(true);
    expect((await h.store.listInvoices(SITE)).map((i) => i.status).sort()).toEqual(["open", "void"]);
  });
});

describe("online payment", () => {
  it("signed link → ECPay checkout with the invoice amount; forged link refused", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 30) }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    expect((await handle(new Request(`https://glue.example/billing/pay/${inv.id}?sig=nope`), h.env, h.app)).status).toBe(400);
    const { html, fields } = await checkout(h, inv.id);
    expect(html).toContain("https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5");
    expect(html).toContain("測試環境");
    expect(fields).toMatchObject({ MerchantID: "3002607", TotalAmount: "105000", ReturnURL: "https://glue.example/billing/ecpay", PaymentType: "aio", EncryptType: "1" });
    expect(fields.MerchantTradeNo).toMatch(/^[A-Z0-9]{1,20}$/);
    const { CheckMacValue, ...rest } = fields;
    expect(CheckMacValue).toBe(await ecpayCheckMacValue(rest, KEY, IV));
    expect((await checkout(h, inv.id)).fields.MerchantTradeNo).not.toBe(fields.MerchantTradeNo);
  });

  it("without ECPay keys the link explains how to pay instead", async () => {
    const h = harness({ ecpay: false });
    await h.store.putAccount(account({ renews_on: addDays(today, 30) }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const { res, html } = await checkout(h, inv.id);
    expect(res.status).toBe(503);
    expect(html).toContain("線上付款還沒開");
    expect((await notify(h, { MerchantTradeNo: "X" })).status).toBe(404);
  });

  it("notify: verifies, renews once from the end date, records the trade number, issues a B2C e-invoice", async () => {
    const h = harness();
    const ends = addDays(today, 30);
    await h.store.putAccount(account({ renews_on: ends }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const { fields } = await checkout(h, inv.id);

    expect((await notify(h, { ...paid(fields), CheckMacValue: "0".repeat(64) }, false)).status).toBe(400);
    expect((await notify(h, paid(fields, { MerchantID: "9999999" }))).status).toBe(400);
    expect((await notify(h, paid(fields, { MerchantTradeNo: "DOUNKNOWN" }))).status).toBe(400);
    expect((await h.store.getInvoice(inv.id))!.status).toBe("open");

    expect(await notify(h, paid(fields))).toEqual({ status: 200, text: "1|OK" });
    expect(await notify(h, paid(fields))).toEqual({ status: 200, text: "1|OK" });
    const after = (await h.store.getInvoice(inv.id))!;
    expect(after).toMatchObject({ status: "paid", paid_via: "ecpay", trade_no: fields.MerchantTradeNo, gateway_txn: "2410111200001", renewed_until: addYears(ends, 1), einvoice_number: "AB12345678" });
    expect((await h.store.getAccount(SITE))!.renews_on).toBe(addYears(ends, 1));
    const renewals = h.store.events.filter((e) => e.action === "續約");
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ actor: "payment" });
    expect(renewals[0].detail).toContain(fields.MerchantTradeNo);

    const issue = h.calls.filter((c) => c.url.endsWith("/B2CInvoice/Issue"));
    expect(issue).toHaveLength(1);
    const data = await ecpayInvoiceDecrypt(issue[0].body.Data, KEY, IV);
    expect(data).toMatchObject({ CustomerIdentifier: "", CustomerEmail: "boss@make.tw", Print: "0", SalesAmount: 105000 });
  });

  it("past due: renews one year from today; B2B e-invoice carries the 統編", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, -20), tax_id: "22099131", billing_address: "台中市西屯區工業區一路 1 號" }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const { fields } = await checkout(h, inv.id);
    await notify(h, paid(fields));
    expect((await h.store.getAccount(SITE))!.renews_on).toBe(addYears(today, 1));
    const data = await ecpayInvoiceDecrypt(h.calls.find((c) => c.url.endsWith("/B2CInvoice/Issue"))!.body.Data, KEY, IV);
    expect(data).toMatchObject({ CustomerIdentifier: "22099131", CustomerName: "琢奧精密製造", Print: "1" });
  });

  it("amount mismatch, simulated and failed payments never renew", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 30) }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const { fields } = await checkout(h, inv.id);
    expect((await notify(h, paid(fields, { TradeAmt: "1" }))).text).toBe("1|OK");
    expect((await notify(h, paid(fields, { SimulatePaid: "1" }))).text).toBe("1|OK");
    expect((await notify(h, paid(fields, { RtnCode: "10100058" }))).text).toBe("1|OK");
    expect((await h.store.getInvoice(inv.id))!.status).toBe("open");
    expect((await h.store.getAccount(SITE))!.renews_on).toBe(addDays(today, 30));
    expect(h.store.events.map((e) => e.action)).toEqual(expect.arrayContaining(["付款金額不符", "模擬付款"]));
  });

  it("a second payment for a paid invoice is flagged for refund, not renewed again", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 30) }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const first = (await checkout(h, inv.id)).fields;
    const second = (await checkout(h, inv.id)).fields;
    await notify(h, paid(first));
    expect((await notify(h, paid(second, { TradeNo: "2" }))).text).toBe("1|OK");
    expect(h.store.events.filter((e) => e.action === "續約")).toHaveLength(1);
    expect(h.store.events.some((e) => e.action === "重複付款")).toBe(true);
  });

  it("e-invoice failure keeps the renewal, is shown on the invoice, and the daily job retries", async () => {
    const h = harness({ einvoice: "fail" });
    const ends = addDays(today, 30);
    await h.store.putAccount(account({ renews_on: ends }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    expect((await notify(h, paid((await checkout(h, inv.id)).fields))).text).toBe("1|OK");
    expect((await h.store.getAccount(SITE))!.renews_on).toBe(addYears(ends, 1));
    expect((await h.store.getInvoice(inv.id))!).toMatchObject({ status: "paid", einvoice_number: null, einvoice_error: expect.stringContaining("503") });

    h.setEinvoice("ok");
    expect(await billingDaily(h.ctx)).toMatchObject({ einvoiced: 1 });
    expect((await h.store.getInvoice(inv.id))!).toMatchObject({ einvoice_number: "AB12345678", einvoice_error: null });
    expect(await billingDaily(h.ctx)).toMatchObject({ einvoiced: 0 });
  });
});

describe("operators and the shell", () => {
  it("mark paid offline renews through the same path; void and resend; e-invoice off stays quiet", async () => {
    const h = harness({ einvoice: "off" });
    Object.assign(h.env, { RESEND_API_KEY: "re_test", PLATFORM_MAIL_FROM: "DropOut OS <billing@dropout.tw>" });
    const ends = addDays(today, 30);
    await h.store.putAccount(account({ renews_on: ends }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);

    const resend = (await (await handle(call("POST", `/admin/invoices/${inv.id}/resend`, "admin"), h.env, h.app)).json()) as any;
    expect(resend).toMatchObject({ sent: true, pay_url: expect.stringContaining(`/billing/pay/${inv.id}?sig=`) });
    expect(h.calls.find((c) => c.url.includes("api.resend.com"))!.body.text).toContain(resend.pay_url);

    expect((await handle(call("POST", `/admin/invoices/${inv.id}/paid`, "admin", {}), h.env, h.app)).status).toBe(400);
    const res = await handle(call("POST", `/admin/invoices/${inv.id}/paid`, "admin", { reference: "匯款末五碼 12345" }), h.env, h.app);
    expect(res.status).toBe(200);
    expect((await h.store.getAccount(SITE))!.renews_on).toBe(addYears(ends, 1));
    expect(h.store.events.find((e) => e.action === "續約")).toMatchObject({ actor: "ops@dropout.tw", detail: expect.stringContaining("12345") });
    expect((await handle(call("POST", `/admin/invoices/${inv.id}/paid`, "admin", { reference: "x" }), h.env, h.app)).status).toBe(409);
    expect((await handle(call("POST", `/admin/invoices/${inv.id}/void`, "admin", {}), h.env, h.app)).status).toBe(409);
    expect((await h.store.getInvoice(inv.id))!.einvoice_error).toBeNull();

    const list = (await (await handle(call("GET", `/admin/accounts/${SITE}/invoices`, "admin"), h.env, h.app)).json()) as any;
    expect(list.invoices[0]).toMatchObject({ status: "paid", paid_via: "offline", pay_url: null });
    expect(list.gateway).toEqual({ ecpay: "staging", einvoice: null });
  });

  it("the shell token reads only its company's open invoice and cannot act on invoices", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 30) }));
    await billingDaily(h.ctx);
    const [inv] = await h.store.listInvoices(SITE);
    const res = await handle(call("GET", `/admin/tenants/${SITE}/billing`, "shell"), h.env, h.app);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ online: true, invoice: { id: inv.id, amount: 105_000, pay_url: expect.stringContaining("https://glue.example/billing/pay/") } });
    expect(((await (await handle(call("GET", "/admin/tenants/other.site/billing", "shell"), h.env, h.app)).json()) as any).invoice).toBeNull();
    for (const [method, path] of [["GET", `/admin/accounts/${SITE}/invoices`], ["POST", `/admin/invoices/${inv.id}/paid`], ["POST", `/admin/invoices/${inv.id}/void`], ["GET", "/admin/billing"]]) {
      expect((await handle(call(method, path, "shell", method === "POST" ? { reference: "x" } : undefined), h.env, h.app)).status).toBe(403);
    }
  });

  it("daily reminders carry the payment link", async () => {
    const h = harness();
    Object.assign(h.env, { RESEND_API_KEY: "re_test", PLATFORM_MAIL_FROM: "DropOut OS <billing@dropout.tw>" });
    const now = new Date();
    await h.store.putAccount(account({ renews_on: addDays(taiwanDate(now), 30) }));
    const out = await daily(h.env, h.app, now);
    expect(out.billing).toMatchObject({ opened: 1 });
    expect(out.reminded).toBe(1);
    const mail = h.calls.find((c) => c.url.includes("api.resend.com"))!;
    expect(mail.body.text).toContain("線上付款");
    expect(mail.body.text).toContain("https://glue.example/billing/pay/DO-");
  });

  it("console summary scores every company", async () => {
    const h = harness();
    await h.store.putAccount(account({ renews_on: addDays(today, 200), usage: { users: 5, active_users_7d: 4, invoices_30d: 20, invoices_prev_30d: 18 } }));
    const body = (await (await handle(call("GET", "/admin/billing", "admin"), h.env, h.app)).json()) as any;
    expect(body.accounts[SITE].health).toMatchObject({ score: 100, level: "ok" });
    expect(body.price.amount).toBe(105_000);
  });
});

describe("health score", () => {
  const now = new Date("2026-10-11T04:00:00Z");
  const base = account({ renews_on: "2027-06-01" });

  it("a busy, paid-up company scores 100 with no reasons", () => {
    expect(healthScore({ ...base, usage: { users: 10, active_users_7d: 8, last_active: "2026-10-11 09:00:00", invoices_30d: 40, invoices_prev_30d: 35 } }, [], now)).toEqual({ score: 100, level: "ok", reasons: [] });
  });

  it("an idle, lapsed, unpaid company is 高風險 with plain reasons", () => {
    const h = healthScore(
      { ...base, renews_on: "2026-10-01", usage: { users: 6, active_users_7d: 0, last_active: "2026-09-20 10:00:00", invoices_30d: 2, invoices_prev_30d: 12 } },
      [{ created_at: "2026-08-02T18:00:00.000Z" }],
      now,
    );
    expect(h.level).toBe("high");
    expect(h.score).toBe(0);
    expect(h.reasons).toEqual(["7 天沒有人用", "最近一次有人用是 21 天前", "單據變少：近 30 天 2 張，前 30 天 12 張", "已到期，寬限中", "帳單 69 天未付"]);
  });

  it("partial signals: low adoption, unreadable usage, ending trial", () => {
    expect(healthScore({ ...base, usage: { users: 10, active_users_7d: 2 } }, [], now)).toMatchObject({ score: 85, reasons: ["7 天只有 2／10 人在用"] });
    expect(healthScore({ ...base, usage: { users: 10, active_users_30d: 0 } }, [], now).reasons).toEqual(["30 天沒有人用"]);
    expect(healthScore({ ...base, usage: { error: "timeout" } }, [], now)).toMatchObject({ score: 90 });
    expect(healthScore({ ...base, renews_on: null, trial_ends: "2026-10-14" }, [], now)).toMatchObject({ score: 90, reasons: ["試用剩 3 天"] });
    expect(healthScore({ ...base, renews_on: "2026-10-30" }, [{ created_at: "2026-10-01T00:00:00Z" }], now)).toMatchObject({ score: 90, level: "ok", reasons: ["19 天後到期", "帳單開了 10 天，還沒付"] });
    expect(healthScore({ ...base, usage: { users: 3, active_users_7d: 3, invoices_30d: 0, invoices_prev_30d: 0 } }, [], now)).toMatchObject({ score: 90, reasons: ["60 天沒有開單"] });
    expect(healthScore({ ...base, state: "suspended" }, [], now)).toMatchObject({ score: 70, level: "watch" });
    expect(healthScore({ ...base, state: "cancelled" }, [], now)).toMatchObject({ level: "gone" });
  });
});
