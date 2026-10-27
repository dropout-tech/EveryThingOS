import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BookingRequest } from "./booking.ts";
import { evaluateCourseBom, type CourseBom } from "./course-bom.ts";
import { applyLocks, decideHold, demandsFromHolds, openLabel, openSeats, pushHold, stockPressure, type Hold } from "./holds.ts";

const bom: CourseBom = {
  courseCode: "CRS-CLAY-01",
  courseName: "節慶親子手作輕黏土班",
  targetSeats: 7,
  bookedSeats: 6,
  lines: [
    { sku: "MAT-CLAY-SET", name: "黏土材料包", qtyPerStudent: 1, uom: "份" },
    { sku: "MAT-FRAME-01", name: "相框底座", qtyPerStudent: 1, uom: "個" },
  ],
};
const stock = [
  { sku: "MAT-CLAY-SET", onHand: 8, safety: 5 },
  { sku: "MAT-FRAME-01", onHand: 18, safety: 5 },
];

function request(seats = 1, phone = "0912000111"): BookingRequest {
  return { courseCode: bom.courseCode, branch: "台北信義教室", date: "2026-11-07", slot: "10:00", seats, parentName: "王媽媽", phone, channel: "LINE" };
}

describe("預約同時看名額與材料", () => {
  it("材料還夠、名額只剩 1，第二個人不會再被確認", () => {
    const firstBom = evaluateCourseBom(bom, stock);
    assert.equal(openSeats(firstBom), 1);
    assert.equal(openLabel(firstBom), "剩 1 位");
    const first = decideHold(firstBom, request(1), []);
    assert.equal(first.status, "locked");
    const holds = pushHold([], request(1), bom.courseName, first);
    const secondBom = evaluateCourseBom(applyLocks(bom, holds), stock);
    const second = decideHold(secondBom, request(1, "0988000222"), holds);
    assert.equal(second.status, "waitlist");
    assert.equal(second.reason, "full");
    assert.match(second.message, /不會重複劃位/);
    assert.equal(openSeats(secondBom), 0);
  });

  it("同一個手機同一個時段不會劃第二次", () => {
    const evaluated = evaluateCourseBom(bom, stock);
    const first = decideHold(evaluated, request(1), []);
    const holds = pushHold([], request(1), bom.courseName, first);
    const again = decideHold(evaluateCourseBom(applyLocks(bom, holds), stock), request(1), holds);
    assert.equal(again.reason, "duplicate");
    assert.equal(pushHold(holds, request(1), bom.courseName, again).length, 1);
  });

  it("材料比名額先不夠時，候補指出缺的那一項", () => {
    const wide: CourseBom = { ...bom, targetSeats: 20, bookedSeats: 6 };
    const evaluated = evaluateCourseBom(wide, stock);
    const decision = decideHold(evaluated, request(3), []);
    assert.equal(decision.reason, "material");
    assert.equal(decision.status, "waitlist");
    if (decision.status === "waitlist") assert.equal(decision.bottleneck, "黏土材料包");
  });

  it("鎖料進倉庫的已鎖數量，材料候補進近期需求，沒老師的預約進人事待排", () => {
    const locked = decideHold(evaluateCourseBom(bom, stock), request(1), []);
    const holds: Hold[] = pushHold([], request(1), bom.courseName, locked);
    const pressure = stockPressure(holds, [bom]);
    assert.equal(pressure.find((p) => p.sku === "MAT-CLAY-SET")?.locked, 1);
    const demands = demandsFromHolds(holds);
    assert.equal(demands.length, 1);
    assert.equal(demands[0].requiredSkill, "黏土雕塑");
    assert.equal(demands[0].startTime, "10:00");
    assert.equal(demandsFromHolds([{ ...holds[0], teacher: "王小明" }]).length, 0);

    const short = decideHold(evaluateCourseBom({ ...bom, targetSeats: 20 }, stock), request(3, "0912000333"), []);
    const withShort = pushHold(holds, request(3, "0912000333"), bom.courseName, short);
    assert.equal(stockPressure(withShort, [bom]).find((p) => p.sku === "MAT-CLAY-SET")?.demand, 3);
  });
});
