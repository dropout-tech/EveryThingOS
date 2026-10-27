import { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { cleanShopName, parseBrand } from "@/lib/brand";
import { SHOP_COOKIE, parseShop } from "@/lib/shop";
import { liveConfig } from "@/lib/sources/config";

/** Changes only the look and display name; scene, size and modules stay as they are. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  if ((await liveConfig()).tenant?.profile) return refuse("這個帳號的外觀由導入顧問設定，請聯絡顧問調整", 409);
  const shop = parseShop(request.cookies.get(SHOP_COOKIE)?.value);
  if (!shop) return refuse("請先選現場與功能", 409);
  const body = await readJson<{ brand?: string; name?: string }>(request);
  if (!body) return refuse("格式不對");
  const next = { ...shop, brand: parseBrand(body.brand) };
  const name = cleanShopName(body.name);
  if (name) next.name = name;
  else delete next.name;
  const response = reply({ ok: true, message: "外觀已更新", shop: next });
  response.cookies.set(SHOP_COOKIE, JSON.stringify(next), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}
