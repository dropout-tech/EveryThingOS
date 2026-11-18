import "server-only";
import { headers } from "next/headers";
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
  // The second fixed tenant exists only for the explicitly enabled local browser test.
  const host = (await headers()).get("host")?.split(":")[0];
  const localTest = ["127.0.0.1", "localhost"].includes(host ?? "") && process.env.NODE_ENV === "development" && process.env.LOCAL_E2E_LOGIN === "1" &&
    secret === "local-e2e-only-session-secret" && companyId === "local";
  const session = await readSession(secret ?? undefined, localTest ? undefined : companyId);
  const sessionCompany = localTest && session?.site === "local-e2e-b" ? session.site : companyId;
  if (!session?.accountId) return { status: "anonymous" };
  try {
    const account = await accountForSession(await accountsDb(), session.accountId, sessionCompany);
    if (!account) return { status: "error", kind: "login", message: "請重新登入" };
    return { status: "ok", account };
  } catch (error) {
    return { status: "error", kind: "unreachable", message: error instanceof Error ? error.message : "帳號庫讀不到" };
  }
}
