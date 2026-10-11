import "server-only";
import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "./actions";
import type { DeliveryRow, Integrations } from "./integrations";
import { fleetMode, liveConfig, loginRequired, type LiveConfig } from "./sources/config";
import { liveMe } from "./sources/live";

type Access = { ok: true; glue: NonNullable<LiveConfig["glue"]>; actor: string } | { ok: false; status: number; message: string };

/**
 * Keys and webhooks open the company's data to other systems, so only a System
 * Manager (老闆) of the company this host belongs to may see or change them.
 */
export async function integrationAccess(): Promise<Access> {
  const config = await liveConfig();
  if (!config.glue) return { ok: false, status: 409, message: "系統同步還沒接上，現在是示範" };
  let actor = "殼";
  if (fleetMode() || loginRequired(config)) {
    try {
      const me = await liveMe();
      if (!me.roles.includes("System Manager")) return { ok: false, status: 403, message: "只有老闆可以管 API 金鑰和 Webhook" };
      actor = me.user;
    } catch {
      return { ok: false, status: 401, message: "請先登入" };
    }
  }
  return { ok: true, glue: config.glue, actor };
}

function glueFetch(access: Extract<Access, { ok: true }>, path: string, init: RequestInit = {}) {
  return fetch(`${access.glue.url}/admin/tenants/${encodeURIComponent(access.glue.site)}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access.glue.adminToken}`, "content-type": "application/json", "x-actor": access.actor },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

async function glueJson<T>(access: Extract<Access, { ok: true }>, path: string): Promise<T> {
  const res = await glueFetch(access, path);
  if (!res.ok) throw new Error(`系統同步回應 ${res.status}`);
  return (await res.json()) as T;
}

export type IntegrationsSource = { origin: "demo" } | { origin: "denied"; message: string } | { origin: "error"; message: string } | { origin: "live"; data: Integrations };

export async function loadIntegrations(): Promise<IntegrationsSource> {
  const access = await integrationAccess();
  if (!access.ok) return access.status === 409 ? { origin: "demo" } : { origin: "denied", message: access.message };
  try {
    const [keys, hooks] = await Promise.all([
      glueJson<{ keys: Integrations["keys"]; max: number }>(access, "api-keys"),
      glueJson<{ webhooks: Integrations["webhooks"]; max: number; events: string[] }>(access, "webhooks"),
    ]);
    const deliveries: Record<string, DeliveryRow[]> = {};
    await Promise.all(
      hooks.webhooks.map(async (h) => {
        deliveries[h.id] = (await glueJson<{ deliveries: DeliveryRow[] }>(access, `webhooks/${encodeURIComponent(h.id)}/deliveries`)).deliveries.slice(0, 10);
      }),
    );
    return {
      origin: "live",
      data: { apiBase: `${access.glue.url}/v1`, keys: keys.keys, maxKeys: keys.max, webhooks: hooks.webhooks, maxWebhooks: hooks.max, events: hooks.events, deliveries },
    };
  } catch (error) {
    return { origin: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** One write from the settings page, forwarded to the glue for this company only. */
export async function integrationAction<T extends Record<string, unknown>>(request: NextRequest, build: (body: T) => { path: string; body?: unknown } | string) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const access = await integrationAccess();
  if (!access.ok) return refuse(access.message, access.status);
  const body = (await readJson<T>(request)) ?? ({} as T);
  const target = build(body);
  if (typeof target === "string") return refuse(target);
  let res: Response;
  try {
    res = await glueFetch(access, target.path, { method: "POST", body: JSON.stringify(target.body ?? {}) });
  } catch {
    return refuse("連不到系統同步，請稍後再試", 502);
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return refuse(typeof out.error === "string" ? out.error : `系統同步回應 ${res.status}`, res.status >= 500 ? 502 : res.status);
  return reply({ ...out, ok: out.ok !== false, message: typeof out.error === "string" ? out.error : undefined });
}
