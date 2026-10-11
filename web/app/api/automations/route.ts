import { listAutomations } from "@/lib/automations-server";

/** Rules and the latest runs for this company, read from the glue. */
export async function GET() {
  return listAutomations();
}
