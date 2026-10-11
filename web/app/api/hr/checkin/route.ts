import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

/** Clocks the logged-in person in or out; ERPNext only lets people clock themselves. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ log_type?: string; latitude?: number; longitude?: number }>(request);
  if (body?.log_type !== "IN" && body?.log_type !== "OUT") return refuse("要選上班或下班");
  const located = typeof body.latitude === "number" && typeof body.longitude === "number" && Number.isFinite(body.latitude) && Number.isFinite(body.longitude);
  return erpAction(request, "dropout_hr_tw.shell.check_in", { log_type: body.log_type, ...(located ? { latitude: body.latitude, longitude: body.longitude } : {}) });
}
