import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { sales_order?: string; qty?: number };

export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const qty = Number(body?.qty);
  if (!body?.sales_order?.trim()) return refuse("請指定訂單");
  if (!Number.isFinite(qty) || qty <= 0) return refuse("數量要大於 0");
  return erpAction(request, "dropout_core.partial.deliver_partial", { sales_order: body.sales_order.trim(), qty });
}
