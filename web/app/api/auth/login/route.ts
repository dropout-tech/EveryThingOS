import { NextResponse, type NextRequest } from "next/server";
import { accountsDb } from "@/lib/accounts/d1";
import { googleAuthorizeUrl, googleConfig } from "@/lib/accounts/google";
import { companyKey } from "@/lib/accounts/service";
import { resolveSessionSecret } from "@/lib/accounts/secret";
import { here, publicOrigin, redirectUri, safeNext } from "@/lib/auth";
import { LOGIN_COOKIE, cookieOptions, pkceChallenge, randomToken, seal } from "@/lib/session";
import { liveConfig } from "@/lib/sources/config";

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const back = (error: string) => {
    const url = here("/login", request);
    url.searchParams.set("error", error);
    if (next !== "/workspace") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };
  const google = googleConfig();
  if (!google) return back("google");
  const secret = resolveSessionSecret();
  if (!secret) return back("secret");
  const config = await liveConfig();
  const state = randomToken(16);
  const verifier = randomToken(48);
  const authorize = googleAuthorizeUrl({
    clientId: google.clientId,
    redirectUri: redirectUri(request),
    state,
    challenge: await pkceChallenge(verifier),
  });
  const response = NextResponse.redirect(authorize);
  response.cookies.set(
    LOGIN_COOKIE,
    await seal({ state, verifier, next, companyId: companyKey(config.tenant?.site) }, secret),
    cookieOptions(600, publicOrigin(request)),
  );
  return response;
}
