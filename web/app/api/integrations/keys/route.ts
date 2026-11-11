import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";
import { apiKeyInput } from "@/lib/api-key-scopes";

/** 新增金鑰. The glue returns the full key once; it is never stored in plain text. */
export async function POST(request: NextRequest) {
  return integrationAction<Record<string, unknown>>(request, (b) => {
    const input = apiKeyInput(b);
    return typeof input === "string" ? input : { path: "api-keys", body: input };
  });
}
