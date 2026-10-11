import type { NextRequest } from "next/server";
import { dryRun } from "@/lib/automations-server";

/** 試跑: what one rule would do today. Reads ERPNext through the glue and changes nothing. */
export async function POST(request: NextRequest) {
  return dryRun(request);
}
