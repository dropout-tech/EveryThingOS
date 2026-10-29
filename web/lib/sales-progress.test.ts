import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remainingQty } from "./erp.ts";

describe("出貨還差多少", () => {
  it("訂 10 出 6 剩 4", () => {
    assert.equal(remainingQty({ orderedQty: 10, deliveredQty: 6 }), 4);
  });

  it("沒寫 deliveredQty 時，剩餘是 orderedQty", () => {
    assert.equal(remainingQty({ orderedQty: 10 }), 10);
  });

  it("兩者都沒寫則回 undefined", () => {
    assert.equal(remainingQty({}), undefined);
  });
});
