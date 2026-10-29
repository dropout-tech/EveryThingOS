import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { sales_order?: string; amount?: number };

export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const amount = Number(body?.amount);
  if (!body?.sales_order?.trim()) return refuse("請指定訂單");
  if (!Number.isFinite(amount) || amount <= 0) return refuse("訂金要大於 0");
  return erpAction(request, "dropout_core.deposit.record_deposit", { sales_order: body.sales_order.trim(), amount });
}
