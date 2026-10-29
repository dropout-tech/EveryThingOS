import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canOrder } from "./credit.ts";

describe("信用額度", () => {
  it("額度 1000、已欠 800、再開 300 拒絕", () => {
    assert.deepEqual(canOrder({ limit: 1000, outstanding: 800, nextAmount: 300 }), { ok: false, message: "超過信用額度" });
  });

  it("再開 200 剛好到額度，允許", () => {
    assert.deepEqual(canOrder({ limit: 1000, outstanding: 800, nextAmount: 200 }), { ok: true });
  });

  it("沒有額度或額度是 0 就不限", () => {
    assert.deepEqual(canOrder({ outstanding: 800, nextAmount: 300 }), { ok: true });
    assert.deepEqual(canOrder({ limit: null, outstanding: 800, nextAmount: 300 }), { ok: true });
    assert.deepEqual(canOrder({ limit: 0, outstanding: 800, nextAmount: 300 }), { ok: true });
  });
});
