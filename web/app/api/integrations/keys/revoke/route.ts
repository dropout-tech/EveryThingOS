import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";
import { KEY_ID } from "@/lib/integrations";

export async function POST(request: NextRequest) {
  return integrationAction<{ id?: unknown }>(request, (b) => (typeof b.id === "string" && KEY_ID.test(b.id) ? `api-keys/${b.id}/revoke` : "找不到這把金鑰"));
}
