import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { delivery_note?: string; qty?: number };

export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const qty = Number(body?.qty);
  if (!body?.delivery_note?.trim()) return refuse("請指定出貨單");
  if (!Number.isFinite(qty) || qty <= 0) return refuse("退貨數量要大於 0");
  return erpAction(request, "dropout_core.returns.return_against_delivery", { delivery_note: body.delivery_note.trim(), qty });
}
