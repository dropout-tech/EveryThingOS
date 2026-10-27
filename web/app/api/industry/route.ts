import { NextRequest, NextResponse } from "next/server";
import { getIndustry } from "@/lib/industries";
import { SHOP_COOKIE, parseShop, shopFromPack } from "@/lib/shop";
import { INDUSTRY_COOKIE } from "@/lib/workspace";

const cookie = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

/** Locks this industry: its name, its scene, and the modules that scene actually uses. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id?: string };
  const pack = getIndustry(body.id);
  const before = parseShop(request.cookies.get(SHOP_COOKIE)?.value);
  const shop = shopFromPack(pack);
  if (before?.brand) shop.brand = before.brand;
  if (before?.name) shop.name = before.name;
  const response = NextResponse.json({ id: pack.id, scene: shop.scene });
  response.cookies.set(INDUSTRY_COOKIE, pack.id, cookie);
  response.cookies.set(SHOP_COOKIE, JSON.stringify(shop), cookie);
  return response;
}
