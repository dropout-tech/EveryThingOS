import { lifecycle, mergeAccount, renewalEnd, taiwanDate, type Account } from "./accounts";
import type { Env } from "./app";
import { hmacSha256, safeEqual, toHex } from "./crypto";
import { ECPayInvoice, type EInvoiceProvider } from "./einvoice";
import { healthScore } from "./health";
import { escapeHtml } from "./mail";
import { ecpayCheckMacValue, ecpayVerify } from "./pay";
import type { GatewayKeys, Invoice, Store } from "./store";

/** The one place the price lives: NT$100,000 a year before 5% 營業稅 (web/lib/commercial.ts shows the same). */
export const ANNUAL_NET_TWD = 100_000;
export const TAX_RATE = 0.05;

export function annualPrice() {
  const tax = Math.round(ANNUAL_NET_TWD * TAX_RATE);
  return { net: ANNUAL_NET_TWD, tax, amount: ANNUAL_NET_TWD + tax };
}

/** DropOut's own ECPay merchant and e-invoice account; customers' gateways stay in their tenant config. */
export type BillingEnv = {
  BILLING_ECPAY_MERCHANT_ID?: string;
  BILLING_ECPAY_HASH_KEY?: string;
  BILLING_ECPAY_HASH_IV?: string;
  /** "production" sends customers to the live cashier; anything else uses ECPay's staging site. */
  BILLING_ECPAY_ENV?: string;
  BILLING_EINVOICE_MERCHANT_ID?: string;
  BILLING_EINVOICE_HASH_KEY?: string;
  BILLING_EINVOICE_HASH_IV?: string;
  BILLING_EINVOICE_ENV?: string;
  /** The glue's public origin, for payment links in reminder emails sent by the cron. */
  GLUE_PUBLIC_URL?: string;
};

export type BillingCtx = {
  env: Env;
  store: Store;
  fetcher: typeof fetch;
  /** Pushes the contract status to the company's ERPNext (app.ts `pushStatus`). */
  push: (a: Account) => Promise<boolean>;
};

const ECPAY_CASHIER = { production: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5", staging: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5" };

export function ecpayConfig(env: BillingEnv): { keys: GatewayKeys; production: boolean } | null {
  const { BILLING_ECPAY_MERCHANT_ID: merchant_id, BILLING_ECPAY_HASH_KEY: hash_key, BILLING_ECPAY_HASH_IV: hash_iv } = env;
  if (!merchant_id || !hash_key || !hash_iv) return null;
  return { keys: { merchant_id, hash_key, hash_iv }, production: env.BILLING_ECPAY_ENV === "production" };
}

function einvoiceProvider(env: BillingEnv, fetcher: typeof fetch): EInvoiceProvider | null {
  const { BILLING_EINVOICE_MERCHANT_ID: merchant_id, BILLING_EINVOICE_HASH_KEY: hash_key, BILLING_EINVOICE_HASH_IV: hash_iv } = env;
  if (!merchant_id || !hash_key || !hash_iv) return null;
  return new ECPayInvoice({ merchant_id, hash_key, hash_iv, sandbox: env.BILLING_EINVOICE_ENV !== "production" }, fetcher);
}

export function gatewayStatus(env: BillingEnv) {
  const pay = ecpayConfig(env);
  return {
    ecpay: pay ? (pay.production ? "production" : "staging") : null,
    einvoice: env.BILLING_EINVOICE_MERCHANT_ID && env.BILLING_EINVOICE_HASH_KEY && env.BILLING_EINVOICE_HASH_IV ? (env.BILLING_EINVOICE_ENV === "production" ? "production" : "staging") : null,
  };
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const ntd = (n: number) => `NT$${n.toLocaleString("en-US")}`;

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.4rem">${title}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Renew one company. The admin route and payments both come through here, so history reads the same. */
export async function renewAccount(store: Store, a: Account, opts: { years?: number; until?: string; reference?: string }, actor: string, now = new Date()) {
  const until = opts.until && /^\d{4}-\d{2}-\d{2}$/.test(opts.until) ? opts.until : renewalEnd(a.renews_on, taiwanDate(now), Math.min(Math.max(Number(opts.years ?? 1), 1), 5));
  const next = mergeAccount(a.site, a, { renews_on: until, state: "active", state_reason: null }, now);
  await store.putAccount(next);
  await store.addAccountEvent(a.site, actor, "續約", `${a.renews_on ?? "（試用）"} → ${until}${opts.reference ? `；${opts.reference}` : ""}`);
  return next;
}

/** Paid contracts from 60 days before the end date until they are paid, suspended or cancelled. */
export function inRenewalWindow(a: Account, now = new Date()) {
  if (a.state !== "active" || !a.renews_on) return false;
  const l = lifecycle(a, now);
  return l.stage === "due_soon" || l.stage === "past_due" || l.stage === "read_only";
}

export const invoicePeriod = (a: Account, now = new Date()) => a.renews_on ?? taiwanDate(now);

function randomId(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(length))].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * The company's live invoice for its current period, opening one if needed.
 * The cron passes `respectVoid` so a voided invoice is not silently reissued;
 * an operator opening one by hand may reissue.
 */
export async function openInvoice(store: Store, a: Account, actor: string, { now = new Date(), respectVoid = false } = {}) {
  const period = invoicePeriod(a, now);
  const mine = (await store.listInvoices(a.site)).filter((i) => i.period === period);
  const live = mine.find((i) => i.status !== "void");
  if (live) return { invoice: live, created: false };
  if (respectVoid && mine.length) return { invoice: null, created: false };
  const price = annualPrice();
  const inv: Invoice = {
    id: `DO-${period.slice(0, 4)}-${randomId(6)}`,
    site: a.site,
    period,
    buyer_name: a.company,
    buyer_tax_id: a.tax_id || null,
    buyer_email: a.contact_email || null,
    buyer_address: a.billing_address || null,
    ...price,
    status: "open",
    created_at: now.toISOString(),
    paid_at: null,
    paid_via: null,
    trade_no: null,
    gateway_txn: null,
    reference: null,
    renewed_until: null,
    void_reason: null,
    einvoice_number: null,
    einvoice_error: null,
    einvoice_at: null,
  };
  if (!(await store.insertInvoice(inv))) {
    const again = (await store.listInvoices(a.site)).find((i) => i.period === period && i.status !== "void");
    return { invoice: again ?? null, created: false };
  }
  await store.addAccountEvent(a.site, actor, "開帳單", `${inv.id} ${ntd(inv.amount)}（含稅），${a.renews_on ? `${period} 到期後` : "從付款日起"}續一年`);
  return { invoice: inv, created: true };
}

export async function paySignature(env: Env, id: string) {
  return toHex(await hmacSha256(env.TENANT_KEY, `billing-pay:${id}`)).slice(0, 32);
}

export async function payUrl(env: Env, origin: string, id: string) {
  return `${origin.replace(/\/+$/, "")}/billing/pay/${encodeURIComponent(id)}?sig=${await paySignature(env, id)}`;
}

/** Payment link for the company's open invoice, for reminder emails. Null without GLUE_PUBLIC_URL. */
export async function openPayUrl(env: Env, store: Store, site: string) {
  if (!env.GLUE_PUBLIC_URL) return null;
  const open = (await store.listInvoices(site)).find((i) => i.status === "open");
  return open ? payUrl(env, env.GLUE_PUBLIC_URL, open.id) : null;
}

export function merchantTradeDate(now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3_600_000).toISOString();
  return `${t.slice(0, 10).replace(/-/g, "/")} ${t.slice(11, 19)}`;
}

/** AIO checkout fields for one attempt. The amount always comes from the invoice row. */
export async function checkoutFields(cfg: { keys: GatewayKeys }, inv: Invoice, tradeNo: string, origin: string, backUrl: string, now = new Date()) {
  const fields: Record<string, string> = {
    MerchantID: cfg.keys.merchant_id,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: merchantTradeDate(now),
    PaymentType: "aio",
    TotalAmount: String(inv.amount),
    TradeDesc: "EveryThingOS 年約",
    ItemName: `EveryThingOS 年約一年 ${inv.id}`,
    ReturnURL: `${origin.replace(/\/+$/, "")}/billing/ecpay`,
    ClientBackURL: backUrl,
    ChoosePayment: "ALL",
    IgnorePayment: "CVS#BARCODE",
    EncryptType: "1",
    CustomField1: inv.id,
  };
  fields.CheckMacValue = await ecpayCheckMacValue(fields, cfg.keys.hash_key, cfg.keys.hash_iv);
  return fields;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("逾時")), ms)))]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Issue the e-invoice for a paid invoice: B2B with 統編, otherwise B2C to the
 * contact email. Buyer details are re-read from the account, so a corrected
 * 統編 or address applies on retry. A provider failure is written on the
 * invoice instead of thrown, and the daily job tries again.
 */
export async function issueEinvoice(ctx: BillingCtx, inv: Invoice, now = new Date()): Promise<"issued" | "failed" | "skipped"> {
  if (inv.status !== "paid" || inv.einvoice_number) return "skipped";
  const provider = einvoiceProvider(ctx.env, ctx.fetcher);
  if (!provider) return "skipped";
  const key = `billing-einvoice:${inv.id}`;
  if (!(await ctx.store.claim(key))) return "skipped";
  const a = await ctx.store.getAccount(inv.site);
  if (a) {
    inv = { ...inv, buyer_name: a.company, buyer_tax_id: a.tax_id || null, buyer_email: a.contact_email || null, buyer_address: a.billing_address || null };
    await ctx.store.updateInvoice(inv.id, null, { buyer_name: inv.buyer_name, buyer_tax_id: inv.buyer_tax_id, buyer_email: inv.buyer_email, buyer_address: inv.buyer_address });
  }
  const fail = async (error: string) => {
    await ctx.store.release(key);
    await ctx.store.updateInvoice(inv.id, null, { einvoice_error: error.slice(0, 300), einvoice_at: now.toISOString() });
    await ctx.store.addAccountEvent(inv.site, "排程", "發票失敗", `${inv.id}：${error.slice(0, 300)}（每天凌晨會再試，也可以在營運後台重開）`);
    return "failed" as const;
  };
  if (inv.buyer_tax_id && !inv.buyer_address) return fail("有統編要填發票地址");
  if (!inv.buyer_tax_id && !inv.buyer_email) return fail("沒有聯絡人 Email，開不了 B2C 發票");
  try {
    const issued = await withTimeout(
      provider.issue({
        name: inv.id,
        customer_name: inv.buyer_name,
        tax_id: inv.buyer_tax_id,
        email: inv.buyer_email,
        address: inv.buyer_address,
        grand_total: inv.amount,
        net_total: inv.net,
        items: [{ item_name: "EveryThingOS 年約", qty: 1, uom: "年", amount: inv.net }],
      }),
      10_000,
    );
    await ctx.store.updateInvoice(inv.id, null, { einvoice_number: issued.number, einvoice_error: null, einvoice_at: now.toISOString() });
    await ctx.store.addAccountEvent(inv.site, "排程", "開發票", `${inv.id} → ${issued.number}`);
    return "issued";
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

type Settlement = { via: "ecpay" | "offline"; actor: string; trade_no?: string; gateway_txn?: string; reference?: string };

/**
 * Mark an open invoice paid, renew the company one year and issue the e-invoice.
 * Safe to call again with the same payment: each step checks whether it already happened.
 */
export async function settleInvoice(ctx: BillingCtx, id: string, s: Settlement, now = new Date()): Promise<{ ok: boolean; message: string; voided?: boolean; account?: Account; invoice?: Invoice }> {
  const { store } = ctx;
  const won = await store.updateInvoice(id, "open", {
    status: "paid",
    paid_at: now.toISOString(),
    paid_via: s.via,
    trade_no: s.trade_no ?? null,
    gateway_txn: s.gateway_txn ?? null,
    reference: s.reference ?? null,
  });
  let inv = await store.getInvoice(id);
  if (!inv) return { ok: false, message: "找不到這張帳單" };
  if (inv.status === "void") {
    await store.addAccountEvent(inv.site, s.actor, "作廢帳單收到付款", `${inv.id}${s.trade_no ? `；綠界 ${s.trade_no}` : ""}，沒有自動續約，請人工確認或退款`);
    return { ok: false, voided: true, message: "這張帳單已作廢" };
  }
  if (!won && s.trade_no && inv.trade_no !== s.trade_no) {
    await store.addAccountEvent(inv.site, s.actor, "重複付款", `${inv.id} 已用 ${inv.trade_no ?? inv.reference ?? "其他方式"} 付過，又收到綠界 ${s.trade_no}，請到綠界後台退款`);
    return { ok: true, message: "已經付過", invoice: inv };
  }
  let account = (await store.getAccount(inv.site)) ?? undefined;
  if (!account) return { ok: false, message: "找不到這家公司" };
  if (!inv.renewed_until && (await store.claim(`billing-renew:${inv.id}`))) {
    try {
      const earlier = account.renews_on && account.renews_on > inv.period ? `；注意：付款前已續約到 ${account.renews_on}，請確認是否重複收款` : "";
      const paidBy = s.via === "ecpay" ? `綠界 ${s.trade_no}` : `線下付款${s.reference ? ` ${s.reference}` : ""}`;
      account = await renewAccount(store, account, { years: 1, reference: `${inv.id}；${paidBy}${earlier}` }, s.actor, now);
      await store.updateInvoice(inv.id, null, { renewed_until: account.renews_on ?? null });
    } catch (e) {
      await store.release(`billing-renew:${inv.id}`);
      throw e;
    }
    await ctx.push(account);
  }
  inv = (await store.getInvoice(id))!;
  await issueEinvoice(ctx, inv, now);
  inv = (await store.getInvoice(id))!;
  return { ok: true, message: won ? `已收款，續約到 ${account.renews_on}` : "已經付過", account, invoice: inv };
}

async function mailCustomer(ctx: BillingCtx, to: string, subject: string, body: string) {
  const { env } = ctx;
  if (!env.RESEND_API_KEY || !env.PLATFORM_MAIL_FROM) return false;
  const res = await ctx
    .fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.PLATFORM_MAIL_FROM, to: [to], subject, text: body, ...(env.PLATFORM_NOTIFY ? { reply_to: env.PLATFORM_NOTIFY } : {}) }),
    })
    .catch(() => null);
  return Boolean(res?.ok);
}

/** Daily: open renewal invoices for companies entering the window, retry e-invoices that failed. */
export async function billingDaily(ctx: BillingCtx, now = new Date()) {
  let opened = 0;
  let einvoiced = 0;
  let einvoiceFailed = 0;
  for (const a of await ctx.store.listAccounts()) {
    if (!inRenewalWindow(a, now)) continue;
    try {
      if ((await openInvoice(ctx.store, a, "排程", { now, respectVoid: true })).created) opened++;
    } catch {
      /* the next day tries again */
    }
  }
  if (gatewayStatus(ctx.env).einvoice) {
    for (const inv of await ctx.store.listInvoices()) {
      if (inv.status !== "paid" || inv.einvoice_number) continue;
      const out = await issueEinvoice(ctx, inv, now);
      if (out === "issued") einvoiced++;
      if (out === "failed") einvoiceFailed++;
    }
  }
  return { opened, einvoiced, einvoice_failed: einvoiceFailed };
}

const publicOrigin = (env: Env, url: URL) => (env.GLUE_PUBLIC_URL ?? url.origin).replace(/\/+$/, "");

async function formFields(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const form = await req.formData();
  form.forEach((v, k) => (out[k] = typeof v === "string" ? v : ""));
  return out;
}

/** Public billing routes: the signed payment link and ECPay's server notification. */
export async function billingRoute(req: Request, url: URL, parts: string[], ctx: BillingCtx): Promise<Response | null> {
  const { env, store } = ctx;

  if (parts[1] === "pay" && parts[2] && req.method === "GET") {
    const id = parts[2];
    const sig = url.searchParams.get("sig") ?? "";
    if (!safeEqual(sig, await paySignature(env, id))) return page("連結無效", "<p>這個付款連結不完整，請回覆續約通知信，我們再寄一次。</p>", 400);
    const inv = await store.getInvoice(id);
    if (!inv) return page("找不到帳單", "<p>這張帳單不存在，請回覆續約通知信。</p>", 404);
    const head = `<p>${escapeHtml(inv.buyer_name)} · 帳單 ${escapeHtml(inv.id)}<br>EveryThingOS 年約一年 ${ntd(inv.net)} ＋ 營業稅 ${ntd(inv.tax)} ＝ <b>${ntd(inv.amount)}</b></p>`;
    if (inv.status === "paid") return page("已經付款", `${head}<p>${inv.paid_at?.slice(0, 10)} 收到款項，${inv.renewed_until ? `年約到 ${inv.renewed_until}` : "續約處理中"}。謝謝！</p>`);
    if (inv.status === "void") return page("帳單已作廢", `${head}<p>這張帳單已作廢，請回覆續約通知信，我們寄新的給您。</p>`);
    const cfg = ecpayConfig(env);
    if (!cfg) return page("線上付款還沒開", `${head}<p>請直接回覆續約通知信，我們提供匯款資料。</p>`, 503);
    const tradeNo = `DO${Date.now().toString(36).toUpperCase()}${randomId(6)}`.slice(0, 20);
    await store.addPayment({ trade_no: tradeNo, invoice_id: inv.id, amount: inv.amount, created_at: new Date().toISOString() });
    const origin = publicOrigin(env, url);
    const fields = await checkoutFields(cfg, inv, tradeNo, origin, await payUrl(env, origin, inv.id));
    const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join("");
    const action = cfg.production ? ECPAY_CASHIER.production : ECPAY_CASHIER.staging;
    const note = cfg.production ? "" : "<p style=\"color:#b45309\">這是綠界測試環境，不會真的扣款。</p>";
    return page(
      "前往綠界付款",
      `${head}${note}<form id="pay" method="post" action="${action}">${inputs}<button type="submit">前往綠界付款（刷卡或 ATM）</button></form><script>document.getElementById("pay").submit()</script>`,
    );
  }

  // ECPay ReturnURL. Answer "1|OK" once handled, or ECPay keeps retrying.
  if (parts[1] === "ecpay" && req.method === "POST") {
    const cfg = ecpayConfig(env);
    if (!cfg) return text("0|not configured", 404);
    const f = await formFields(req);
    if (!(await ecpayVerify(f, cfg.keys.hash_key, cfg.keys.hash_iv))) return text("0|CheckMacValue Error", 400);
    if (f.MerchantID !== cfg.keys.merchant_id) return text("0|MerchantID Error", 400);
    const attempt = f.MerchantTradeNo ? await store.getPayment(f.MerchantTradeNo) : null;
    if (!attempt) return text("0|unknown MerchantTradeNo", 400);
    const inv = await store.getInvoice(attempt.invoice_id);
    if (!inv) return text("0|unknown invoice", 400);
    if (f.RtnCode !== "1") return text("1|OK");
    if (f.SimulatePaid === "1") {
      if (await store.claim(`billing-simulated:${f.MerchantTradeNo}`)) await store.addAccountEvent(inv.site, "payment", "模擬付款", `${inv.id}；綠界 ${f.MerchantTradeNo}（綠界後台模擬，不續約）`);
      return text("1|OK");
    }
    if (Number(f.TradeAmt) !== attempt.amount || attempt.amount !== inv.amount) {
      if (await store.claim(`billing-mismatch:${f.MerchantTradeNo}`)) await store.addAccountEvent(inv.site, "payment", "付款金額不符", `${inv.id}；綠界 ${f.MerchantTradeNo} 收到 ${f.TradeAmt}，帳單是 ${inv.amount}，沒有續約，請人工確認`);
      return text("1|OK");
    }
    const out = await settleInvoice(ctx, inv.id, { via: "ecpay", actor: "payment", trade_no: f.MerchantTradeNo, gateway_txn: f.TradeNo });
    return out.ok || out.voided ? text("1|OK") : text(`0|${out.message}`, 500);
  }

  return null;
}

/**
 * Admin routes. The shell token may only read one company's open invoice
 * (`GET /admin/tenants/:site/billing`), which app.ts `shellMayUse` allows.
 */
export async function billingAdmin(req: Request, url: URL, parts: string[], ctx: BillingCtx & { actor: string }): Promise<Response | null> {
  const { env, store } = ctx;
  const origin = publicOrigin(env, url);
  const withLink = async (inv: Invoice) => ({ ...inv, pay_url: inv.status === "open" ? await payUrl(env, origin, inv.id) : null });

  if (parts[1] === "tenants" && parts[2] && parts[3] === "billing" && !parts[4] && req.method === "GET") {
    const open = (await store.listInvoices(parts[2])).find((i) => i.status === "open");
    return json({
      online: Boolean(ecpayConfig(env)),
      invoice: open ? { id: open.id, amount: open.amount, net: open.net, tax: open.tax, period: open.period, created_at: open.created_at, pay_url: await payUrl(env, origin, open.id) } : null,
    });
  }

  if (parts[1] === "billing" && !parts[2] && req.method === "GET") {
    const now = new Date();
    const invoices = await store.listInvoices();
    const accounts: Record<string, unknown> = {};
    for (const a of await store.listAccounts()) {
      const open = invoices.filter((i) => i.site === a.site && i.status === "open");
      accounts[a.site] = {
        health: healthScore(a, open, now),
        open: open[0] ? { id: open[0].id, amount: open[0].amount, created_at: open[0].created_at } : null,
        einvoice_failed: invoices.some((i) => i.site === a.site && i.status === "paid" && !i.einvoice_number && i.einvoice_error),
      };
    }
    return json({ gateway: gatewayStatus(env), price: annualPrice(), accounts });
  }

  if (parts[1] === "accounts" && parts[2] && parts[3] === "invoices" && !parts[4]) {
    const a = await store.getAccount(parts[2]);
    if (!a) return text("not found", 404);
    if (req.method === "GET") {
      const invoices = await Promise.all((await store.listInvoices(a.site)).map(withLink));
      return json({ gateway: gatewayStatus(env), health: healthScore(a, invoices.filter((i) => i.status === "open")), invoices });
    }
    if (req.method === "POST") {
      const { invoice, created } = await openInvoice(store, a, ctx.actor);
      if (!invoice) return text("開不了帳單", 409);
      return json({ ok: true, created, invoice: await withLink(invoice) });
    }
  }

  if (parts[1] === "invoices" && parts[2] && parts[3] && req.method === "POST") {
    const inv = await store.getInvoice(parts[2]);
    if (!inv) return text("not found", 404);
    const body = (await req.json().catch(() => ({}))) as { reference?: string; reason?: string };
    if (parts[3] === "paid") {
      if (inv.status !== "open") return text(inv.status === "paid" ? "這張已經付過" : "這張已作廢", 409);
      const reference = String(body.reference ?? "").trim().slice(0, 120);
      if (!reference) return text("請填收款單號或匯款末五碼", 400);
      const out = await settleInvoice(ctx, inv.id, { via: "offline", actor: ctx.actor, reference });
      if (!out.ok) return text(out.message, 409);
      return json({ ok: true, message: out.message, invoice: out.invoice && (await withLink(out.invoice)) });
    }
    if (parts[3] === "void") {
      if (inv.status === "paid") return text("已付款的帳單不能作廢；要退款請到綠界後台，發票在加值中心作廢", 409);
      const reason = String(body.reason ?? "").trim().slice(0, 200);
      if (!(await store.updateInvoice(inv.id, "open", { status: "void", void_reason: reason || null }))) return text("這張已作廢", 409);
      await store.addAccountEvent(inv.site, ctx.actor, "作廢帳單", `${inv.id}${reason ? `：${reason}` : ""}`);
      return json({ ok: true, message: `${inv.id} 已作廢` });
    }
    if (parts[3] === "resend") {
      if (inv.status !== "open") return text("只有未付的帳單可以寄付款連結", 409);
      const a = await store.getAccount(inv.site);
      const link = await payUrl(env, origin, inv.id);
      const to = a?.contact_email;
      const sent = to
        ? await mailCustomer(
            ctx,
            to,
            `EveryThingOS 年約付款連結（${inv.buyer_name}）`,
            `${inv.buyer_name} 您好，\n\n這是 EveryThingOS 年約的付款連結，金額 ${ntd(inv.amount)}（含 5% 營業稅）：\n${link}\n\n可以刷卡或 ATM 轉帳。付款後馬上續約一年，電子發票會寄到這個信箱。\n有問題直接回覆這封信即可。\n\nEveryThingOS`,
          )
        : false;
      await store.addAccountEvent(inv.site, ctx.actor, "寄付款連結", sent ? `${inv.id} 寄給 ${to}` : `${inv.id} 沒有寄出（${to ? "寄信沒有設定或失敗" : "沒有聯絡人 Email"}），連結交給營運自己貼`);
      return json({ ok: true, sent, pay_url: link, message: sent ? `已寄給 ${to}` : "沒有寄出，請把連結複製給客戶" });
    }
    if (parts[3] === "einvoice") {
      if (inv.status !== "paid") return text("付款後才能開發票", 409);
      if (inv.einvoice_number) return text(`已經開過：${inv.einvoice_number}`, 409);
      if (!gatewayStatus(env).einvoice) return text("膠水沒有設定電子發票（BILLING_EINVOICE_*）", 409);
      const out = await issueEinvoice(ctx, inv);
      const after = (await store.getInvoice(inv.id))!;
      return json({ ok: out === "issued", message: out === "issued" ? `已開立 ${after.einvoice_number}` : after.einvoice_error ?? "正在處理，稍後再看" });
    }
  }

  return null;
}
