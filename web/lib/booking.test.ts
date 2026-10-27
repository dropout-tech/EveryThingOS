import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideBooking, parseBooking, seatsLabel } from "./booking.ts";
import { evaluateCourseBom, type CourseBom } from "./course-bom.ts";

const bom: CourseBom = {
  courseCode: "CRS-CLAY-01",
  courseName: "親子黏土手作",
  targetSeats: 12,
  bookedSeats: 8,
  lines: [
    { sku: "MAT-CLAY-SET", name: "黏土材料包", qtyPerStudent: 1, uom: "份" },
    { sku: "MAT-FRAME-01", name: "相框底座", qtyPerStudent: 1, uom: "個" },
  ],
};
const stock = [
  { sku: "MAT-CLAY-SET", onHand: 20, safety: 5 },
  { sku: "MAT-FRAME-01", onHand: 10, safety: 5 },
];
const today = new Date("2026-10-27T02:00:00Z");
const valid = { courseCode: "CRS-CLAY-01", branch: "台北信義", date: "2026-11-01", slot: "10:00", seats: 2, parentName: "王媽媽", phone: "0912-345-678", channel: "LINE" };

describe("預約綁定課程 BOM", () => {
  it("材料夠就鎖料，鎖定量＝每人用量×人數", () => {
    const d = decideBooking(evaluateCourseBom(bom, stock), 2);
    assert.equal(d.status, "locked");
    if (d.status !== "locked") return;
    assert.deepEqual(
      d.locks.map((l) => [l.sku, l.qty]),
      [
        ["MAT-CLAY-SET", 2],
        ["MAT-FRAME-01", 2],
      ],
    );
    assert.equal(d.remainingAfter, 0);
  });

  it("材料不夠就進候補並指出瓶頸材料", () => {
    const evaluated = evaluateCourseBom(bom, stock);
    const d = decideBooking(evaluated, 3);
    assert.equal(d.status, "waitlist");
    if (d.status !== "waitlist") return;
    assert.equal(d.shortBy, 1);
    assert.equal(d.bottleneck, "相框底座");
    assert.equal(seatsLabel(evaluated), "剩 2 位");
  });

  it("檢查必填、過去日期與手機格式", () => {
    assert.equal(parseBooking(valid, today).ok, true);
    assert.equal(parseBooking({ ...valid, date: "2026-10-01" }, today).ok, false);
    assert.equal(parseBooking({ ...valid, phone: "abc" }, today).ok, false);
    assert.equal(parseBooking({ ...valid, seats: 0 }, today).ok, false);
    const unknownChannel = parseBooking({ ...valid, channel: "TikTok" }, today);
    assert.equal(unknownChannel.ok && unknownChannel.value.channel, "官網");
  });
});
