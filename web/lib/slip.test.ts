import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSlip } from "./slip.ts";

describe("給客人的單", () => {
  it("前餘 500，一列數量 2 單價 100，本筆 200、後餘 700、稅額 0", () => {
    const text = formatSlip({
      party: "林小姐",
      lines: [{ item: "蘋果", qty: 2, rate: 100 }],
      previousBalance: 500,
    });
    assert.match(text, /客人/);
    assert.match(text, /林小姐/);
    assert.match(text, /品名/);
    assert.match(text, /蘋果/);
    assert.match(text, /數量/);
    assert.match(text, /2/);
    assert.match(text, /金額/);
    assert.match(text, /前餘[^\n]*500/);
    assert.match(text, /本筆[^\n]*200/);
    assert.match(text, /後餘[^\n]*700/);
    assert.match(text, /稅額 0/);
    assert.equal(text.includes("5%"), false);
    assert.equal(text.includes("세금계산서"), false);
  });
});
