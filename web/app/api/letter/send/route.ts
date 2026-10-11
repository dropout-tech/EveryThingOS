import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

export async function POST(request: NextRequest) {
  const body = await readJson<{ name?: string }>(request);
  if (!body?.name) return refuse("缺少電子報");
  return erpAction(request, "dropout_core.actions.send_newsletter", { name: body.name });
}
