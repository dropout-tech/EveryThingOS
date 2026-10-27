import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBooks } from "./erp.ts";
import { shelfFor } from "./scene-shelf.ts";
import type { IndustryPack } from "./types.ts";

function opened(id: string, scene: string, inventory: boolean): IndustryPack {
  return {
    id,
    code: id,
    nameZh: id,
    nameEn: id,
    group: scene,
    itemType: "一件",
    fulfillment: "交付",
    tagline: "",
    pains: [],
    kpis: [],
    workflow: { id: scene, name: scene, stages: ["一"] },
    saasReplaced: [],
    modules: {
      crm: true,
      funnel: false,
      hygiene: false,
      website: false,
      line: true,
      erp: { inventory, manufacturing: false, pos: false, projects: false, batch: false },
    },
    sampleLoop: "",
  };
}

describe("十個行業各算各的", () => {
  it("才藝中心鎖材料名額，補習班不拿黏土", () => {
    const talent = opened("talent-center", "edu", true);
    const cram = opened("cram-school", "edu", true);
    assert.equal(shelfFor(talent).courses, true);
    assert.equal(shelfFor(talent).classBoard, true);
    assert.ok(buildBooks(talent).courseBoms?.some((bom) => bom.courseCode === "CRS-CLAY-01"));
    assert.equal(shelfFor(cram).courses, false);
    assert.equal(buildBooks(cram).courseBoms?.length ?? 0, 0);
    assert.equal(buildBooks(cram).stock.some((row) => row.name.includes("黏土")), false);
    assert.match(buildBooks(cram).stock.map((row) => row.name).join(" "), /講義/);
  });

  it("服飾看尺寸，藥妝看批號，兩邊都沒有課程包", () => {
    const apparel = opened("apparel-store", "retail", true);
    const drug = opened("drugstore", "retail", true);
    assert.match(buildBooks(apparel).stock.map((row) => row.name).join(" "), /M 號/);
    assert.equal(buildBooks(apparel).stock.some((row) => row.batch), false);
    assert.ok(buildBooks(drug).stock.some((row) => row.batch));
    assert.equal(buildBooks(apparel).courseBoms?.length ?? 0, 0);
    assert.equal(buildBooks(drug).courseBoms?.length ?? 0, 0);
  });

  it("餐廳是食材，金屬加工先列缺料不請購，農場 A、B 級分開", () => {
    const food = shelfFor(opened("full-service-restaurant", "food", true));
    const metal = shelfFor(opened("metal-shop", "make", true));
    const farmBooks = buildBooks(opened("farm", "farm", true));
    assert.match(food.caption, /食材/);
    assert.equal(food.holdBuy, false);
    assert.match(food.stock.map((row) => row.name).join(" "), /魚貨/);
    assert.equal(metal.holdBuy, true);
    assert.match(metal.bookClosed ?? "", /訂金/);
    assert.ok(farmBooks.stock.some((row) => row.name.includes("A 級")));
    assert.ok(farmBooks.stock.some((row) => row.name.includes("B 級")));
    assert.equal(farmBooks.courseBoms?.length ?? 0, 0);
  });

  it("診所自費、事務所沒貨架、民宿留房，都不劃課程", () => {
    const clinic = shelfFor(opened("clinic", "care", true));
    const firm = opened("accounting-firm", "service", false);
    const inn = shelfFor(opened("bnb", "stay", false));
    assert.match(clinic.bookClosed ?? "", /自費/);
    assert.doesNotMatch(clinic.bookClosed ?? "", /健保點/);
    assert.equal(firm.modules.erp.inventory, false);
    assert.equal(buildBooks(firm).stock.length, 0);
    assert.match(inn.bookClosed ?? "", /訂金進帳/);
    assert.equal(clinic.classBoard, false);
    assert.equal(shelfFor(firm).classBoard, false);
    assert.equal(inn.classBoard, false);
  });
});
