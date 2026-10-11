import "server-only";
import { fleetMode, liveConfig } from "./sources/config";

export type Level = "up" | "degraded" | "down" | "unknown";
export type StatusTarget = "erpnext" | "shell";
export type StatusIncident = { target: StatusTarget; started_at: string; resolved_at: string | null };

/** Same shape as the glue's public `GET /status`: no company names, hosts or error text. */
export type PlatformStatus = {
  status: Level;
  generated_at: string;
  checked_at: string | null;
  components: { glue: Level; erpnext: Level; shell: Level };
  availability_30d: { erpnext?: number | null; shell?: number | null };
  incidents: StatusIncident[];
  site?: { components: { erpnext: Level; shell: Level }; availability_30d: { erpnext?: number | null; shell?: number | null }; incidents: StatusIncident[] };
};

export type StatusView = { origin: "demo" | "live" | "error"; data: PlatformStatus; message?: string };

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

const LEVELS: Level[] = ["up", "degraded", "down", "unknown"];
const asLevel = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : "unknown");

function demo(now = Date.now()): PlatformStatus {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
  return {
    status: "up",
    generated_at: at(0),
    checked_at: at(0.05),
    components: { glue: "up", erpnext: "up", shell: "up" },
    availability_30d: { erpnext: 99.93, shell: 100 },
    incidents: [{ target: "erpnext", started_at: at(77), resolved_at: at(76.6) }],
  };
}

/** The glue can only be partly trusted to be well-formed; keep exactly the fields the page shows. */
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function clean(body: Record<string, unknown>): PlatformStatus {
  const incidents = (list: unknown): StatusIncident[] =>
    (Array.isArray(list) ? list : []).slice(0, 20).map((raw) => {
      const i = obj(raw);
      return { target: i.target === "shell" ? "shell" : "erpnext", started_at: String(i.started_at ?? ""), resolved_at: i.resolved_at ? String(i.resolved_at) : null };
    });
  const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const availability = (v: unknown) => ({ erpnext: pct(obj(v).erpnext), shell: pct(obj(v).shell) });
  const c = obj(body.components);
  const site = body.site ? obj(body.site) : null;
  return {
    status: asLevel(body.status),
    generated_at: String(body.generated_at ?? new Date().toISOString()),
    checked_at: body.checked_at ? String(body.checked_at) : null,
    components: { glue: asLevel(c.glue), erpnext: asLevel(c.erpnext), shell: asLevel(c.shell) },
    availability_30d: availability(body.availability_30d),
    incidents: incidents(body.incidents),
    ...(site
      ? {
          site: {
            components: { erpnext: asLevel(obj(site.components).erpnext), shell: asLevel(obj(site.components).shell) },
            availability_30d: availability(site.availability_30d),
            incidents: incidents(site.incidents),
          },
        }
      : {}),
  };
}

/**
 * Platform status for the public page. Without GLUE_URL it is labelled demo
 * data. On a company's own host (multi-company mode) it also asks the glue for
 * that company's checks, using the shell's token.
 */
export async function platformStatus(): Promise<StatusView> {
  const glue = env("GLUE_URL");
  if (!glue) return { origin: "demo", data: demo() };
  const site = fleetMode() ? (await liveConfig()).tenant?.site : undefined;
  try {
    const res = await fetch(`${glue.replace(/\/+$/, "")}/status${site ? `?site=${encodeURIComponent(site)}` : ""}`, {
      headers: site ? { authorization: `Bearer ${env("SHELL_TOKEN")}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body === "object" && body.components) return { origin: "live", data: clean(body) };
    throw new Error(`狀態服務回應 ${res.status}`);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      origin: "error",
      message: timedOut ? "狀態服務 6 秒內沒有回應" : "現在連不上狀態服務",
      data: {
        status: "degraded",
        generated_at: new Date().toISOString(),
        checked_at: null,
        components: { glue: "down", erpnext: "unknown", shell: "up" },
        availability_30d: {},
        incidents: [],
      },
    };
  }
}

/** Liveness of the glue for `/api/health`; null when this deployment has no glue. */
export async function glueReachable(): Promise<{ ok: boolean; status: number | null; ms: number } | null> {
  const glue = env("GLUE_URL");
  if (!glue) return null;
  const started = Date.now();
  try {
    const res = await fetch(`${glue.replace(/\/+$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return { ok: res.ok && body?.ok === true, status: res.status, ms: Date.now() - started };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started };
  }
}
