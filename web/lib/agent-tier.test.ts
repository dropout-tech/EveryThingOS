import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showAgent } from "./agent-tier.ts";

describe("showAgent", () => {
  it("is true only for the advanced tier", () => {
    assert.equal(showAgent("advanced"), true);
    assert.equal(showAgent("  Advanced  "), true);
    assert.equal(showAgent("ADVANCED"), true);
  });

  it("is false for every other tier and missing values", () => {
    assert.equal(showAgent(undefined), false);
    assert.equal(showAgent(null), false);
    assert.equal(showAgent(""), false);
    assert.equal(showAgent("   "), false);
    assert.equal(showAgent("basic"), false);
    assert.equal(showAgent("pro"), false);
    assert.equal(showAgent("enterprise"), false);
    assert.equal(showAgent("advanced-plus"), false);
  });
});
