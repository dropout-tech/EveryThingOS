import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { parseOvertime } from "@/lib/overtime";
import { retiredDemoApiBlocked } from "@/lib/retired-demo-api";

/** HR records approved overtime; ERPNext computes the pay and refuses hours past the legal caps. */
export async function POST(request: NextRequest) {
  const blocked = retiredDemoApiBlocked(request);
  if (blocked) return blocked;
  const parsed = parseOvertime(await readJson<unknown>(request));
  if (!parsed.ok) return refuse(parsed.message);
  return erpAction(request, "dropout_hr_tw.overtime.record", parsed.value);
}
