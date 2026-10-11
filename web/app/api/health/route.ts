import { NextResponse } from "next/server";
import { glueReachable } from "@/lib/status";

export const dynamic = "force-dynamic";

/** Liveness for the glue's uptime checks and outside monitors. The shell answering is `ok`; the glue is reported, not required. */
export async function GET() {
  const glue = await glueReachable();
  return NextResponse.json({ ok: true, checks: { shell: { ok: true }, ...(glue ? { glue } : {}) } }, { headers: { "cache-control": "no-store" } });
}
