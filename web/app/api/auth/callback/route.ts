import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_COOKIE, SESSION_COOKIE, cookieOptions, seal, unseal, type PendingLogin, type Session } from "@/lib/session";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { exchangeToken } from "@/lib/sources/erpnext";
import { redirectUri } from "@/lib/auth";

function fail(request: NextRequest, reason: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(LOGIN_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const config = await liveConfig();
  if (!loginRequired(config)) return NextResponse.redirect(new URL("/workspace", request.url));
  const params = request.nextUrl.searchParams;
  const pending = await unseal<PendingLogin>(request.cookies.get(LOGIN_COOKIE)?.value, config.sessionSecret!);
  if (!pending || !params.get("state") || params.get("state") !== pending.state) return fail(request, "state");
  const code = params.get("code");
  if (!code) return fail(request, params.get("error") ?? "denied");

  const erp = config.erpnext!;
  let token;
  try {
    token = await exchangeToken(erp, { grant_type: "authorization_code", code, redirect_uri: redirectUri(request), code_verifier: pending.verifier });
  } catch {
    return fail(request, "token");
  }
  const profileRes = await fetch(`${erp.url}/api/method/frappe.integrations.oauth2.openid_profile`, {
    headers: { Authorization: `Bearer ${token.access_token}`, ...(erp.site ? { "X-Frappe-Site-Name": erp.site } : {}) },
    cache: "no-store",
  });
  if (!profileRes.ok) return fail(request, "profile");
  const profile = (await profileRes.json()) as { sub?: string; email?: string; name?: string };

  const session: Session = {
    user: profile.email ?? profile.sub ?? "",
    site: config.tenant?.site,
    name: profile.name,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
  const response = NextResponse.redirect(new URL(pending.next, request.url));
  response.cookies.delete(LOGIN_COOKIE);
  response.cookies.set(SESSION_COOKIE, await seal(session, config.sessionSecret!), cookieOptions());
  return response;
}
