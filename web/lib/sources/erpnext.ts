import "server-only";
import { erpIdentityRefusal } from "../erp-identity";
import { liveConfig, type LiveConfig } from "./config";

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

async function authHeader(config: LiveConfig): Promise<string> {
  throw new SourceError(erpIdentityRefusal(config.erpnext), "login");
}

async function call<T>(method: string, args: Record<string, unknown>, config: LiveConfig, post: boolean): Promise<T> {
  return ((await (await request(method, args, config, post)).json()) as { message: T }).message;
}

async function request(method: string, args: Record<string, unknown>, config: LiveConfig, post: boolean, timeout?: number): Promise<Response> {
  const erp = config.erpnext;
  if (!erp) throw new SourceError("ERPNext 還沒接上", "unreachable");
  const query = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  let res: Response;
  try {
    res = await fetch(`${erp.url}/api/method/${method}${!post && query.size ? `?${query}` : ""}`, {
      method: post ? "POST" : "GET",
      headers: {
        Authorization: await authHeader(config),
        Accept: "application/json",
        ...(post ? { "Content-Type": "application/json" } : {}),
        ...hostHeader(erp),
      },
      body: post ? JSON.stringify(args) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout ?? (post ? 30_000 : 15_000)),
    });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(`連不到 ERPNext（${erp.url}）`, "unreachable");
  }
  if (res.status === 401) throw new SourceError("登入已過期，請重新登入", "login");
  if (res.status === 403) throw new SourceError("你的 ERPNext 角色不能做這件事", "denied");
  if (!res.ok) throw new SourceError(await upstreamMessage(res), "upstream");
  return res;
}

/** Frappe puts the user-facing reason in `_server_messages`; show that instead of a status code. */
async function upstreamMessage(res: Response) {
  try {
    const body = (await res.json()) as { _server_messages?: string; exception?: string };
    if (body._server_messages) {
      const first = JSON.parse(JSON.parse(body._server_messages)[0]) as { message?: string };
      if (first.message) return first.message.replace(/<[^>]+>/g, "");
    }
    if (body.exception) return body.exception.split(":").slice(1).join(":").trim() || `ERPNext 回應 ${res.status}`;
  } catch {
    /* not JSON */
  }
  return `ERPNext 回應 ${res.status}`;
}

/** Calls a whitelisted method. Identity is not ERPNext, and a missing OAuth client does not use the shared integration key. */
export async function erpMethod<T>(method: string, args: Record<string, unknown> = {}, config?: LiveConfig): Promise<T> {
  return call<T>(method, args, config ?? (await liveConfig()), false);
}

/** Same as `erpMethod`, for methods that change data (`@frappe.whitelist(methods=["POST"])`). */
export async function erpPost<T>(method: string, args: Record<string, unknown> = {}, config?: LiveConfig): Promise<T> {
  return call<T>(method, args, config ?? (await liveConfig()), true);
}

/** For methods that answer with a file (`frappe.response.type = "binary"`), such as `frappe.desk.reportview.export_query`. */
export async function erpFile(method: string, args: Record<string, unknown>, config?: LiveConfig): Promise<Response> {
  return request(method, args, config ?? (await liveConfig()), true, 120_000);
}

export function deskUrl(path: string | undefined, config: LiveConfig) {
  if (!path || !config.erpnext) return undefined;
  return `${config.erpnext.url}${path}`;
}
