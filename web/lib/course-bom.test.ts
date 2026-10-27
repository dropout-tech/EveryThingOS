import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCourseBom, nextCourseBom, parseCourseBom, type CourseBom } from "./course-bom.ts";

const sampleBom: CourseBom = {
  courseCode: "CRS-STEAM-01",
  courseName: "STEAM 機器人實作期班（8 堂）",
  targetSeats: 12,
  lines: [
    { sku: "MAT-STEAM-BOOK", name: "STEAM 機器人實作講義", qtyPerStudent: 1, uom: "本" },
    { sku: "MAT-STEAM-KIT", name: "感測器與馬達實驗材料包", qtyPerStudent: 2, uom: "組" },
  ],
};

describe("課程 BOM 與材料庫存試算", () => {
  it("算出可開課人數、瓶頸材料與離目標班人數的缺料量", () => {
    const evaluated = evaluateCourseBom(sampleBom, [
      { sku: "MAT-STEAM-BOOK", onHand: 15, safety: 10 },
      { sku: "MAT-STEAM-KIT", onHand: 9, safety: 12 },
    ]);
    assert.equal(evaluated.maxSeats, 4);
    assert.equal(evaluated.readyForTarget, false);
    assert.equal(evaluated.bottleneck?.sku, "MAT-STEAM-KIT");
    assert.equal(evaluated.bottleneck?.supportedSeats, 4);
    // 12 人 × 每人 2 組 = 24 組，現有 9 組 → 還缺 15 組
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
