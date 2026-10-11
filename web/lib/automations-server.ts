import "server-only";
import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "./actions";
import { ADMIN_ROLE } from "./access";
import { fromGlue, hitFromGlue, isRuleId, validateParams, type Automations, type Hit } from "./automations";
import { fleetMode, liveConfig, loginRequired, writeBlocked, type LiveConfig } from "./sources/config";
import { liveMe } from "./sources/live";

/** Same list as `FEATURE_ROLES.automations` in lib/access.ts, plus the owner. */
export const AUTOMATION_ROLES = [ADMIN_ROLE, "Sales Manager", "Accounts Manager"];

type Access = { ok: true; glue: NonNullable<LiveConfig["glue"]>; actor: string; config: LiveConfig } | { ok: false; status: number; message: string };

/** Rules send mail and assign work to people, so only 老闆, 業務主管 or 會計主管 may see or change them. */
export async function automationAccess(): Promise<Access> {
  const config = await liveConfig();
  if (!config.glue) return { ok: false, status: 409, message: "系統同步還沒接上，現在是示範" };
  let actor = "殼";
  if (fleetMode() || loginRequired(config)) {
    try {
      const me = await liveMe();
      if (!AUTOMATION_ROLES.some((r) => me.roles.includes(r))) return { ok: false, status: 403, message: "只有老闆、業務主管或會計主管可以管自動化" };
      actor = me.user;
    } catch {
      return { ok: false, status: 401, message: "請先登入" };
    }
  }
  return { ok: true, glue: config.glue, actor, config };
}

function glueFetch(access: Extract<Access, { ok: true }>, path: string, init: RequestInit = {}) {
  return fetch(`${access.glue.url}/admin/tenants/${encodeURIComponent(access.glue.site)}/automations${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access.glue.adminToken}`, "content-type": "application/json", "x-actor": access.actor },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
}

export type AutomationsSource = { origin: "demo" } | { origin: "denied"; message: string } | { origin: "error"; message: string } | { origin: "live"; data: Automations; readOnly: string | null };

export async function loadAutomations(): Promise<AutomationsSource> {
  const access = await automationAccess();
  if (!access.ok) return access.status === 409 ? { origin: "demo" } : { origin: "denied", message: access.message };
  try {
    const res = await glueFetch(access, "");
    if (!res.ok) throw new Error(`系統同步回應 ${res.status}`);
    return { origin: "live", data: fromGlue(await res.json()), readOnly: writeBlocked(access.config) };
  } catch (error) {
    return { origin: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function forward(access: Extract<Access, { ok: true }>, path: string, method: string, body: unknown) {
  let res: Response;
  try {
    res = await glueFetch(access, path, { method, body: JSON.stringify(body) });
  } catch {
    return { res: null, out: { error: "連不到系統同步，請稍後再試" } as Record<string, unknown> };
  }
  return { res, out: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Turn a rule on or off, or change its numbers. */
export async function updateRule(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const access = await automationAccess();
  if (!access.ok) return refuse(access.message, access.status);
  const blocked = writeBlocked(access.config);
  if (blocked) return refuse(blocked, 423);
  const body = await readJson<{ rule?: unknown; enabled?: unknown; params?: unknown }>(request);
  if (!body || !isRuleId(body.rule)) return refuse("沒有這條規則");
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return refuse("只能開或關");
  const checked = validateParams(body.rule, body.params, { enabling: body.enabled === true });
  if ("error" in checked) return refuse(checked.error);
  const { res, out } = await forward(access, `/${body.rule}`, "PUT", { enabled: body.enabled, params: checked.params });
  if (!res?.ok) return refuse(typeof out.error === "string" ? out.error : `系統同步回應 ${res?.status ?? 502}`, !res || res.status >= 500 ? 502 : res.status);
  return reply({ ok: true, message: body.enabled === false ? "已關掉，之後不會再自動做" : body.enabled ? "已打開，下一輪就會開始跑" : "已存好新的設定" });
}

/** What the rule would do today with these numbers. Reads ERPNext, changes nothing. */
export async function dryRun(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const access = await automationAccess();
  if (!access.ok) return refuse(access.message, access.status);
  const body = await readJson<{ rule?: unknown; params?: unknown }>(request);
  if (!body || !isRuleId(body.rule)) return refuse("沒有這條規則");
  const checked = validateParams(body.rule, body.params);
  if ("error" in checked) return refuse(checked.error);
  const { res, out } = await forward(access, `/${body.rule}/dry-run`, "POST", { params: checked.params });
  if (!res?.ok) return refuse(typeof out.error === "string" ? out.error : `系統同步回應 ${res?.status ?? 502}`, !res || res.status >= 500 ? 502 : res.status);
  const hits: Hit[] = Array.isArray(out.hits) ? (out.hits as Parameters<typeof hitFromGlue>[0][]).map(hitFromGlue) : [];
  return reply({ ok: true, hits });
}

/** The last day's runs for the bell, for people who may see automations; null when they may not. */
export async function recentRuns(glue: NonNullable<LiveConfig["glue"]>, roles: string[] | null, now = Date.now()) {
  if (roles && !AUTOMATION_ROLES.some((r) => roles.includes(r))) return null;
  const res = await fetch(`${glue.url}/admin/tenants/${encodeURIComponent(glue.site)}/automations`, { headers: { authorization: `Bearer ${glue.adminToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`系統同步回應 ${res.status}`);
  return fromGlue(await res.json()).runs.filter((r) => now - Date.parse(r.finishedAt ?? r.createdAt) < 86_400_000 && r.status !== "queued").slice(0, 10);
}

/** Rules and recent runs, for the board to refresh without a page load. */
export async function listAutomations() {
  const source = await loadAutomations();
  if (source.origin === "live") return reply({ ok: true, ...source.data });
  if (source.origin === "demo") return refuse("系統同步還沒接上，現在是示範", 409);
  return refuse(source.message, source.origin === "denied" ? 403 : 502);
}
