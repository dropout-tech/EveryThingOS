import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { liveConfig } from "@/lib/sources/config";
import { erpPost, SourceError } from "@/lib/sources/erpnext";

const BASE = "frappe.desk.doctype.notification_log.notification_log";
const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };

/**
 * Marks the person's own ERPNext notifications read. Frappe only touches rows
 * whose `for_user` is the session user. Allowed while read-only: it changes no business data.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const body = await readJson<{ name?: unknown; all?: unknown }>(request);
  const all = body?.all === true;
  if (!all && (typeof body?.name !== "string" || !body.name || body.name.length > 140)) return refuse("缺少通知");
  const config = await liveConfig();
  if (!config.erpnext) return refuse("ERPNext 還沒接上，現在是示範", 409);
  try {
    await erpPost(all ? `${BASE}.mark_all_as_read` : `${BASE}.mark_as_read`, all ? {} : { docname: body!.name }, config);
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    return refuse("沒有標好，請再試一次", 500);
  }
}
