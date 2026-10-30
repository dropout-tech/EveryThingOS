import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { askAgent } from "@/lib/agent-gateway";
import { liveConfig } from "@/lib/sources/config";

type Body = { message?: string; call?: unknown };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const body = await readJson<Body>(request);
  const config = await liveConfig();
  const message = typeof body?.message === "string" ? body.message : "";
  const glue = config.glue;
  const result = await askAgent({
    connected: Boolean(glue?.url),
    message,
    call: body && "call" in body ? body.call : undefined,
    propose: glue?.url
      ? async () => {
          const res = await fetch(`${glue.url}/agent`, {
            method: "POST",
            headers: { authorization: `Bearer ${glue.adminToken}`, "content-type": "application/json" },
            body: JSON.stringify({ message }),
          });
          return res.json();
        }
      : undefined,
  });
  if (result.ok) return reply(result);
  return refuse(result.message, 409);
}
