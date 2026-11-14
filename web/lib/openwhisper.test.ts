import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deskAgents, screenWhisper } from "./openwhisper.ts";
import { downsample, encodeWav } from "./wav-clip.ts";

describe("deskAgents", () => {
  it("lists OpenWhisper on every interactive rail", () => {
    const agents = deskAgents(false);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].id, "openwhisper");
    assert.equal(agents[0].call, true);
  });

  it("keeps the slip agent beside OpenWhisper on the advanced tier", () => {
    const agents = deskAgents(true);
    assert.deepEqual(
      agents.map((agent) => agent.id),
      ["openwhisper", "slip"],
    );
    assert.equal(agents[1].call, false);
  });
});

describe("screenWhisper", () => {
  it("asks for a sentence before calling the model", () => {
    assert.deepEqual(screenWhisper({ connected: true, agentId: "openwhisper", message: "  ", hasAudio: false }), { ok: false, message: "說一句，或打一行字" });
  });

  it("does not invent a reply when Workers AI is not connected", () => {
    assert.deepEqual(screenWhisper({ connected: false, agentId: "openwhisper", message: "在嗎", hasAudio: false }), {
      ok: false,
      message: "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。",
    });
  });

  it("refuses a call to another agent", () => {
    assert.deepEqual(screenWhisper({ connected: true, agentId: "slip", message: "開報價", hasAudio: false }), { ok: false, message: "這個代理人不能從這裡通話" });
  });
});

describe("encodeWav", () => {
  it("writes a 16 kHz mono header", () => {
    const wav = encodeWav(downsample(new Float32Array([0, 0.5, -0.5, 0]), 32_000), 16_000);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(wav.length, 44 + 2 * 2);
  });
});
