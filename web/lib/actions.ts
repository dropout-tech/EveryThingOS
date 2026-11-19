import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { fleetMode } from "./sources/config";

export type ActionResult = {
  ok: boolean;
  message?: string;
  created?: {
    doctype: string;
    name: string;
    href?: string;
    grand_total?: number;
    untaxed?: number;
    tax?: number;
    balance?: number;
    received?: number;
    invoice_status?: string;
  };
  href?: string;
  [key: string]: unknown;
};

/**
 * Write routes only accept same-origin JSON.
 */
export function sameOrigin(request: NextRequest, { json = true } = {}) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.SHELL_URL && !fleetMode()) allowed.add(new URL(process.env.SHELL_URL).origin);
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

export async function erpAction(request: NextRequest, _method: string, _args: Record<string, unknown>, _options: { always?: boolean } = {}) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  return refuse("這項功能目前是本機示範", 409);
}
