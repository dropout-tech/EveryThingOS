import { NextRequest, NextResponse } from "next/server";
import { parseScene, SCENE_COOKIE } from "@/lib/scene";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { scene?: string };
  const scene = parseScene(body.scene);
  const response = NextResponse.json({ scene });
  response.cookies.set(SCENE_COOKIE, scene, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
