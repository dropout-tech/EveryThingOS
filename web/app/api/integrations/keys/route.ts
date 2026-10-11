import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";

/** 新增金鑰. The glue returns the full key once; it is never stored in plain text. */
export async function POST(request: NextRequest) {
  return integrationAction<{ label?: unknown; write?: unknown }>(request, (b) => {
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 80) : "";
    if (!label) return "請幫金鑰取個名字，例如「蝦皮同步」";
    return { path: "api-keys", body: { label, scopes: b.write === true ? ["read", "write"] : ["read"] } };
  });
}
