import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, unseal, type Session } from "@/lib/session";
import { liveConfig } from "@/lib/sources/config";

export async function POST(request: NextRequest) {
  const config = liveConfig();
  const erp = config.erpnext;
  const session = config.sessionSecret ? await unseal<Session>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret) : null;
  if (erp && session) {
    await fetch(`${erp.url}/api/method/frappe.integrations.oauth2.revoke_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(erp.site ? { "X-Frappe-Site-Name": erp.site } : {}) },
      body: new URLSearchParams({ token: session.accessToken }),
    }).catch(() => undefined);
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
