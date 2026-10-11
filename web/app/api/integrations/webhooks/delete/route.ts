import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";
import { HOOK_ID } from "@/lib/integrations";

export async function POST(request: NextRequest) {
  return integrationAction<{ id?: unknown }>(request, (b) =>
    typeof b.id === "string" && HOOK_ID.test(b.id) ? { path: `webhooks/${b.id}/delete` } : "找不到這個 Webhook",
  );
}
