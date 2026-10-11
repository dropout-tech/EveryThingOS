import { NextRequest, NextResponse } from "next/server";
import { parseStyle, STYLE_COOKIE } from "@/lib/style";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;

export async function POST(request: NextRequest) {
  const body = ((await request.json().catch(() => null)) ?? {}) as { theme?: unknown; style?: unknown };
  const out: { theme?: string; style?: string } = {};
  if (typeof body.theme === "string") out.theme = parseTheme(body.theme);
  if (typeof body.style === "string") out.style = parseStyle(body.style);
  if (!out.theme && !out.style) return NextResponse.json({ error: "沒有要改的外觀" }, { status: 400 });
  const response = NextResponse.json(out);
  if (out.theme) response.cookies.set(THEME_COOKIE, out.theme, COOKIE);
  if (out.style) response.cookies.set(STYLE_COOKIE, out.style, COOKIE);
  return response;
}
