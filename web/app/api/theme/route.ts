import { NextRequest, NextResponse } from "next/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { theme?: string };
  const theme = parseTheme(body.theme);
  const response = NextResponse.json({ theme });
  response.cookies.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
