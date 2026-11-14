import { describe, expect, it, vi } from "vitest";
import { handle, type App, type Env } from "../src/app";
import { FREE_SPEECH_MODEL, FREE_TEXT_MODEL, openWhisperTurn } from "../src/openwhisper";
import type { Ai } from "../src/meetings";
import { MemoryStore } from "../src/store";

function fake(run: Ai["run"]): Ai {
  return { run };
}

const WAV = btoa("R".repeat(64));

describe("openWhisperTurn", () => {
  it("refuses a blank turn without calling a model", async () => {
    const run = vi.fn();
    expect(await openWhisperTurn(fake(run), { agent: "openwhisper", message: "  " })).toEqual({ ok: false, message: "說一句，或打一行字" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses any agent other than OpenWhisper", async () => {
    const run = vi.fn();
    expect(await openWhisperTurn(fake(run), { agent: "slip", message: "你好" })).toEqual({ ok: false, message: "這個代理人不能從這裡通話" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers a text turn with the free text model only", async () => {
    const run = vi.fn(async () => ({ response: "好，我聽到了。" }));
    const result = await openWhisperTurn(fake(run), { agent: "openwhisper", message: "今天店裡忙嗎" });
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(FREE_TEXT_MODEL, {
      messages: [
        { role: "system", content: expect.stringContaining("OpenWhisper") },
        { role: "user", content: "今天店裡忙嗎" },
      ],
    });
    expect(result).toEqual({ ok: true, agent: "openwhisper", heard: "今天店裡忙嗎", reply: "好，我聽到了。", mode: "text" });
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/deepgram|aura|flux|kimi|glm-5/i);
  });

  it("transcribes one clip with Whisper, then answers with the free text model", async () => {
    const run = vi.fn(async (model: string) => (model === FREE_SPEECH_MODEL ? { text: "幫我看下一張單" } : { response: "這一回只回答，不寫單。" }));
    const result = await openWhisperTurn(fake(run), { agent: "openwhisper", audio: WAV });
    expect(run).toHaveBeenNthCalledWith(1, FREE_SPEECH_MODEL, expect.objectContaining({ task: "transcribe" }));
    expect(run).toHaveBeenNthCalledWith(2, FREE_TEXT_MODEL, expect.objectContaining({ messages: expect.any(Array) }));
    expect(result).toEqual({ ok: true, agent: "openwhisper", heard: "幫我看下一張單", reply: "這一回只回答，不寫單。", mode: "voice" });
  });

  it("without a binding, does not invent a reply", async () => {
    expect(await openWhisperTurn(undefined, { agent: "openwhisper", message: "在嗎" })).toEqual({
      ok: false,
      message: "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。",
    });
  });

  it("POST /openwhisper says the model is missing", async () => {
    const env = { JOBS: { send: async () => undefined }, TENANT_KEY: "x", ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell" } as unknown as Env;
    const app: App = { store: () => new MemoryStore(), fetcher: fetch };
    const post = (authorization?: string) =>
      new Request("https://glue.example/openwhisper", {
        method: "POST",
        headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
        body: JSON.stringify({ agent: "openwhisper", message: "在嗎" }),
      });
    expect((await handle(post(), env, app)).status).toBe(403);
    const res = await handle(post("Bearer admin"), env, app);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, message: "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。" });
  });

  it("the shell token on a monthly plan does not reach the model", async () => {
    const store = new MemoryStore();
    await store.putAccount({
      site: "shop",
      company: "示範",
      plan: "monthly",
      state: "active",
      hosts: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const env = { JOBS: { send: async () => undefined }, TENANT_KEY: "x", ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell", AI: fake(async () => ({ response: "不該呼叫" })) } as unknown as Env;
    const app: App = { store: () => store, fetcher: fetch };
    const res = await handle(
      new Request("https://glue.example/openwhisper", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer shell" },
        body: JSON.stringify({ agent: "openwhisper", message: "在嗎", site: "shop" }),
      }),
      env,
      app,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, message: "AI 版才有 OpenWhisper。這一回合不會寫單。" });
  });
});
