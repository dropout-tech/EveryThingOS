import { NextRequest, NextResponse } from "next/server";
import { INDUSTRY_COOKIE } from "@/lib/workspace";
import {
  SHOP_COOKIE,
  parseShop,
  seedPackForScene,
} from "@/lib/shop";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { scene?: string; size?: string; modules?: string[] };
  const shop = parseShop(JSON.stringify(body));
  if (!shop) {
    return NextResponse.json({ error: "請選現場、規模與功能" }, { status: 400 });
  }
  const before = parseShop(request.cookies.get(SHOP_COOKIE)?.value);
  const packed = { ...shop, ...(before?.brand ? { brand: before.brand } : {}), ...(before?.name ? { name: before.name } : {}) };
  const seed = seedPackForScene(packed.scene);
  const response = NextResponse.json({ ok: true, shop: packed });
  const cookie = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  response.cookies.set(SHOP_COOKIE, JSON.stringify(packed), cookie);
  response.cookies.set(INDUSTRY_COOKIE, seed.id, cookie);
  return response;
}
