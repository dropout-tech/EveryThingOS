import type { NextRequest } from "next/server";
import { readActor } from "@/lib/accounts/guard";
import { accountsDb } from "@/lib/accounts/d1";
import { inviteAccount } from "@/lib/accounts/service";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const actor = await readActor();
  if (actor.status === "anonymous") return refuse("請先用 Google 登入", 401);
  if (actor.status === "error") return refuse(actor.message, actor.kind === "login" ? 401 : 503);
  const body = await readJson<{ email?: string; full_name?: string; profile?: string }>(request);
  const result = await inviteAccount(await accountsDb(), {
    actorId: actor.account.id,
    email: body?.email,
    name: body?.full_name,
    profile: body?.profile,
  });
  if (!result.ok) return refuse(result.message, result.status);
  return reply({
    ok: true,
    delivery: result.delivery,
    message: `已建立 ${result.account.email}。邀請信還沒寄出。請對方用這個 Google 信箱登入。`,
  });
}
