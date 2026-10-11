import { ERPNext } from "./clients";
import { hmacSha256, safeEqual, toBase64 } from "./crypto";
import { isRetryable, onGiveUp, PermanentError, runJob, type Deps, type ErpEvent, type Job } from "./jobs";
import { parseGeneric, parseResend, unsubscribeSignature, verifyGeneric, verifySvix, type SendEmail } from "./mail";
import { eventsInWindow, type Ai, type CalendarEvent } from "./meetings";
import { ecpayVerify, newebpayDecode } from "./pay";
import { D1Store, type Store, type Tenant } from "./store";

export type Env = {
  DB: D1Database;
  JOBS: Queue<Job>;
  EMAIL?: SendEmail;
  AI?: Ai;
  TENANT_KEY: string;
  ADMIN_TOKEN: string;
  SUMMARY_MODEL?: string;
  AI_GATEWAY?: string;
  TURNSTILE_SECRET?: string;
};

export const MAX_ATTEMPTS = 4;

const CHANNELS: Record<string, string> = {
  "Channel::Line": "line",
  "Channel::FacebookPage": "fb",
  "Channel::Instagram": "ig",
  "Channel::WebWidget": "web_chat",
  "Channel::Api": "web_chat",
  "Channel::Email": "email",
  "Channel::Whatsapp": "phone",
  "Channel::Sms": "phone",
  "Channel::TwilioSms": "phone",
};

export type App = {
  store: (env: Env) => Store;
  fetcher: typeof fetch;
};

const defaultApp: App = { store: (env) => new D1Store(env.DB, env.TENANT_KEY), fetcher: (...a) => fetch(...a) };

function deps(env: Env, app: App): Deps {
  return {
    store: app.store(env),
    fetcher: app.fetcher,
    email: env.EMAIL,
    ai: env.AI,
    summaryModel: env.SUMMARY_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    aiGateway: env.AI_GATEWAY,
  };
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.4rem">${title}</h1><p>${body}</p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function formBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await req.json()) as Record<string, string>;
  const form = await req.formData();
  const out: Record<string, string> = {};
  form.forEach((v, k) => (out[k] = typeof v === "string" ? v : ""));
  return out;
}

function bearer(req: Request, env: Env) {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(env.ADMIN_TOKEN) && safeEqual(given, env.ADMIN_TOKEN);
}

async function turnstileOk(env: Env, token: string | undefined, ip: string | null, fetcher: typeof fetch) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip ? { remoteip: ip } : {}) }),
  });
  return ((await res.json()) as { success: boolean }).success;
}

/** Frappe Webhook: base64(HMAC-SHA256(secret, body)) in X-Frappe-Webhook-Signature. */
export async function verifyFrappe(secret: string, signature: string | null, body: string) {
  if (!signature) return false;
  return safeEqual(signature, toBase64(await hmacSha256(secret, body)));
}

async function enqueue(env: Env, store: Store, job: Job, dedupeKey?: string) {
  if (dedupeKey && !(await store.claim(dedupeKey))) return false;
  await env.JOBS.send(job);
  return true;
}

export async function handle(req: Request, env: Env, app: App = defaultApp): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const store = app.store(env);
  const tenantFor = async (site: string | null | undefined): Promise<Tenant | null> => (site ? store.getTenant(site) : null);

  if (parts[0] === "health") return json({ ok: true });

  // G1: Chatwoot webhook. CE has no body signature, so the path carries a per-tenant token.
  if (parts[0] === "chatwoot" && req.method === "POST") {
    const t = await tenantFor(parts[1]);
    if (!t || !t.chatwoot_path_token || !safeEqual(parts[2] ?? "", t.chatwoot_path_token)) return text("forbidden", 403);
    const body = (await req.json()) as Record<string, any>;
    const isConversation = body.event === "conversation_created";
    const isIncoming = body.event === "message_created" && body.message_type === "incoming";
    if (!isConversation && !isIncoming) return json({ ignored: body.event });
    const conv = isConversation ? body : body.conversation;
    const sender = conv?.meta?.sender ?? body.sender ?? {};
    const channel = CHANNELS[conv?.channel ?? body.inbox?.channel_type ?? ""] ?? "web_chat";
    const externalId = conv?.contact_inbox?.source_id ?? sender.identifier ?? String(sender.id ?? "");
    if (!conv?.id || !externalId) return json({ ignored: "missing ids" });
    const job: Job = {
      kind: "chatwoot",
      site: t.site,
      conversation_id: String(conv.id),
      channel,
      external_id: externalId,
      source_account: `inbox:${conv.inbox_id ?? body.inbox?.id ?? "default"}`,
      name: sender.name,
      email: sender.email,
      phone: sender.phone_number,
      url: t.chatwoot_url ? `${t.chatwoot_url}/app/accounts/${t.chatwoot_account_id}/conversations/${conv.id}` : undefined,
    };
    await enqueue(env, store, job, `chatwoot:${t.site}:${conv.id}`);
    return json({ ok: true });
  }

  // G3: website form.
  if (parts[0] === "forms" && req.method === "POST") {
    const t = await tenantFor(parts[1]);
    if (!t) return text("not found", 404);
    const f = await formBody(req);
    if (f.website) return json({ ok: true }); // honeypot
    if (!(await turnstileOk(env, f["cf-turnstile-response"], req.headers.get("cf-connecting-ip"), app.fetcher))) return text("驗證失敗，請重新整理再送一次", 400);
    const email = (f.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return text("請填正確的 Email", 400);
    const formId = f.form_id || crypto.randomUUID();
    await enqueue(
      env,
      store,
      {
        kind: "form",
        site: t.site,
        form_id: formId,
        email,
        name: f.name,
        phone: f.phone,
        consent: ["1", "true", "on", "yes"].includes(String(f.consent ?? "").toLowerCase()),
        wording_version: f.wording_version,
        source: f.source ?? req.headers.get("referer") ?? undefined,
        message: f.message,
        utm_source: f.utm_source,
        utm_medium: f.utm_medium,
        utm_campaign: f.utm_campaign,
        origin: url.origin,
      },
      `form:${t.site}:${formId}`,
    );
    if (f.redirect && /^https:\/\//.test(f.redirect)) return Response.redirect(f.redirect, 303);
    return json({ ok: true, form_id: formId });
  }

  // G4: double opt-in link. Runs inline so the person sees the result.
  if (parts[0] === "confirm" && req.method === "GET") {
    const t = await tenantFor(parts[1]);
    const token = url.searchParams.get("token");
    if (!t || !token) return page("連結無效", "這個確認連結不完整。", 400);
    try {
      await new ERPNext(t, app.fetcher).api("confirm_consent", { token });
    } catch {
      return page("暫時無法確認", "請稍後再點一次信裡的連結。", 502);
    }
    if (t.confirm_redirect) return Response.redirect(t.confirm_redirect, 303);
    return page("訂閱完成", "之後的電子報會寄到這個信箱。每封信下面都可以一鍵退訂。");
  }

  // G6: unsubscribe link and RFC 8058 one-click POST.
  if (parts[0] === "unsubscribe") {
    const t = await tenantFor(parts[1]);
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    const sig = url.searchParams.get("sig") ?? "";
    if (!t || !email || !safeEqual(sig, await unsubscribeSignature(t.unsubscribe_secret, email))) return page("連結無效", "這個退訂連結不完整。", 400);
    if (req.method === "GET" && url.searchParams.get("confirm") !== "1") {
      const action = `${url.pathname}?email=${encodeURIComponent(email)}&sig=${sig}`;
      return page("確認退訂", `<form method="post" action="${action}"><button type="submit">不要再寄給 ${email.replace(/[<>&"]/g, "")}</button></form>`);
    }
    await enqueue(env, store, { kind: "unsubscribe", site: t.site, email, source: "email_link" });
    return page("已退訂", "所有行銷信與推播都會停止。交易通知（出貨、發票）不受影響。");
  }

  // ERPNext → glue: every DropOut Event, signed by Frappe's own Webhook.
  if (parts[0] === "erpnext" && parts[1] === "events" && req.method === "POST") {
    const t = await tenantFor(url.searchParams.get("site"));
    const body = await req.text();
    if (!t || !(await verifyFrappe(t.erpnext_webhook_secret, req.headers.get("x-frappe-webhook-signature"), body))) return text("forbidden", 403);
    const event = JSON.parse(body) as ErpEvent;
    if (typeof event.payload === "string") {
      try {
        event.payload = JSON.parse(event.payload);
      } catch {
        /* keep as text */
      }
    }
    await enqueue(env, store, { kind: "erpnext_event", site: t.site, event }, `erp:${t.site}:${event.idempotency_key}`);
    return json({ ok: true });
  }

  // G7/G8: email service events.
  if (parts[0] === "mail" && req.method === "POST") {
    const t = await tenantFor(parts[1]);
    if (!t?.mail_webhook_secret) return text("not found", 404);
    const body = await req.text();
    const resend = (t.mail_provider ?? "resend") === "resend";
    const ok = resend ? await verifySvix(t.mail_webhook_secret, req.headers, body) : await verifyGeneric(t.mail_webhook_secret, req.headers, body);
    if (!ok) return text("forbidden", 403);
    const event = resend ? parseResend(body, req.headers.get("svix-id") ?? "") : parseGeneric(body);
    if (event.kind === "ignored") return json({ ignored: true });
    await enqueue(env, store, { kind: "mail", site: t.site, event }, `mail:${t.site}:${event.id}`);
    return json({ ok: true });
  }

  // G9: ECPay server notification. Must answer "1|OK" or ECPay retries.
  if (parts[0] === "pay" && parts[1] === "ecpay" && req.method === "POST") {
    const t = await tenantFor(url.searchParams.get("site"));
    if (!t?.ecpay) return text("0|unknown site", 404);
    const f = await formBody(req);
    if (!(await ecpayVerify(f, t.ecpay.hash_key, t.ecpay.hash_iv))) return text("0|CheckMacValue Error", 400);
    if (f.RtnCode === "1" && f.SimulatePaid !== "1") {
      await enqueue(
        env,
        store,
        { kind: "payment", site: t.site, gateway: "ecpay", trade_no: f.MerchantTradeNo, amount: Number(f.TradeAmt), gateway_txn: f.TradeNo, raw: f },
        `pay:${t.site}:ecpay:${f.MerchantTradeNo}`,
      );
    }
    return text("1|OK");
  }

  if (parts[0] === "pay" && parts[1] === "newebpay" && req.method === "POST") {
    const t = await tenantFor(url.searchParams.get("site"));
    if (!t?.newebpay) return text("unknown site", 404);
    const f = await formBody(req);
    const result = await newebpayDecode(f, t.newebpay.hash_key, t.newebpay.hash_iv);
    if (!result) return text("bad signature", 400);
    if (result.Status === "SUCCESS" && result.Result) {
      await enqueue(
        env,
        store,
        { kind: "payment", site: t.site, gateway: "newebpay", trade_no: result.Result.MerchantOrderNo, amount: Number(result.Result.Amt), gateway_txn: result.Result.TradeNo, raw: result },
        `pay:${t.site}:newebpay:${result.Result.MerchantOrderNo}`,
      );
    }
    return text("OK");
  }

  // Meeting bot finished.
  if (parts[0] === "vexa" && req.method === "POST") {
    const t = await tenantFor(parts[1]);
    if (!t?.vexa || !safeEqual(parts[2] ?? "", t.vexa.webhook_token)) return text("forbidden", 403);
    const body = (await req.json()) as Record<string, any>;
    const m = body.meeting ?? body;
    const status = String(m.status ?? body.event ?? "");
    if (!/completed|ended|finished/i.test(status) || !m.platform || !m.native_meeting_id) return json({ ignored: status });
    await enqueue(env, store, { kind: "meeting_done", site: t.site, platform: m.platform, meeting_id: m.native_meeting_id }, `meeting-done:${t.site}:${m.platform}:${m.native_meeting_id}:${m.id ?? ""}`);
    return json({ ok: true });
  }

  // Admin (also put Cloudflare Access in front of /admin).
  if (parts[0] === "admin") {
    if (!bearer(req, env)) return text("forbidden", 403);
    if (parts[1] === "tenants" && parts[2] && req.method === "PUT") {
      const t = (await req.json()) as Tenant;
      if (t.site !== parts[2] || !t.erpnext_url || !t.erpnext_key || !t.erpnext_secret || !t.erpnext_webhook_secret || !t.unsubscribe_secret) return text("missing fields", 400);
      await store.putTenant(t);
      return json({ ok: true, site: t.site });
    }
    if (parts[1] === "tenants" && !parts[2] && req.method === "GET") return json({ sites: await store.listSites() });
    if (parts[1] === "tenants" && parts[3] === "dead-letters" && req.method === "GET") return json({ dead_letters: await store.listDeadLetters(parts[2]) });
    if (parts[1] === "tenants" && parts[3] === "unsubscribe-link" && req.method === "GET") {
      const t = await tenantFor(parts[2]);
      const email = (url.searchParams.get("email") ?? "").toLowerCase();
      if (!t || !email) return text("not found", 404);
      return json({ url: `${url.origin}/unsubscribe/${encodeURIComponent(t.site)}?email=${encodeURIComponent(email)}&sig=${await unsubscribeSignature(t.unsubscribe_secret, email)}` });
    }
    if (parts[1] === "tenants" && parts[3] === "meetings" && !parts[4] && req.method === "GET") {
      const t = await tenantFor(parts[2]);
      if (!t) return text("not found", 404);
      const hours = Math.min(Math.max(Number(url.searchParams.get("hours") ?? 24), 1), 24 * 14);
      const now = new Date();
      const { events, failed } = await upcoming(t, app.fetcher, new Date(now.getTime() - 2 * 60000), new Date(now.getTime() + hours * 3600000));
      const meetings = [];
      for (const ev of events) {
        const key = meetingKey(t.site, ev);
        meetings.push({
          key,
          title: ev.summary,
          start: ev.start.toISOString(),
          platform: ev.link!.platform,
          url: ev.link!.url,
          attendees: ev.attendees,
          skipped: await store.isClaimed(`skip:${key}`),
          sent: await store.isClaimed(key),
        });
      }
      return json({ bot: Boolean(t.vexa), calendars: t.calendars?.length ?? 0, failed_calendars: failed, meetings });
    }
    if (parts[1] === "tenants" && parts[3] === "meetings" && parts[4] === "skip" && req.method === "POST") {
      const body = (await req.json()) as { key?: string; skip?: boolean };
      if (!body.key?.startsWith(`meeting:${parts[2]}:`)) return text("bad key", 400);
      if (body.skip === false) await store.release(`skip:${body.key}`);
      else await store.claim(`skip:${body.key}`);
      return json({ ok: true, key: body.key, skipped: body.skip !== false });
    }
    if (parts[1] === "dead-letters" && parts[3] === "replay" && req.method === "POST") {
      const row = await store.takeDeadLetter(Number(parts[2]));
      if (!row) return text("not found", 404);
      await env.JOBS.send(JSON.parse(row.body) as Job);
      return json({ ok: true, replayed: row.id });
    }
  }

  return text("not found", 404);
}

export async function consume(batch: MessageBatch<Job>, env: Env, app: App = defaultApp) {
  const d = deps(env, app);
  for (const msg of batch.messages) {
    try {
      await runJob(msg.body, d);
      msg.ack();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (!isRetryable(e) || msg.attempts >= MAX_ATTEMPTS) {
        await d.store.addDeadLetter(msg.body.site, msg.body.kind, JSON.stringify(msg.body), error);
        await onGiveUp(msg.body, error, d);
        msg.ack();
      } else {
        msg.retry({ delaySeconds: 30 * 2 ** (msg.attempts - 1) });
      }
    }
  }
}

/** Messages that crashed the consumer outright land here via the queue's own DLQ. */
export async function consumeDeadLetters(batch: MessageBatch<Job>, env: Env, app: App = defaultApp) {
  const store = app.store(env);
  for (const msg of batch.messages) {
    await store.addDeadLetter(msg.body.site ?? "unknown", msg.body.kind ?? "unknown", JSON.stringify(msg.body), "consumer crashed");
    msg.ack();
  }
}

export const meetingKey = (site: string, ev: CalendarEvent) => `meeting:${site}:${ev.link!.platform}:${ev.link!.id}:${ev.start.toISOString()}`;

/** Meetings with a Meet/Zoom/Teams link in the tenant's calendars, soonest first. */
async function upcoming(t: Tenant, fetcher: typeof fetch, from: Date, to: Date) {
  const events: CalendarEvent[] = [];
  let failed = 0;
  for (const ics of t.calendars ?? []) {
    try {
      const res = await fetcher(ics);
      if (!res.ok) throw new PermanentError(`calendar ${res.status}`);
      events.push(...eventsInWindow(await res.text(), from, to).filter((ev) => ev.link));
    } catch {
      failed++;
    }
  }
  return { events: events.sort((a, b) => a.start.getTime() - b.start.getTime()), failed };
}

/** Every 5 minutes: send the bot to meetings starting in the next 10 minutes. */
export async function scheduleMeetings(env: Env, app: App = defaultApp, now = new Date()) {
  const store = app.store(env);
  const from = new Date(now.getTime() - 2 * 60000);
  const to = new Date(now.getTime() + 10 * 60000);
  let queued = 0;
  for (const site of await store.listSites()) {
    const t = await store.getTenant(site);
    if (!t?.vexa || !t.calendars?.length) continue;
    for (const ics of t.calendars) {
      let body: string;
      try {
        const res = await app.fetcher(ics);
        if (!res.ok) throw new PermanentError(`calendar ${res.status}`);
        body = await res.text();
      } catch (e) {
        await store.addDeadLetter(site, "calendar", JSON.stringify({ ics: ics.replace(/\/\/[^/]+/, "//…") }), (e as Error).message);
        continue;
      }
      for (const ev of eventsInWindow(body, from, to)) {
        if (!ev.link) continue;
        const key = meetingKey(site, ev);
        if (await store.isClaimed(`skip:${key}`)) continue;
        const queuedNow = await enqueue(
          env,
          store,
          { kind: "meeting_start", site, link: ev.link, title: ev.summary, attendees: ev.attendees, start: ev.start.toISOString() },
          key,
        );
        if (queuedNow) queued++;
      }
    }
  }
  return queued;
}
