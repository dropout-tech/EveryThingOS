import type { NextRequest } from "next/server";
import { updateRule } from "@/lib/automations-server";

/** Turns one rule on or off or changes its numbers. Refused while the contract is read-only. */
export async function POST(request: NextRequest) {
  return updateRule(request);
}
