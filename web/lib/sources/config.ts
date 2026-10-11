import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { parseShop, type ShopProfile } from "../shop";

export type Stage = "trial" | "active" | "due_soon" | "past_due" | "read_only" | "suspended" | "cancelled";

export type Lifecycle = { stage: Stage; days: number | null; ends: string | null; writable: boolean; bots: boolean; message: string };

/** The company this request belongs to, when one deployment serves many companies. */
export type Tenancy = { site: string; company: string; host: string; lifecycle: Lifecycle; profile: ShopProfile | null };

/**
 * Which systems this request is connected to. Each one switches from demo to
 * live on its own, so a company can go live with ERPNext first and add Chatwoot
 * or the glue later.
 *
 * Two ways to configure it (see web/README.md):
 * - one company per deployment: ERPNEXT_URL and friends as Worker vars/secrets;
 * - one deployment for every company: GLUE_URL + SHELL_TOKEN, and the company is
 *   looked up from the request's host name in the glue's directory.
 */
export type LiveConfig = {
  erpnext?: {
    url: string;
    site?: string;
    apiKey?: string;
    apiSecret?: string;
    oauth?: { clientId: string; clientSecret?: string };
  };
  glue?: { url: string; adminToken: string; site: string };
  chatwoot?: { url: string; platformToken?: string; accountId?: string };
  sessionSecret?: string;
  tenant?: Tenancy;
  /** Fleet mode, but this host is not registered to any company. */
  unknownHost?: string;
  /** Fleet mode, and the company directory could not be reached. */
  directoryError?: string;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function fleetMode() {
  return Boolean(env("GLUE_URL") && env("SHELL_TOKEN"));
}

function envConfig(): LiveConfig {
  const erpUrl = env("ERPNEXT_URL");
  const glueUrl = env("GLUE_URL");
  const chatUrl = env("CHATWOOT_URL");
  const clientId = env("ERPNEXT_OAUTH_CLIENT_ID");
  return {
    erpnext: erpUrl
      ? {
          url: trimSlash(erpUrl),
          site: env("ERPNEXT_SITE"),
          apiKey: env("ERPNEXT_API_KEY"),
          apiSecret: env("ERPNEXT_API_SECRET"),
          oauth: clientId ? { clientId, clientSecret: env("ERPNEXT_OAUTH_CLIENT_SECRET") } : undefined,
        }
      : undefined,
    glue:
      glueUrl && env("GLUE_ADMIN_TOKEN")
        ? { url: trimSlash(glueUrl), adminToken: env("GLUE_ADMIN_TOKEN")!, site: env("GLUE_SITE") ?? env("ERPNEXT_SITE") ?? "" }
        : undefined,
    chatwoot: chatUrl
      ? { url: trimSlash(chatUrl), platformToken: env("CHATWOOT_PLATFORM_TOKEN"), accountId: env("CHATWOOT_ACCOUNT_ID") }
      : undefined,
    sessionSecret: env("SESSION_SECRET"),
  };
}

type Directory = {
  site: string;
  company: string;
  profile: unknown;
  lifecycle: Lifecycle;
  erpnext: { url: string; site: string; oauth: { client_id: string; client_secret: string | null } | null };
  chatwoot: { url: string; account_id: number | null } | null;
};

const HIT_MS = 60_000;
const MISS_MS = 10_000;
const directory = new Map<string, { at: number; entry: Directory | null }>();

async function lookup(host: string): Promise<Directory | null> {
  const cached = directory.get(host);
  if (cached && Date.now() - cached.at < (cached.entry ? HIT_MS : MISS_MS)) return cached.entry;
  const res = await fetch(`${trimSlash(env("GLUE_URL")!)}/shell/tenant?host=${encodeURIComponent(host)}`, {
    headers: { authorization: `Bearer ${env("SHELL_TOKEN")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 404) {
    directory.set(host, { at: Date.now(), entry: null });
    return null;
  }
  if (!res.ok) throw new Error(`公司目錄回應 ${res.status}`);
  const entry = (await res.json()) as Directory;
  directory.set(host, { at: Date.now(), entry });
  return entry;
}

export async function requestHost() {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

async function fleetConfig(): Promise<LiveConfig> {
  const host = await requestHost();
  let d: Directory | null;
  try {
    d = host ? await lookup(host) : null;
  } catch (error) {
    return { directoryError: error instanceof Error ? error.message : String(error), sessionSecret: env("SESSION_SECRET") };
  }
  if (!d) return { unknownHost: host || "（沒有網址）", sessionSecret: env("SESSION_SECRET") };
  return {
    // Fleet mode never uses a shared integration key: every person logs in with their own ERPNext user.
    erpnext: { url: trimSlash(d.erpnext.url), site: d.erpnext.site, oauth: d.erpnext.oauth ? { clientId: d.erpnext.oauth.client_id, clientSecret: d.erpnext.oauth.client_secret ?? undefined } : undefined },
    glue: { url: trimSlash(env("GLUE_URL")!), adminToken: env("SHELL_TOKEN")!, site: d.site },
    chatwoot: d.chatwoot ? { url: trimSlash(d.chatwoot.url), platformToken: env("CHATWOOT_PLATFORM_TOKEN"), accountId: d.chatwoot.account_id ? String(d.chatwoot.account_id) : undefined } : undefined,
    sessionSecret: env("SESSION_SECRET"),
    tenant: { site: d.site, company: d.company, host, lifecycle: d.lifecycle, profile: parseShop(d.profile ? JSON.stringify(d.profile) : null) },
  };
}

export const liveConfig = cache(async (): Promise<LiveConfig> => (fleetMode() ? fleetConfig() : envConfig()));

/** Login is required as soon as ERPNext OAuth is configured. */
export function loginRequired(config: LiveConfig) {
  return Boolean(config.erpnext?.oauth && config.sessionSecret);
}

/** Why this company may not create or change anything right now, or null. */
export function writeBlocked(config: LiveConfig) {
  const life = config.tenant?.lifecycle;
  return life && !life.writable ? life.message : null;
}
