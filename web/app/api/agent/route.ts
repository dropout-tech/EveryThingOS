import type { NextRequest } from "next/server";
import { readJson, refuse, sameOrigin } from "@/lib/actions";
import { agentReply } from "@/lib/agent-gateway";
import { liveConfig } from "@/lib/sources/config";

type Body = { message?: string };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const body = await readJson<Body>(request);
  const config = await liveConfig();
  const message = typeof body?.message === "string" ? body.message : "";
  const result = agentReply(Boolean(config.glue?.url), message);
  return refuse(result.message, 409);
}
