import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

/** Turning someone off must work even when the contract has lapsed. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ user?: string; enabled?: boolean }>(request);
  if (!body?.user || typeof body.enabled !== "boolean") return refuse("缺少人或狀態");
  return erpAction(request, "dropout_core.team.set_enabled", { user: body.user, enabled: body.enabled ? 1 : 0 }, { always: true });
}
