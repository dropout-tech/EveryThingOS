import "server-only";
import type { NextRequest } from "next/server";
import { refuse, sameOrigin } from "./actions";
import type { Integrations } from "./integrations";

type Access = { ok: false; status: number; message: string };
export async function integrationAccess(): Promise<Access> {
  return { ok: false, status: 409, message: "系統同步還沒接上，現在是示範" };
}
export type IntegrationsSource = { origin: "demo" } | { origin: "denied"; message: string } | { origin: "error"; message: string } | { origin: "live"; data: Integrations };
export async function loadIntegrations(): Promise<IntegrationsSource> { return { origin: "demo" }; }
export async function integrationAction<T extends Record<string, unknown>>(request: NextRequest, _build: (body: T) => { path: string; body?: unknown } | string) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  return refuse("系統同步還沒接上，現在是示範", 409);
}
