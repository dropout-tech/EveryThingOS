import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { retiredDemoApiBlocked } from "@/lib/retired-demo-api";

export async function POST(request: NextRequest) {
  const blocked = retiredDemoApiBlocked(request);
  if (blocked) return blocked;
  const body = await readJson<{ name?: string }>(request);
  if (!body?.name) return refuse("缺少電子報");
  return erpAction(request, "dropout_core.actions.send_newsletter", { name: body.name });
}
