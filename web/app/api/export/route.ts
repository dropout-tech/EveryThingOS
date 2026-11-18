import type { NextRequest } from "next/server";
import { ADMIN_ROLE } from "@/lib/access";
import { liveConfig } from "@/lib/sources/config";
import { getMe } from "@/lib/sources";

const EXPORTS: Record<string, { doctype: string; label: string }> = {
  customers: { doctype: "Customer", label: "客戶" },
  items: { doctype: "Item", label: "商品" },
  invoices: { doctype: "Sales Invoice", label: "銷項發票" },
};

/** ERPNext is not the signed-in person, and the shared integration key is not used. */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  if (!Object.hasOwn(EXPORTS, kind)) return new Response("找不到這種匯出", { status: 404 });
  const config = await liveConfig();
  if (!config.erpnext) return new Response("ERPNext 還沒接上", { status: 503 });
  const me = await getMe();
  if (me.origin !== "live" || !me.data?.roles.includes(ADMIN_ROLE)) return new Response("請先用平台的老闆帳號登入", { status: 403 });
  return new Response("不再使用共用整合帳號從 ERPNext 下載", { status: 403 });
}
