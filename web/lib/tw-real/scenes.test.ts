import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { industryDayPath } from "../operator-day.ts";
import { nextLead } from "../next-thing.ts";
import { BEAT_HREFS, SCENE_SCRIPTS, beatByStep, type SceneScript } from "./index.ts";
import type { IndustryPack } from "../types.ts";

const HREFS = new Set<string>(BEAT_HREFS);

function textOf(script: SceneScript) {
  return script.beats.map((beat) => `${beat.step} ${beat.detail}`).join("\n");
}

function packFor(script: SceneScript): IndustryPack {
  return {
    id: "test",
    code: "test",
    nameZh: script.label,
    nameEn: script.id,
    group: "test",
    itemType: "一件",
    fulfillment: "交付",
    tagline: "",
    pains: [],
    kpis: [],
    workflow: { id: script.id, name: script.label, stages: script.beats.map((beat) => beat.step) },
    saasReplaced: [],
    modules: {
      crm: true,
      funnel: true,
      hygiene: false,
      website: false,
      line: true,
      erp: { inventory: true, manufacturing: false, pos: false, projects: false, batch: false },
    },
    sampleLoop: "",
  };
}

describe("台灣現場十步", () => {
  it("十一個現場各十步，步名短、網址只開殼上已有的頁", () => {
    assert.equal(SCENE_SCRIPTS.length, 11);
    const ids = SCENE_SCRIPTS.map((script) => script.id);
    assert.equal(new Set(ids).size, 11);
    for (const script of SCENE_SCRIPTS) {
      assert.equal(script.beats.length, 10, script.id);
      const steps = script.beats.map((beat) => beat.step);
      assert.equal(new Set(steps).size, 10, script.id);
      for (const beat of script.beats) {
        assert.ok([...beat.step].length >= 2 && [...beat.step].length <= 6, beat.step);
        assert.ok(HREFS.has(beat.href), `${script.id} ${beat.step} ${beat.href}`);
        assert.ok(beat.detail.endsWith("。"), beat.detail);
      }
    }
  });

  it("句子裡不寫稅率、費率、百分比或政府申報檔", () => {
    const banned = [/稅率/, /勞保/, /勞退/, /健保點/, /部分負擔/, /XML/, /MIG/, /\d+(\.\d+)?%/];
    for (const script of SCENE_SCRIPTS) {
      const text = textOf(script);
      for (const pattern of banned) {
        assert.equal(pattern.test(text), false, `${script.id} ${pattern}`);
      }
    }
  });

  it("賣東西先對貨，個人二聯、有統編三聯，退換是這家店自己的天數", () => {
    const retail = textOf(SCENE_SCRIPTS.find((script) => script.id === "retail")!);
    assert.match(retail, /對貨架/);
    assert.match(retail, /二聯式/);
    assert.match(retail, /三聯式/);
    assert.match(retail, /統一編號/);
    assert.match(retail, /本店自己定的/);
    assert.equal(beatByStep("retail", "對貨架")?.href, "/workspace/erp/stock");
    assert.equal(beatByStep("retail", "開發票")?.href, "/workspace/erp/finance");
  });

  it("餐飲先問內用或外帶，不寫服務費", () => {
    const food = textOf(SCENE_SCRIPTS.find((script) => script.id === "food")!);
    assert.match(food, /內用/);
    assert.match(food, /外帶/);
    assert.doesNotMatch(food, /服務費/);
    const order = SCENE_SCRIPTS.find((script) => script.id === "food")!.beats.map((beat) => beat.step);
    assert.ok(order.indexOf("問內用") < order.indexOf("點餐"));
  });

  it("教室依報價收學費，下期是新的報名；診所寫明自費", () => {
    const edu = textOf(SCENE_SCRIPTS.find((script) => script.id === "edu")!);
    assert.match(edu, /報價單上寫的學費/);
    assert.match(edu, /重新報名/);
    const care = textOf(SCENE_SCRIPTS.find((script) => script.id === "care")!);
    assert.match(care, /自費/);
    assert.match(care, /不申報健保/);
  });

  it("訂金和追加只寫在這張報價上", () => {
    const service = SCENE_SCRIPTS.find((script) => script.id === "service")!;
    const deposit = service.beats.find((beat) => beat.step === "收訂金")!;
    assert.match(deposit.detail, /這張報價寫的訂金/);
    assert.match(service.beats.find((beat) => beat.step === "改一輪")!.detail, /這張合約寫可以改一輪/);
    const build = SCENE_SCRIPTS.find((script) => script.id === "build")!;
    assert.match(build.beats.find((beat) => beat.step === "追加另報")!.detail, /另開一張報價/);
    const make = SCENE_SCRIPTS.find((script) => script.id === "make")!;
    const steps = make.beats.map((beat) => beat.step);
    assert.ok(steps.indexOf("收訂金") < steps.indexOf("備料"));
  });

  it("運送和農產月結，住宿有統編才開三聯", () => {
    const move = textOf(SCENE_SCRIPTS.find((script) => script.id === "move")!);
    assert.match(move, /月結/);
    assert.match(move, /簽名或一張收到的照片/);
    const farm = textOf(SCENE_SCRIPTS.find((script) => script.id === "farm")!);
    assert.match(farm, /A、B 級/);
    assert.match(farm, /月結/);
    const stay = textOf(SCENE_SCRIPTS.find((script) => script.id === "stay")!);
    assert.match(stay, /統編就開三聯/);
    assert.match(stay, /沒給就開二聯/);
  });

  it("今天的下一步跟這一步寫的頁走，不另猜", () => {
    const make = SCENE_SCRIPTS.find((script) => script.id === "make")!;
    const path = industryDayPath(packFor(make));
    const look = path.find((step) => step.label === "看圖");
    assert.equal(look?.href, "/workspace/chat");
    assert.match(look?.hint ?? "", /這次給的圖/);
  });

  it("練習先做跟得最遠的那位，一次只進一格", () => {
    const stages = SCENE_SCRIPTS.find((script) => script.id === "retail")!.beats.map((beat) => beat.step);
    const focus = nextLead(
      [
        { name: "甲", stage: stages[0] },
        { name: "乙", stage: stages[6] },
        { name: "丙", stage: stages[2] },
      ],
      stages,
    );
    assert.equal(focus?.name, "乙");
    assert.equal(stages[stages.indexOf(focus!.stage) + 1], "結帳");
  });
});
