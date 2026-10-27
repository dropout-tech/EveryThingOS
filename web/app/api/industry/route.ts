import { NextRequest, NextResponse } from "next/server";
import { getIndustry } from "@/lib/industries";
import { HOLD_COOKIE } from "@/lib/holds";
import { clearLedgerHolds } from "@/lib/practice-ledger";
import { SHOP_COOKIE, parseShop, shopFromPack } from "@/lib/shop";
import { INDUSTRY_COOKIE } from "@/lib/workspace";

const cookie = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

/** Locks this industry: its name, its scene, and the modules that scene actually uses. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id?: string };
  const pack = getIndustry(body.id);
  const before = parseShop(request.cookies.get(SHOP_COOKIE)?.value);
  const previous = request.cookies.get(INDUSTRY_COOKIE)?.value;
  const shop = shopFromPack(pack, before);
  if (previous && previous !== pack.id) clearLedgerHolds(previous);
  const response = NextResponse.json({ id: pack.id, scene: shop.scene, name: shop.name });
  response.cookies.set(INDUSTRY_COOKIE, pack.id, cookie);
  response.cookies.set(SHOP_COOKIE, JSON.stringify(shop), cookie);
  response.cookies.set(HOLD_COOKIE, "[]", { ...cookie, maxAge: 0 });
  return response;
}
