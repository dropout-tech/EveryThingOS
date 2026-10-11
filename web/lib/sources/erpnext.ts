import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, cookieOptions, readSession, seal, type Session } from "../session";
import { liveConfig, loginRequired, type LiveConfig } from "./config";

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: "login" | "denied" | "unreachable" | "upstream",
  ) {
    super(message);
  }
}

type Erp = NonNullable<LiveConfig["erpnext"]>;

function hostHeader(erp: Erp): Record<string, string> {
  return erp.site ? { "X-Frappe-Site-Name": erp.site } : {};
}

export async function exchangeToken(erp: Erp, body: Record<string, string>) {
  const res = await fetch(`${erp.url}/api/method/frappe.integrations.oauth2.get_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...hostHeader(erp) },
    body: new URLSearchParams({ client_id: erp.oauth!.clientId, ...(erp.oauth!.clientSecret ? { client_secret: erp.oauth!.clientSecret } : {}), ...body }),
    cache: "no-store",
  });
  if (!res.ok) throw new SourceError(`ERPNext 登入失敗（${res.status}）`, "login");
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
}

async function authHeader(config: LiveConfig): Promise<string> {
  const erp = config.erpnext!;
  if (loginRequired(config)) {
    let session = await readSession(config.sessionSecret);
    if (!session) throw new SourceError("請先用 ERPNext 帳號登入", "login");
    if (session.expiresAt - 60_000 < Date.now()) session = await refresh(config, session);
    return `Bearer ${session.accessToken}`;
  }
  if (erp.apiKey && erp.apiSecret) return `token ${erp.apiKey}:${erp.apiSecret}`;
  throw new SourceError("ERPNext 沒有設定登入方式：ERPNEXT_OAUTH_CLIENT_ID 或 ERPNEXT_API_KEY", "login");
}

async function refresh(config: LiveConfig, session: Session): Promise<Session> {
  if (!session.refreshToken) throw new SourceError("登入已過期，請重新登入", "login");
  const token = await exchangeToken(config.erpnext!, { grant_type: "refresh_token", refresh_token: session.refreshToken });
  const next: Session = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
  try {
    (await cookies()).set(SESSION_COOKIE, await seal(next, config.sessionSecret!), cookieOptions());
  } catch {
    /* Server Components cannot set cookies; the refreshed token is still used for this request. */
  }
  return next;
}

/** Calls a whitelisted method as the logged-in ERPNext user (or the integration user when no login is set up). */
export async function erpMethod<T>(method: string, args: Record<string, unknown> = {}, config = liveConfig()): Promise<T> {
  const erp = config.erpnext;
  if (!erp) throw new SourceError("ERPNext 還沒接上", "unreachable");
  const query = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  let res: Response;
  try {
    res = await fetch(`${erp.url}/api/method/${method}${query.size ? `?${query}` : ""}`, {
      headers: { Authorization: await authHeader(config), Accept: "application/json", ...hostHeader(erp) },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(`連不到 ERPNext（${erp.url}）`, "unreachable");
  }
  if (res.status === 401) throw new SourceError("登入已過期，請重新登入", "login");
  if (res.status === 403) throw new SourceError("你的 ERPNext 角色看不到這裡", "denied");
  if (!res.ok) throw new SourceError(`ERPNext 回應 ${res.status}`, "upstream");
  return ((await res.json()) as { message: T }).message;
}

export function deskUrl(path: string | undefined, config = liveConfig()) {
  if (!path || !config.erpnext) return undefined;
  return `${config.erpnext.url}${path}`;
}
