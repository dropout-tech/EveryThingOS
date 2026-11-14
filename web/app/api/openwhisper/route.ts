import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { OPENWHISPER_ID, screenWhisper } from "@/lib/openwhisper";
import { liveConfig } from "@/lib/sources/config";

type Body = { agent?: string; message?: string; audio?: string };

const MAX_AUDIO_CHARS = Math.ceil((500_000 * 4) / 3) + 4;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const body = await readJson<Body>(request);
  const message = typeof body?.message === "string" ? body.message : "";
  const audio = typeof body?.audio === "string" ? body.audio : "";
  if (audio.length > MAX_AUDIO_CHARS) return refuse("語音太長，請說短一點", 413);
  const config = await liveConfig();
  const glue = config.glue;
  const screened = screenWhisper({
    connected: Boolean(glue?.url),
    agentId: typeof body?.agent === "string" ? body.agent : "",
    message,
    hasAudio: audio.length > 0,
  });
  if (!screened.ok) return refuse(screened.message, 409);
  try {
    const res = await fetch(`${glue!.url}/openwhisper`, {
      method: "POST",
      headers: { authorization: `Bearer ${glue!.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ agent: OPENWHISPER_ID, message, audio, site: glue!.site }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; heard?: string; reply?: string; mode?: string };
    if (data.ok && typeof data.reply === "string") return reply({ ok: true, heard: data.heard, reply: data.reply, mode: data.mode });
    return refuse(typeof data.message === "string" && data.message.trim() ? data.message : "這一回合沒有通。", res.status === 403 ? 403 : 409);
  } catch {
    return refuse("OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。", 409);
  }
}
