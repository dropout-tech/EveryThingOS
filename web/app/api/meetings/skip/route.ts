import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { liveConfig, loginRequired, writeBlocked } from "@/lib/sources/config";
import { liveMe } from "@/lib/sources/live";

/** 這場不要記: tells the glue not to send the meeting bot to one meeting. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const config = await liveConfig();
  if (!config.glue) return refuse("會議紀錄還沒接上", 409);
  const blocked = writeBlocked(config);
  if (blocked) return refuse(blocked, 423);
  if (loginRequired(config)) {
    try {
      await liveMe();
    } catch {
      return refuse("請先登入", 401);
    }
  }
  const body = await readJson<{ key?: string; skip?: boolean }>(request);
  if (!body?.key) return refuse("缺少會議");
  const res = await fetch(`${config.glue.url}/admin/tenants/${encodeURIComponent(config.glue.site)}/meetings/skip`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.glue.adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ key: body.key, skip: body.skip !== false }),
    cache: "no-store",
  });
  if (!res.ok) return refuse(`會議紀錄系統回應 ${res.status}`, 502);
  return reply({ ok: true, skipped: body.skip !== false });
}
