import type { Ai } from "./meetings";

/** Workers AI models that stay on the daily free neuron allotment. Partner and paid-plan models are not in this list. */
export const FREE_TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const FREE_SPEECH_MODEL = "@cf/openai/whisper";

export const OPENWHISPER_ID = "openwhisper";
export const MAX_AUDIO_BYTES = 500_000;
export const MAX_MESSAGE_CHARS = 2_000;

const PROMPT = "你是 OpenWhisper，店裡右側的通話代理人。用繁體中文短答這一回合。不要開單、不要報價、不要寫入 ERPNext。";

const NEED = "說一句，或打一行字";
const UNHEARD = "沒聽清楚，請再說一次";
const BAD_AUDIO = "語音格式不對";
const LONG_AUDIO = "語音太長，請說短一點";
const NOT_CONNECTED = "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。";
const NO_REPLY = "這一回合沒有回應。";
const FAILED = "這一回合沒有通。免費額度可能用完了。";
const WRONG_AGENT = "這個代理人不能從這裡通話";

export type WhisperTurn =
  | { ok: true; agent: typeof OPENWHISPER_ID; heard: string; reply: string; mode: "text" | "voice" }
  | { ok: false; message: string };

function modelText(out: unknown): string {
  if (typeof out === "string") return out.trim();
  if (out !== null && typeof out === "object" && "response" in out && typeof out.response === "string") return out.response.trim();
  return "";
}

function heardText(out: unknown): string {
  if (typeof out === "string") return out.trim();
  if (out !== null && typeof out === "object" && "text" in out && typeof out.text === "string") return out.text.trim();
  return "";
}

function decodeAudio(value: unknown): Uint8Array | { error: string } | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { error: BAD_AUDIO };
  const compact = value.replace(/\s/g, "");
  if (compact.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4) return { error: LONG_AUDIO };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return { error: BAD_AUDIO };
  let binary: string;
  try {
    binary = atob(compact);
  } catch {
    return { error: BAD_AUDIO };
  }
  if (binary.length > MAX_AUDIO_BYTES) return { error: LONG_AUDIO };
  if (binary.length < 44) return { error: UNHEARD };
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** One OpenWhisper turn on the free Workers AI models. Does not open a realtime socket and does not write a document. */
export async function openWhisperTurn(ai: Ai | undefined, input: { agent?: unknown; message?: unknown; audio?: unknown }): Promise<WhisperTurn> {
  if (input.agent !== OPENWHISPER_ID) return { ok: false, message: WRONG_AGENT };
  const typed = typeof input.message === "string" ? input.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
  const audio = decodeAudio(input.audio);
  if (audio && "error" in audio) return { ok: false, message: audio.error };
  if (!typed && !audio) return { ok: false, message: NEED };
  if (!ai) return { ok: false, message: NOT_CONNECTED };

  let heard = typed;
  const mode = audio ? "voice" : "text";
  try {
    if (audio) {
      const transcript = await ai.run(FREE_SPEECH_MODEL, { audio: Array.from(audio), task: "transcribe" });
      heard = heardText(transcript);
      if (!heard) return { ok: false, message: UNHEARD };
    }
    const out = await ai.run(FREE_TEXT_MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: heard },
      ],
    });
    const reply = modelText(out);
    if (!reply) return { ok: false, message: NO_REPLY };
    return { ok: true, agent: OPENWHISPER_ID, heard, reply, mode };
  } catch {
    return { ok: false, message: FAILED };
  }
}
