import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { retiredDemoApiBlocked } from "@/lib/retired-demo-api";

/** Approves or rejects one leave application in ERPNext. */
export async function POST(request: NextRequest) {
  const blocked = retiredDemoApiBlocked(request);
  if (blocked) return blocked;
  const body = await readJson<{ name?: string; decision?: string }>(request);
  if (!body?.name || typeof body.name !== "string" || body.name.length > 140) return refuse("缺少假單");
  if (body.decision !== "approve" && body.decision !== "reject") return refuse("只能核准或退回");
  return erpAction(request, "dropout_hr_tw.shell.decide_leave", { name: body.name, decision: body.decision });
}
