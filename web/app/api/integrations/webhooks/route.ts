import type { NextRequest } from "next/server";
import { integrationAction } from "@/lib/integrations-server";
import { EVENT_LABEL } from "@/lib/integrations";

/** 新增 Webhook. The glue checks the address (https only, no internal networks) and returns the signing secret once. */
export async function POST(request: NextRequest) {
  return integrationAction<{ url?: unknown; events?: unknown; label?: unknown }>(request, (b) => {
    if (typeof b.url !== "string" || !b.url.trim().startsWith("https://")) return "網址要是 https:// 開頭";
    const events = Array.isArray(b.events) ? b.events.filter((e): e is string => typeof e === "string" && e in EVENT_LABEL && e !== "ping") : [];
    if (!events.length) return "至少勾一個要通知的事";
    return { path: "webhooks", body: { url: b.url.trim(), events, label: typeof b.label === "string" ? b.label.trim().slice(0, 80) : "" } };
  });
}
