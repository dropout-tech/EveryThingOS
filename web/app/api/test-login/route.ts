import { NextRequest, NextResponse } from "next/server";
import { accountsDb } from "@/lib/accounts/d1";
import { acceptGoogle } from "@/lib/accounts/service";
import { seal, SESSION_COOKIE } from "@/lib/session";

/** Explicitly enabled only for the local development browser test. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_E2E_LOGIN !== "1" ||
      !["127.0.0.1", "localhost"].includes(request.nextUrl.hostname)) return new NextResponse(null, { status: 404 });
  const secret = process.env.SESSION_SECRET;
  if (secret !== "local-e2e-only-session-secret") return new NextResponse(null, { status: 404 });
  const result = await acceptGoogle(await accountsDb(), { companyId: "local", profile: { sub: "local-e2e", email: "e2e@example.invalid", emailVerified: true, name: "本機測試" } });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  const value = await seal({ accountId: result.account.id, user: result.account.email, site: "local", role: result.account.role, expiresAt: Date.now() + 3600000 }, secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
