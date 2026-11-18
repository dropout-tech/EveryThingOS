import type { NextRequest } from "next/server";
import { readActor } from "@/lib/accounts/guard";
import { accountsDb } from "@/lib/accounts/d1";
import { setAccountEnabled } from "@/lib/accounts/service";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const actor = await readActor();
  if (actor.status === "anonymous") return refuse("請先用 Google 登入", 401);
  if (actor.status === "error") return refuse(actor.message, actor.kind === "login" ? 401 : 503);
  const body = await readJson<{ user?: string; enabled?: boolean }>(request);
  if (typeof body?.enabled !== "boolean") return refuse("缺少人或狀態");
  const result = await setAccountEnabled(await accountsDb(), { actorId: actor.account.id, email: body.user, enabled: body.enabled });
  if (!result.ok) return refuse(result.message, result.status);
  return reply({ ok: true, message: result.message });
}
