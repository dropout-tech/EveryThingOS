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

  it("夾帶稅率或不認識的動作，先拒絕", () => {
    assert.deepEqual(
      agentReply(false, "開報價", { tool: "create_quotation", args: { party: "王小明", items: [{ item_code: "CLAY", qty: 1 }], tax_rate: 0.05 } }),
      { ok: false, message: "稅額不由這裡決定" },
    );
    assert.deepEqual(agentReply(true, "清掉", { tool: "drop_database", args: {} }), { ok: false, message: "這個動作不能從這裡做" });
  });

  it("接上了也不寫入單據", () => {
    const result = agentReply(true, "開報價單給王小明");
    assert.deepEqual(result, { ok: false, message: "進階版的代理人還沒接上模型。這一步不會寫入單據。" });
    assert.equal("created" in result, false);
  });
});
