import { NextResponse, type NextRequest } from "next/server";
import { here } from "@/lib/auth";
import { LOGIN_COOKIE, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(here("/", request), 303);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(LOGIN_COOKIE);
  return response;
}
