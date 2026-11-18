import type { NextRequest } from "next/server";
import { readActor } from "@/lib/accounts/guard";
import { accountsDb } from "@/lib/accounts/d1";
import { setAccountProfile } from "@/lib/accounts/service";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const actor = await readActor();
  if (actor.status === "anonymous") return refuse("請先用 Google 登入", 401);
  if (actor.status === "error") return refuse(actor.message, actor.kind === "login" ? 401 : 503);
  const body = await readJson<{ user?: string; profile?: string }>(request);
  const result = await setAccountProfile(await accountsDb(), { actorId: actor.account.id, email: body?.user, profile: body?.profile });
  if (!result.ok) return refuse(result.message, result.status);
  return reply({ ok: true, message: result.message });
}
