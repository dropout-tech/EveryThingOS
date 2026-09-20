import { NextRequest, NextResponse } from "next/server";
import { getIndustry } from "@/lib/industries";
import { INDUSTRY_COOKIE } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id?: string };
  const pack = getIndustry(body.id);
  const response = NextResponse.json({ id: pack.id });
  response.cookies.set(INDUSTRY_COOKIE, pack.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
