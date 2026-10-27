import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCourseBom,
  nextCourseBom,
  parseCourseBom,
  planMultiStoreReplenishment,
  splitCourseFulfillment,
  type CourseBom,
} from "./course-bom.ts";

const sampleBom: CourseBom = {
  courseCode: "CRS-STEAM-01",
  courseName: "STEAM 機器人實作期班（8 堂）",
  targetSeats: 12,
  bookedSeats: 3,
  lines: [
    { sku: "MAT-STEAM-BOOK", name: "STEAM 機器人實作講義", qtyPerStudent: 1, uom: "本" },
    { sku: "MAT-STEAM-KIT", name: "感測器與馬達實驗材料包", qtyPerStudent: 2, uom: "組" },
  ],
};

describe("課程 BOM、虛實履約拆解與跨店智慧調撥", () => {
  it("算出可開課人數、預扣鎖定量、可再收新學員數與瓶頸材料", () => {
    const evaluated = evaluateCourseBom(sampleBom, [
      { sku: "MAT-STEAM-BOOK", onHand: 15, safety: 10 },
      { sku: "MAT-STEAM-KIT", onHand: 9, safety: 12 },
    ]);
    assert.equal(evaluated.maxSeats, 4);
    assert.equal(evaluated.bookedSeats, 3);
    // 總共夠 4 人，已報名鎖定 3 人 → 只能再收 1 位新學員
    assert.equal(evaluated.remainingSeats, 1);
    assert.equal(evaluated.readyForTarget, false);
    assert.equal(evaluated.bottleneck?.sku, "MAT-STEAM-KIT");
    assert.equal(evaluated.bottleneck?.lockedQty, 6);
    assert.equal(evaluated.bottleneck?.availableQty, 3);
    assert.equal(evaluated.bottleneck?.shortageForTarget, 15);
  });

  it("所有材料都夠時標示 readyForTarget", () => {
    const evaluated = evaluateCourseBom(sampleBom, [
      { sku: "MAT-STEAM-BOOK", onHand: 20, safety: 10 },
      { sku: "MAT-STEAM-KIT", onHand: 24, safety: 12 },
    ]);
    assert.equal(evaluated.maxSeats, 12);
    assert.equal(evaluated.readyForTarget, true);
    assert.equal(evaluated.bottleneck?.shortageForTarget, 0);
  });

  it("優先挑出最缺材料的課程 BOM", () => {
    const a = evaluateCourseBom(sampleBom, [
      { sku: "MAT-STEAM-BOOK", onHand: 20, safety: 10 },
      { sku: "MAT-STEAM-KIT", onHand: 16, safety: 12 },
    ]);
    const b = evaluateCourseBom(
      {
        courseCode: "CRS-SCI-01",
        courseName: "兒童自然科學實驗班",
        targetSeats: 10,
        lines: [{ sku: "MAT-SCI-BOX", name: "酸鹼與光學實驗耗材包", qtyPerStudent: 1, uom: "份" }],
      },
      [{ sku: "MAT-SCI-BOX", onHand: 3, safety: 10 }],
    );
    assert.equal(nextCourseBom([a, b])?.courseCode, "CRS-SCI-01");
  });

  it("虛實履約拆解：已領用材料包不退庫並扣除材料成本，僅預扣未領用則可釋放鎖定並全退", () => {
    const issued = splitCourseFulfillment({
      orderNo: "SO-10501",
      studentName: "陳小安",
      branchName: "台北信義教室",
      courseCode: "CRS-DIY-01",
      courseName: "節慶親子手作黏土班（4 堂）",
      channel: "官網預約",
      totalSessions: 4,
      attendedSessions: 1,
      tuitionAmount: 3200,
      materialPackAmount: 800,
      virtualStage: "booked",
      materialStage: "issued",
    });
    // 已上 1/4 堂 → 認列學費 800，可退學費 2400；材料包 800 已領用不可退
    assert.equal(issued.earnedTuition, 800);
    assert.equal(issued.nonRefundableMaterial, 800);
    assert.equal(issued.refundableAmount, 2400);
    assert.equal(issued.canReleaseLockedMaterial, false);

    const lockedOnly = splitCourseFulfillment({
      orderNo: "SO-10502",
      studentName: "林小宇",
      branchName: "台中公益教室",
      courseCode: "CRS-DIY-01",
      courseName: "節慶親子手作黏土班（4 堂）",
      channel: "LINE 預約",
      totalSessions: 4,
      attendedSessions: 0,
      tuitionAmount: 3200,
      materialPackAmount: 800,
      virtualStage: "booked",
      materialStage: "locked",
    });
    assert.equal(lockedOnly.refundableAmount, 4000);
    assert.equal(lockedOnly.canReleaseLockedMaterial, true);
  });

  it("20 店跨據點 AI 調撥與補貨：優先由同區餘裕分店調撥，不足才採購", () => {
    const recs = planMultiStoreReplenishment([
      {
        branchId: "TPE-01",
        branchName: "台北信義教室",
        region: "北區",
        sku: "MAT-CLAY-SET",
        materialName: "節慶輕黏土材料包",
        uom: "組",
        onHand: 8,
        locked: 6,
        consumed30d: 45,
        wastage30d: 5, // 損耗率 10%
        safety: 5,
        upcomingDemand: 10, // 加損耗 10% → 11，總需 6 + 11 + 5 = 22，現有 8 → 缺 14
      },
      {
        branchId: "NTPC-01",
        branchName: "新北板橋教室",
        region: "北區",
        sku: "MAT-CLAY-SET",
        materialName: "節慶輕黏土材料包",
        uom: "組",
        onHand: 28,
        locked: 4,
        consumed30d: 20,
        wastage30d: 0,
        safety: 6,
        upcomingDemand: 8, // 餘裕 28 - 4 - 8 - 6 = 10
      },
    ]);
    assert.equal(recs.length, 2);
    assert.equal(recs[0].action, "transfer");
    assert.equal(recs[0].sourceBranch, "新北板橋教室");
    assert.equal(recs[0].targetBranch, "台北信義教室");
    assert.equal(recs[0].qty, 10);
    assert.equal(recs[1].action, "purchase");
    assert.equal(recs[1].targetBranch, "台北信義教室");
    assert.equal(recs[1].qty, 4);
  });

  it("驗證輸入並合併重複品號", () => {
    const parsed = parseCourseBom({
      courseCode: " CRS-PY-01 ",
      courseName: " Python 資料分析實戰班 ",
      targetSeats: "15",
      lines: [
        { sku: "MAT-BOOK", name: "實戰講義", qtyPerStudent: 1, uom: "本" },
        { sku: "MAT-BOOK", name: "實戰講義", qtyPerStudent: 1, uom: "本" },
      ],
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.courseCode, "CRS-PY-01");
      assert.equal(parsed.value.targetSeats, 15);
      assert.equal(parsed.value.lines.length, 1);
      assert.equal(parsed.value.lines[0].qtyPerStudent, 2);
    }
    assert.equal(parseCourseBom({ courseCode: "bad code!", courseName: "課", targetSeats: 10, lines: [] }).ok, false);
    assert.equal(parseCourseBom({ courseCode: "CRS-1", courseName: "課", targetSeats: 0, lines: [{ sku: "M1", name: "材", qtyPerStudent: 1 }] }).ok, false);
  });
});
