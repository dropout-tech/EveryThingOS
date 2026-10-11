import { taiwanDate, type Account } from "./accounts";
import type { App, Env } from "./app";
import { errorText, log } from "./log";
import { escapeHtml } from "./mail";
import { D1MonitorStore, type Availability, type CheckState, type Incident, type MonitorStore, type Target } from "./monitor-store";
import type { Tenant } from "./store";

export const PROBE_TIMEOUT_MS = 8_000;
/** Stop starting new probes after this long; sites not reached go first next run. */
export const RUN_BUDGET_MS = 90_000;
/** Workers keep at most six outbound connections open per invocation. */
export const CONCURRENCY = 5;
/** Consecutive failed probes before a target counts as down (one blip is not an incident). */
export const DOWN_AFTER = 2;
/** A check older than this no longer says anything about now. */
export const FRESH_MS = 30 * 60_000;
export const KEEP_DAYS = 400;
const DAY = 86_400_000;
const MAX_ALERT_LINES = 30;

export const TARGET_LABEL: Record<Target, string> = { erpnext: "ERPNext", shell: "殼" };

export type Probe = { ok: boolean; status: number | null; ms: number; error: string | null };

export type Change = { site: string; company: string; target: Target; change: "down" | "up"; error: string | null; since: string; at: string };

export const monitorStore = (env: Env, app: App): MonitorStore => app.monitor?.(env) ?? new D1MonitorStore(env.DB);

async function probe(fetcher: typeof fetch, url: string, headers: Record<string, string>, accept: (body: any) => boolean): Promise<Probe> {
  const started = Date.now();
  try {
    const res = await fetcher(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const text = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, ms, error: `HTTP ${res.status}` };
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON: wrong page, login wall or proxy error */
    }
    return accept(body) ? { ok: true, status: res.status, ms, error: null } : { ok: false, status: res.status, ms, error: "回應不是預期的內容" };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const error = name === "TimeoutError" || name === "AbortError" ? `逾時（${PROBE_TIMEOUT_MS / 1000} 秒）` : `連不上：${errorText(e).slice(0, 160)}`;
    return { ok: false, status: null, ms: Date.now() - started, error };
  }
}

/** Frappe's guest `ping`; the site header lets a multi-site bench behind a tunnel route it. */
export function probeErpnext(t: Tenant, fetcher: typeof fetch) {
  if (!/^https?:\/\//.test(t.erpnext_url)) return Promise.resolve<Probe>({ ok: false, status: null, ms: 0, error: "ERPNext 網址不對" });
  return probe(fetcher, `${t.erpnext_url.replace(/\/+$/, "")}/api/method/ping`, { "X-Frappe-Site-Name": t.site }, (b) => b?.message === "pong");
}

export function probeShell(host: string, fetcher: typeof fetch) {
  return probe(fetcher, `https://${host}/api/health`, {}, (b) => b?.ok === true);
}

/** Next state after one probe. Down needs DOWN_AFTER failures in a row; one success brings it back. */
export function transition(prev: CheckState | undefined, site: string, target: Target, p: Probe, at: string) {
  const base: CheckState = prev ?? { site, target, up: true, failures: 0, first_failed_at: null, last_status: null, last_ms: null, last_error: null, checked_at: at, changed_at: at };
  const seen = { last_status: p.status, last_ms: p.ms, checked_at: at };
  if (p.ok) {
    const change = base.up ? null : ("up" as const);
    const next: CheckState = { ...base, ...seen, up: true, failures: 0, first_failed_at: null, last_error: null, changed_at: change ? at : base.changed_at };
    return { next, change, since: base.first_failed_at ?? base.changed_at };
  }
  const failures = base.failures + 1;
  const firstFailed = base.first_failed_at ?? at;
  const change = base.up && failures >= DOWN_AFTER ? ("down" as const) : null;
  const next: CheckState = { ...base, ...seen, up: base.up && !change, failures, first_failed_at: firstFailed, last_error: p.error, changed_at: change ? at : base.changed_at };
  return { next, change, since: firstFailed };
}

const clock = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");
const minutes = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

export function alertText(changes: Change[]) {
  const down = changes.filter((c) => c.change === "down");
  const up = changes.filter((c) => c.change === "up");
  const subject = `[DropOut OS 監看] ${[down.length ? `${down.length} 個連不上` : "", up.length ? `${up.length} 個恢復` : ""].filter(Boolean).join("、")}`;
  const lines = [
    ...down.map((c) => `連不上：${c.company}（${c.site}）${TARGET_LABEL[c.target]}，${clock(c.since)} 起；${c.error ?? ""}`),
    ...up.map((c) => `恢復：${c.company}（${c.site}）${TARGET_LABEL[c.target]}，停了約 ${minutes(c.since, c.at)} 分鐘`),
  ];
  const shown = lines.slice(0, MAX_ALERT_LINES);
  if (lines.length > shown.length) shown.push(`…還有 ${lines.length - shown.length} 個，看營運後台`);
  // Discord caps a message at 2000 characters.
  return { subject, text: [subject, ...shown].join("\n").slice(0, 1900) };
}

/** Slack, Discord and Google Chat each want their own field name; anything else gets every common one. */
export function webhookBody(url: string, text: string, changes: Change[]) {
  const host = new URL(url).hostname;
  if (host === "hooks.slack.com" || host === "chat.googleapis.com") return { text };
  if (/(^|\.)discord(app)?\.com$/.test(host)) return { content: text };
  return { text, content: text, message: text, events: changes };
}

export async function sendAlert(env: Env, fetcher: typeof fetch, changes: Change[]) {
  const { subject, text } = alertText(changes);
  const sent: string[] = [];
  const hook = env.ALERT_WEBHOOK_URL;
  if (hook && !/^https:\/\//.test(hook)) log("warn", "alert.webhook_not_https");
  else if (hook) {
    try {
      const res = await fetcher(hook, {
        method: "POST",
        headers: { "content-type": "application/json", ...(env.ALERT_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.ALERT_WEBHOOK_TOKEN}` } : {}) },
        body: JSON.stringify(webhookBody(hook, text, changes)),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) sent.push("webhook");
      else log("warn", "alert.webhook_failed", { status: res.status });
    } catch (e) {
      log("warn", "alert.webhook_failed", { error: errorText(e) });
    }
  }
  if (env.EMAIL && env.PLATFORM_NOTIFY && env.PLATFORM_MAIL_FROM) {
    try {
      await env.EMAIL.send({ from: env.PLATFORM_MAIL_FROM, to: env.PLATFORM_NOTIFY, subject, text, html: `<pre>${escapeHtml(text)}</pre>` });
      sent.push("email");
    } catch (e) {
      log("warn", "alert.email_failed", { error: errorText(e) });
    }
  }
  if (!sent.length) log("warn", "alert.not_sent", { subject });
  return sent;
}

/**
 * Every 5 minutes: probe each company that is not cancelled (its ERPNext site
 * and its first shell host), open or close incidents, and tell ops once per
 * run about whatever changed.
 */
export async function uptime(env: Env, app: App, now = new Date(), budgetMs = RUN_BUDGET_MS) {
  const store = app.store(env);
  const ms = monitorStore(env, app);
  const at = now.toISOString();
  const day = taiwanDate(now);
  const deadline = Date.now() + budgetMs;
  const [accounts, checks] = await Promise.all([store.listAccounts(), ms.listChecks()]);
  const state = new Map(checks.map((c) => [`${c.site}|${c.target}`, c]));
  const lastChecked = new Map<string, string>();
  for (const c of checks) if (!lastChecked.has(c.site) || c.checked_at < lastChecked.get(c.site)!) lastChecked.set(c.site, c.checked_at);

  for (const a of accounts) if (a.state === "cancelled" && lastChecked.has(a.site)) await ms.forget(a.site, at);
  const queue = accounts.filter((a) => a.state !== "cancelled").sort((x, y) => (lastChecked.get(x.site) ?? "").localeCompare(lastChecked.get(y.site) ?? ""));

  const changes: Change[] = [];
  let probed = 0;
  let started = 0;

  const one = async (a: Account) => {
    const t = await store.getTenant(a.site);
    const targets: [Target, () => Promise<Probe>][] = [];
    if (t) targets.push(["erpnext", () => probeErpnext(t, app.fetcher)]);
    if (a.hosts[0]) targets.push(["shell", () => probeShell(a.hosts[0], app.fetcher)]);
    for (const [target, run] of targets) {
      const p = await run();
      probed++;
      const { next, change, since } = transition(state.get(`${a.site}|${target}`), a.site, target, p, at);
      await ms.recordProbe(next, day, !p.ok);
      if (!change) continue;
      if (change === "down") {
        await ms.openIncident(a.site, target, since, p.error);
        await store.addAccountEvent(a.site, "監看", "連不上", `${TARGET_LABEL[target]}：${p.error ?? ""}`);
      } else {
        await ms.resolveIncidents(a.site, target, at);
        await store.addAccountEvent(a.site, "監看", "恢復", `${TARGET_LABEL[target]} 停了約 ${minutes(since, at)} 分鐘`);
      }
      changes.push({ site: a.site, company: a.company, target, change, error: p.error, since, at });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (started < queue.length && Date.now() < deadline) {
        const a = queue[started++];
        try {
          await one(a);
        } catch (e) {
          log("error", "monitor.site_failed", { site: a.site, error: errorText(e) });
        }
      }
    }),
  );

  const skipped = queue.length - started;
  if (skipped) log("warn", "monitor.budget_exhausted", { skipped, probed });
  const alerted = changes.length ? await sendAlert(env, app.fetcher, changes) : [];
  const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY);
  await ms.prune(taiwanDate(cutoff), cutoff.toISOString());
  return { probed, skipped, down: changes.filter((c) => c.change === "down").length, up: changes.filter((c) => c.change === "up").length, alerted };
}

export type Level = "up" | "degraded" | "down" | "unknown";

function level(rows: CheckState[]): Level {
  if (!rows.length) return "unknown";
  const down = rows.filter((r) => !r.up).length;
  return down === 0 ? "up" : down === rows.length ? "down" : "degraded";
}

function worst(levels: Level[]): Level {
  for (const l of ["down", "degraded", "up"] as const) if (levels.includes(l)) return l;
  return "unknown";
}

const percent = (a: Availability[], target: Target) => {
  const row = a.find((r) => r.target === target);
  return row && row.checks ? Math.floor((1 - row.failures / row.checks) * 10_000) / 100 : null;
};

/** Incidents of one kind that start within 15 minutes of each other are one outage to the public. */
function publicIncidents(incidents: Incident[]) {
  const out: { target: Target; started_at: string; resolved_at: string | null }[] = [];
  for (const i of [...incidents].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    let group: (typeof out)[number] | undefined;
    for (let k = out.length - 1; k >= 0 && !group; k--) {
      if (out[k].target === i.target && Date.parse(i.started_at) - Date.parse(out[k].started_at) <= 15 * 60_000) group = out[k];
    }
    if (!group) out.push({ target: i.target, started_at: i.started_at, resolved_at: i.resolved_at });
    else group.resolved_at = !group.resolved_at || !i.resolved_at ? null : group.resolved_at > i.resolved_at ? group.resolved_at : i.resolved_at;
  }
  return out.reverse().slice(0, 20);
}

/**
 * What the public status page may show: levels, availability and incident
 * times for the whole fleet, never which company. `site` (shell or admin
 * callers only) adds that one company's own view.
 */
export async function publicStatus(ms: MonitorStore, now = new Date(), site?: string | null) {
  const at = now.toISOString();
  const all = await ms.listChecks();
  const fresh = all.filter((c) => Date.parse(c.checked_at) >= now.getTime() - FRESH_MS);
  const since = new Date(now.getTime() - 14 * DAY).toISOString();
  const monthAgo = taiwanDate(new Date(now.getTime() - 30 * DAY));
  const [incidents, availability] = await Promise.all([ms.listIncidents(since), ms.availability(monthAgo)]);
  const latest = fresh.reduce<string | null>((m, c) => (!m || c.checked_at > m ? c.checked_at : m), null);
  const components = {
    // Checks exist but none are recent: the cron has stopped.
    glue: (all.length && !fresh.length ? "degraded" : "up") as Level,
    erpnext: level(fresh.filter((c) => c.target === "erpnext")),
    shell: level(fresh.filter((c) => c.target === "shell")),
  };
  const body: Record<string, unknown> = {
    status: worst(Object.values(components)),
    generated_at: at,
    checked_at: latest,
    components,
    availability_30d: { erpnext: percent(availability, "erpnext"), shell: percent(availability, "shell") },
    incidents: publicIncidents(incidents),
  };
  if (site) {
    const mine = fresh.filter((c) => c.site === site);
    const [siteIncidents, siteAvailability] = await Promise.all([ms.listIncidents(since, site), ms.availability(monthAgo, site)]);
    body.site = {
      components: { erpnext: level(mine.filter((c) => c.target === "erpnext")), shell: level(mine.filter((c) => c.target === "shell")) },
      availability_30d: { erpnext: percent(siteAvailability, "erpnext"), shell: percent(siteAvailability, "shell") },
      incidents: siteIncidents.slice(0, 20).map((i) => ({ target: i.target, started_at: i.started_at, resolved_at: i.resolved_at })),
    };
  }
  return body;
}

const noStore = { "cache-control": "no-store" };

export async function healthResponse(env: Env, app: App) {
  const started = Date.now();
  let ok = false;
  try {
    ok = await monitorStore(env, app).ping();
  } catch (e) {
    log("error", "health.d1_failed", { error: errorText(e) });
  }
  const version = env.CF_VERSION_METADATA?.id ?? "dev";
  return Response.json({ ok, checks: { d1: { ok, ms: Date.now() - started } }, version }, { status: ok ? 200 : 503, headers: noStore });
}

export async function statusResponse(env: Env, app: App, site: string | null, now = new Date()) {
  try {
    const body = await publicStatus(monitorStore(env, app), now, site);
    return Response.json(body, { headers: { "cache-control": site ? "private, no-store" : "public, max-age=60" } });
  } catch (e) {
    log("error", "status.failed", { error: errorText(e) });
    const components = { glue: "degraded", erpnext: "unknown", shell: "unknown" };
    return Response.json({ status: "degraded", generated_at: now.toISOString(), checked_at: null, components, availability_30d: {}, incidents: [] }, { status: 503, headers: noStore });
  }
}
