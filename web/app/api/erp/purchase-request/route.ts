import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

/** One purchase request, with the item and quantity already filled in. */
export async function POST(request: NextRequest) {
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return refuse("沒有收到請購內容");
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  if (!sku) return refuse("要選品項");
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10000) return refuse("數量要大於 0");
  const warehouse = typeof body.warehouse === "string" ? body.warehouse.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 140) : "";
  return erpAction(request, "dropout_core.actions.request_purchase", {
    item_code: sku,
    qty,
    ...(warehouse ? { warehouse } : {}),
    ...(reason ? { reason } : {}),
  });
}
