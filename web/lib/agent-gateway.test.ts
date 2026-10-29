import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentReply } from "./agent-gateway.ts";

describe("agentReply", () => {
  it("空白訊息請說下一張單", () => {
    assert.deepEqual(agentReply(false, ""), { ok: false, message: "請說要做的下一張單" });
    assert.deepEqual(agentReply(true, "   "), { ok: false, message: "請說要做的下一張單" });
  });

  it("沒接上時單據仍在 ERPNext", () => {
    const result = agentReply(false, "開報價單給王小明");
    assert.deepEqual(result, { ok: false, message: "代理人還沒接上。單據仍然在 ERPNext。" });
    assert.equal("created" in result, false);
  });

  it("接上了也不寫入單據", () => {
    const result = agentReply(true, "開報價單給王小明");
    assert.deepEqual(result, { ok: false, message: "進階版的代理人還沒接上模型。這一步不會寫入單據。" });
    assert.equal("created" in result, false);
  });
});
