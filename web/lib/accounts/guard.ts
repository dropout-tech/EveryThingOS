import "server-only";
import { accountsDb } from "./d1";
import { resolveSessionSecret } from "./secret";
import { accountForSession, companyKey, type PublicAccount } from "./service";
import { readSession } from "../session";
import { liveConfig } from "../sources/config";

export type Actor =
  | { status: "anonymous" }
  | { status: "ok"; account: PublicAccount }
  | { status: "error"; kind: "login" | "unreachable"; message: string };

export async function readActor(): Promise<Actor> {
  const config = await liveConfig();
  const companyId = companyKey(config.tenant?.site);
  const secret = resolveSessionSecret();
  const session = await readSession(secret ?? undefined, companyId);
  if (!session?.accountId) return { status: "anonymous" };
  try {
    const account = await accountForSession(await accountsDb(), session.accountId, companyId);
    if (!account) return { status: "error", kind: "login", message: "請重新登入" };
    return { status: "ok", account };
  } catch (error) {
    return { status: "error", kind: "unreachable", message: error instanceof Error ? error.message : "帳號庫讀不到" };
  }
}
