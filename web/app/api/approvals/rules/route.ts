import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

const LIMITS = { purchase: [1, 100_000_000], quote: [1, 99] } as const;

/** Switches one DropOut approval workflow on or off. ERPNext lets only System Managers do it. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ rule?: unknown; enabled?: unknown; threshold?: unknown }>(request);
  const rule = body?.rule;
  if (rule !== "purchase" && rule !== "quote") return refuse("沒有這條規則");
  if (typeof body?.enabled !== "boolean") return refuse("要說開還是關");
  const threshold = body.threshold;
  const [min, max] = LIMITS[rule];
  if (body.enabled && (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < min || threshold > max)) {
    return refuse(`門檻要在 ${min.toLocaleString("en-US")} 到 ${max.toLocaleString("en-US")} 之間`);
  }
  return erpAction(request, "dropout_core.approvals.configure", { rule, enabled: body.enabled, ...(body.enabled ? { threshold } : {}) });
}
