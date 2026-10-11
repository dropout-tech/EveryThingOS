import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { fleetMode, liveConfig, writeBlocked } from "./sources/config";
import { deskUrl, erpPost, SourceError } from "./sources/erpnext";

export type ActionResult = { ok: boolean; message?: string; created?: { doctype: string; name: string; href?: string }; href?: string; [key: string]: unknown };

/**
 * Write routes only accept same-origin JSON. With API-key mode there is no
 * session cookie to protect, so the Origin check is what stops another site
 * from posting through the integration user.
 */
export function sameOrigin(request: NextRequest, { json = true } = {}) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.SHELL_URL && !fleetMode()) allowed.add(new URL(process.env.SHELL_URL).origin);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) allowed.add(`${request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")}://${host}`);
  return allowed.has(origin) && (!json || (request.headers.get("content-type") ?? "").includes("application/json"));
}

export async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function reply(result: ActionResult, status = 200) {
  return NextResponse.json(result, { status });
}

export function refuse(message: string, status = 400) {
  return reply({ ok: false, message }, status);
}

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };

/**
 * Runs one ERPNext write as the current user and turns desk paths into full links.
 * `always` is for actions that must keep working when the contract has lapsed,
 * such as removing a person who left the company.
 */
export async function erpAction(request: NextRequest, method: string, args: Record<string, unknown>, { always = false } = {}) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const config = await liveConfig();
  if (!config.erpnext) return refuse("ERPNext 還沒接上，現在是練習模式", 409);
  const blocked = always ? null : writeBlocked(config);
  if (blocked) return refuse(blocked, 423);
  try {
    const result = await erpPost<ActionResult>(method, args, config);
    if (result.created?.href) result.created.href = deskUrl(result.created.href, config);
    if (typeof result.href === "string") result.href = deskUrl(result.href, config);
    return reply(result);
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }
}
