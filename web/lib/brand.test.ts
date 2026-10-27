import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanShopName, parseBrand, readLook } from "./brand.ts";

describe("store look", () => {
  it("falls back to the default look for unknown presets", () => {
    assert.equal(parseBrand("meetplus"), "meetplus");
    assert.equal(parseBrand("ocean"), "everythingos");
    assert.equal(parseBrand(undefined), "everythingos");
  });

  it("cleans the display name", () => {
    assert.equal(cleanShopName("  米特才藝中心  "), "米特才藝中心");
    assert.equal(cleanShopName("<b>店</b>"), "b店/b");
    assert.equal(cleanShopName("   "), undefined);
    assert.equal(cleanShopName(42), undefined);
    assert.equal(cleanShopName("一二三四五六七八九十一二三四五六七八九十一二三四五六")?.length, 24);
  });

  it("keeps look and name on the shop profile, and leaves old profiles alone", () => {
    assert.deepEqual(readLook({ brand: "meetplus", name: "米特才藝中心" }), { brand: "meetplus", name: "米特才藝中心" });
    assert.deepEqual(readLook({ brand: "neon", name: " " }), { brand: "everythingos" });
    assert.deepEqual(readLook({}), {});
  });
});
