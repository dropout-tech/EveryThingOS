import type { NextRequest } from "next/server";
import { readActor } from "@/lib/accounts/guard";
import { accountsDb } from "@/lib/accounts/d1";
import { updateSessionExpiry } from "@/lib/accounts/service";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";

type Body = { two_factor?: boolean; two_factor_method?: string; password_policy?: boolean; session_expiry?: string; lockout_attempts?: number };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const actor = await readActor();
  if (actor.status === "anonymous") return refuse("請先用 Google 登入", 401);
  if (actor.status === "error") return refuse(actor.message, actor.kind === "login" ? 401 : 503);
  const body = (await readJson<Body>(request)) ?? {};
  if (body.password_policy !== undefined || body.lockout_attempts !== undefined) {
    return refuse("登入是 Google，平台不另設密碼規則。", 400);
  }
  const result = await updateSessionExpiry(await accountsDb(), {
    actorId: actor.account.id,
    session_expiry: body.session_expiry,
    two_factor: body.two_factor,
    two_factor_method: body.two_factor_method,
  });
  if (!result.ok) return refuse(result.message, result.status);
  return reply({ ok: true, message: result.message });
}
