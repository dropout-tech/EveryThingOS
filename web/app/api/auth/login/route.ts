import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_COOKIE, cookieOptions, pkceChallenge, randomToken, seal } from "@/lib/session";
import { redirectUri, safeNext } from "@/lib/auth";
import { liveConfig, loginRequired } from "@/lib/sources/config";

export async function GET(request: NextRequest) {
  const config = await liveConfig();
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!loginRequired(config)) return NextResponse.redirect(new URL(next, request.url));
  const erp = config.erpnext!;
  const state = randomToken(16);
  const verifier = randomToken(48);
  const authorize = new URL(`${erp.url}/api/method/frappe.integrations.oauth2.authorize`);
  authorize.search = new URLSearchParams({
    client_id: erp.oauth!.clientId,
    response_type: "code",
    scope: "all openid",
    redirect_uri: redirectUri(request),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(authorize);
  response.cookies.set(LOGIN_COOKIE, await seal({ state, verifier, next }, config.sessionSecret!), cookieOptions(600));
  return response;
}
