import { NextResponse, type NextRequest } from "next/server";
import { accountsDb } from "@/lib/accounts/d1";
import { googleConfig, googleProfile } from "@/lib/accounts/google";
import { acceptGoogle, companyKey, sessionSeconds } from "@/lib/accounts/service";
import { resolveSessionSecret } from "@/lib/accounts/secret";
import { here, publicOrigin, redirectUri } from "@/lib/auth";
import { LOGIN_COOKIE, SESSION_COOKIE, cookieOptions, seal, unseal, type PendingLogin, type Session } from "@/lib/session";
import { liveConfig } from "@/lib/sources/config";

function fail(request: NextRequest, reason: string) {
  const url = here("/login", request);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(LOGIN_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const google = googleConfig();
  const secret = resolveSessionSecret();
  if (!google || !secret) return fail(request, google ? "secret" : "google");
  const params = request.nextUrl.searchParams;
  const pending = await unseal<PendingLogin & { companyId?: string }>(request.cookies.get(LOGIN_COOKIE)?.value, secret);
  if (!pending || !params.get("state") || params.get("state") !== pending.state) return fail(request, "state");
  const code = params.get("code");
  if (!code) return fail(request, params.get("error") ?? "denied");

  const profile = await googleProfile({
    code,
    verifier: pending.verifier,
    redirectUri: redirectUri(request),
    clientId: google.clientId,
    clientSecret: google.clientSecret,
  });
  if (!profile.ok) return fail(request, profile.error);

  const config = await liveConfig();
  const companyId = pending.companyId ?? companyKey(config.tenant?.site);
  const db = await accountsDb();
  const accepted = await acceptGoogle(db, { companyId, profile: profile.profile });
  if (!accepted.ok) return fail(request, accepted.code ?? "denied");

  const maxAge = await sessionSeconds(db, companyId);
  const session: Session = {
    accountId: accepted.account.id,
    user: accepted.account.email,
    name: accepted.account.name,
    role: accepted.account.role,
    site: companyId,
    expiresAt: Date.now() + maxAge * 1000,
  };
  const response = NextResponse.redirect(here(pending.next, request));
  response.cookies.delete(LOGIN_COOKIE);
  response.cookies.set(SESSION_COOKIE, await seal(session, secret), cookieOptions(maxAge, publicOrigin(request)));
  return response;
}
