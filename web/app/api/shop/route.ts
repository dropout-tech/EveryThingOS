import { NextRequest, NextResponse } from "next/server";
import { getIndustry } from "@/lib/industries";
import { INDUSTRY_COOKIE } from "@/lib/workspace";
import {
  SHOP_COOKIE,
  parseShop,
  seedPackForScene,
} from "@/lib/shop";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { scene?: string; size?: string; modules?: string[]; industry?: string; name?: string; customModules?: boolean; nameLocked?: boolean };
  const shop = parseShop(JSON.stringify(body));
  if (!shop) {
    return NextResponse.json({ error: "請選現場、規模與功能" }, { status: 400 });
  }
  const before = parseShop(request.cookies.get(SHOP_COOKIE)?.value);
  const seed = body.industry ? getIndustry(body.industry) : seedPackForScene(shop.scene);
  const packed = {
    ...shop,
    ...(before?.brand ? { brand: before.brand } : {}),
    name: before?.nameLocked ? before.name : seed.nameZh,
    customModules: true,
    ...(before?.nameLocked ? { nameLocked: true } : {}),
  };
  const response = NextResponse.json({ ok: true, shop: packed });
  const cookie = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  response.cookies.set(SHOP_COOKIE, JSON.stringify(packed), cookie);
  response.cookies.set(INDUSTRY_COOKIE, seed.id, cookie);
  return response;
}
