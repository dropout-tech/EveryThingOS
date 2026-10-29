import { describe, expect, it, vi } from "vitest";
import { ACTION_PROMPT, proposeAction } from "../src/agent";
import type { Ai } from "../src/meetings";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function fake(run: Ai["run"]): Ai {
  return { run };
}

describe("proposeAction", () => {
  it("empty message does not call run", async () => {
    const run = vi.fn(async () => {
      throw new Error("should not run");
    });
    const ai = fake(run);
    expect(await proposeAction(ai, MODEL, "")).toEqual({ ok: false, message: "請說要做的下一張單" });
    expect(await proposeAction(ai, MODEL, " \n\t")).toEqual({ ok: false, message: "請說要做的下一張單" });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns create_quotation from a response object", async () => {
    const args = { party_type: "Customer", party: "ACME", items: [{ item_code: "WIDGET", qty: 2 }] };
    const run = vi.fn(async () => ({ response: JSON.stringify({ tool: "create_quotation", args }) }));
    const message = "幫 ACME 開 WIDGET 兩件的報價";
    const result = await proposeAction(fake(run), MODEL, message);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(MODEL, {
      messages: [
        { role: "system", content: ACTION_PROMPT },
        { role: "user", content: message },
      ],
    });
    expect(result).toEqual({ ok: true, tool: "create_quotation", args });
  });

  it("refuses drop_database", async () => {
    const run = vi.fn(async () => ({ response: JSON.stringify({ tool: "drop_database" }) }));
    expect(await proposeAction(fake(run), MODEL, "清掉資料庫")).toEqual({ ok: false, message: "這一步還不能做" });
  });

  it("refuses a non-JSON response", async () => {
    const run = vi.fn(async () => ({ response: "好的，我來開一張報價單" }));
    expect(await proposeAction(fake(run), MODEL, "開報價")).toEqual({ ok: false, message: "這一步還不能做" });
  });

  it("accepts a fenced JSON block", async () => {
    const args = { sales_order: "SO-9", amount: 500 };
    const run = vi.fn(async () => ({
      response: "```json\n" + JSON.stringify({ tool: "record_deposit", args }) + "\n```",
    }));
    expect(await proposeAction(fake(run), MODEL, "SO-9 收訂金 500")).toEqual({ ok: true, tool: "record_deposit", args });
  });

  it("accepts a string response", async () => {
    const args = { doctype: "Quotation", name: "QTN-0001" };
    const run = vi.fn(async () => JSON.stringify({ tool: "advance", args }));
    expect(await proposeAction(fake(run), MODEL, "這張報價往下走")).toEqual({ ok: true, tool: "advance", args });
  });
});
