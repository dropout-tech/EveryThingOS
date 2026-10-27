import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { MOVEMENT_LABELS, type MovementKind } from "@/lib/course-bom";

/** Records WMS material consumption (上課領用耗用), wastage/scrap (教學損耗／報廢), or cross-store transfer (跨店調撥). */
export async function POST(request: NextRequest) {
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return refuse("沒有收到庫存異動資料");
  const kind = typeof body.kind === "string" && Object.hasOwn(MOVEMENT_LABELS, body.kind) ? (body.kind as MovementKind) : null;
  if (!kind || kind === "lock") return refuse("異動種類只能是上課耗用、教學損耗或跨店調撥");
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  if (!sku) return refuse("要選教材或材料品項");
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10000) return refuse("數量要大於 0");
  const fromBranch = typeof body.fromBranch === "string" ? body.fromBranch.trim() : "";
  if (!fromBranch) return refuse("要選來源分店／倉庫");
  const toBranch = typeof body.toBranch === "string" ? body.toBranch.trim() : "";
  if (kind === "transfer" && (!toBranch || toBranch === fromBranch)) {
    return refuse("跨店調撥要選不同的調入分店／倉庫");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  return erpAction(request, "dropout_core.actions.record_stock_movement", {
    kind,
    item_code: sku,
    qty,
    from_warehouse: fromBranch,
    ...(toBranch ? { to_warehouse: toBranch } : {}),
    ...(reason ? { reason } : {}),
  });
}
