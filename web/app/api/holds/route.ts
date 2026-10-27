import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { coverHold, decodeHolds, encodeHolds, HOLD_COOKIE } from "@/lib/holds";

/** 主管確認某筆預約的老師後，這堂課就不再出現在待排。 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("請從人事頁送出", 403);
  const body = await readJson<{ id?: unknown; teacher?: unknown }>(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const teacher = typeof body?.teacher === "string" ? body.teacher.trim().slice(0, 40) : "";
  if (!id || !teacher) return refuse("缺了哪一堂、或是哪位老師");
  const holds = coverHold(decodeHolds(request.cookies.get(HOLD_COOKIE)?.value), id, teacher);
  const res = reply({ ok: true, message: `已記下這堂課由 ${teacher} 上` });
  res.cookies.set(HOLD_COOKIE, encodeHolds(holds), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 3600,
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
}
