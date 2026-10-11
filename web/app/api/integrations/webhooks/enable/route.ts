import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";
import { HOOK_ID } from "@/lib/integrations";

export async function POST(request: NextRequest) {
  return integrationAction<{ id?: unknown; enabled?: unknown }>(request, (b) =>
    typeof b.id === "string" && HOOK_ID.test(b.id) ? { path: `webhooks/${b.id}/enable`, body: { enabled: b.enabled !== false } } : "找不到這個 Webhook",
  );
}
