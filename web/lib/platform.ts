import "server-only";
import { headers } from "next/headers";
import type { Lifecycle, Stage } from "./sources/config";

/**
 * The DropOut staff console. It is served only where GLUE_ADMIN_TOKEN and
 * PLATFORM_ADMINS are set (deploy it separately from the customer shell), and
 * the person is identified by a verified Cloudflare Access token, never by a
 * header anyone could send.
 */

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

const enc = new TextEncoder();

function b64urlBytes(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as T;
}

/** Team domain like `dropout.cloudflareaccess.com`, or a full origin (used by the local test certs server). */
function teamOrigin(team: string) {
  return team.includes("://") ? team.replace(/\/+$/, "") : `https://${team}`;
}

let certs: { at: number; origin: string; keys: (JsonWebKey & { kid?: string })[] } | null = null;

async function accessKeys(origin: string) {
  if (certs && certs.origin === origin && Date.now() - certs.at < 3_600_000) return certs.keys;
  const res = await fetch(`${origin}/cdn-cgi/access/certs`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  const body = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  certs = { at: Date.now(), origin, keys: body.keys };
  return body.keys;
}

export async function verifyAccessJwt(token: string, team: string, audience: string, now = Date.now()): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson<{ alg?: string; kid?: string }>(parts[0]);
    if (header.alg !== "RS256") return null;
    const origin = teamOrigin(team);
    const jwk = (await accessKeys(origin)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = b64urlJson<{ aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string }>(parts[1]);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience) || claims.iss !== origin) return null;
    if (!claims.exp || claims.exp * 1000 < now || (claims.nbf && claims.nbf * 1000 > now + 60_000)) return null;
    return claims.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function platformEnabled() {
  return Boolean(env("GLUE_URL") && env("GLUE_ADMIN_TOKEN") && env("PLATFORM_ADMINS") && env("CF_ACCESS_TEAM_DOMAIN") && env("CF_ACCESS_AUD"));
}

/** The signed-in DropOut staff member, or null. */
export async function platformOperator(): Promise<string | null> {
  if (!platformEnabled()) return null;
  const token = (await headers()).get("cf-access-jwt-assertion");
  if (!token) return null;
  const email = await verifyAccessJwt(token, env("CF_ACCESS_TEAM_DOMAIN")!, env("CF_ACCESS_AUD")!);
  const admins = env("PLATFORM_ADMINS")!.split(",").map((s) => s.trim().toLowerCase());
  return email && admins.includes(email) ? email : null;
}

export type PlatformAccount = {
  site: string;
  company: string;
  plan: string;
  state: "active" | "suspended" | "cancelled";
  state_reason?: string | null;
  trial_ends?: string | null;
  renews_on?: string | null;
  contact_email?: string | null;
  hosts: string[];
  usage?: Record<string, number | string> | null;
  usage_at?: string | null;
  created_at: string;
  lifecycle: Lifecycle;
};

export type AccountEvent = { id: number; at: string; actor: string; action: string; detail: string | null };

export const STAGE_LABEL: Record<Stage, string> = {
  trial: "試用",
  active: "使用中",
  due_soon: "快到期",
  past_due: "已到期（寬限中）",
  read_only: "只能看",
  suspended: "暫停",
  cancelled: "已解約",
};

/**
 * Calls the glue admin API as the signed-in operator. It checks the operator
 * itself because Next renders pages in parallel with their layout, so a
 * layout-level gate does not stop a page from fetching.
 */
export async function glueAdmin<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T | null; text: string; operator: string | null }> {
  const operator = await platformOperator();
  if (!operator) return { ok: false, status: 403, data: null, text: "只有 DropOut 營運人員可以看", operator };
  const res = await fetch(`${env("GLUE_URL")!.replace(/\/+$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${env("GLUE_ADMIN_TOKEN")}`, "content-type": "application/json", "x-actor": operator },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = JSON.parse(text) as T;
  } catch {
    /* plain-text error */
  }
  return { ok: res.ok, status: res.status, data, text, operator };
}
