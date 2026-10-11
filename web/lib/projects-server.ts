import "server-only";
import type { NextRequest } from "next/server";
import { refuse, reply, sameOrigin, type ActionResult } from "./actions";
import { liveConfig, writeBlocked, type LiveConfig } from "./sources/config";
import { SourceError, erpPost } from "./sources/erpnext";

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };

/** Same guards as `erpAction`, for writes that go through Frappe's REST client methods instead of a dropout_core action. */
export async function restWrite(request: NextRequest, run: (config: LiveConfig, post: typeof erpPost) => Promise<ActionResult>) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const config = await liveConfig();
  if (!config.erpnext) return refuse("ERPNext 還沒接上，現在是練習模式", 409);
  const blocked = writeBlocked(config);
  if (blocked) return refuse(blocked, 423);
  try {
    return reply(await run(config, erpPost));
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }
}

/** ERPNext document names we accept from the browser: plain text, no control characters or markup. */
export function docName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 140 && !/[\u0000-\u001f<>]/.test(name) ? name : null;
}
