import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirm, dismiss, stage, type Proposal } from "./agent-confirm.ts";

const draft: Proposal = { id: "p1", tool: "write_doc", summary: "出貨單草稿" };
const replacement: Proposal = { id: "p2", tool: "write_doc", summary: "改寫出貨單" };

describe("代理確認", () => {
  it("stage 回傳下一筆，並取代先前掛著的提案", () => {
    assert.deepEqual(stage(null, draft), draft);
    assert.deepEqual(stage(draft, replacement), replacement);
  });

  it("confirm 只有 id 相同才接受，並清掉掛著的提案", () => {
    assert.deepEqual(confirm(draft, "p1"), { pending: null, accepted: draft });
  });

  it("confirm 的 id 不同或沒有掛著的提案時不接受", () => {
    assert.deepEqual(confirm(draft, "other"), { pending: draft, accepted: null });
    assert.deepEqual(confirm(null, "p1"), { pending: null, accepted: null });
  });

  it("dismiss 一律清掉", () => {
    assert.equal(dismiss(draft), null);
    assert.equal(dismiss(null), null);
  });
});
