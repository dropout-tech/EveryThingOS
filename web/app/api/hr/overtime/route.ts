import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { parseOvertime } from "@/lib/overtime";

/** HR records approved overtime; ERPNext computes the pay and refuses hours past the legal caps. */
export async function POST(request: NextRequest) {
  const parsed = parseOvertime(await readJson<unknown>(request));
  if (!parsed.ok) return refuse(parsed.message);
  return erpAction(request, "dropout_hr_tw.overtime.record", parsed.value);
}
