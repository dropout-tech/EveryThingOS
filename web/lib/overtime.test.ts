import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOvertime } from "./overtime.ts";

const good = { employee: "HR-EMP-00002", work_date: "2026-10-23", hours: 2, kind: "weekday" };

describe("記加班的輸入", () => {
  it("收下正確的輸入，事由去空白", () => {
    assert.deepEqual(parseOvertime({ ...good, reason: "  趕出貨 " }), { ok: true, value: { ...good, reason: "趕出貨" } });
    assert.deepEqual(parseOvertime({ ...good, hours: "1.5" }), { ok: true, value: { ...good, hours: 1.5 } });
  });

  it("擋掉不存在的日期與格式", () => {
    for (const work_date of ["2026-02-30", "2026/10/23", "", 20261023]) assert.equal(parseOvertime({ ...good, work_date }).ok, false);
  });

  it("時數要在 0 到 24 之間", () => {
    for (const hours of [0, -1, 25, "abc", null]) assert.equal(parseOvertime({ ...good, hours }).ok, false);
  });

  it("只認得法定的加班種類", () => {
    assert.equal(parseOvertime({ ...good, kind: "toString" }).ok, false);
    assert.equal(parseOvertime({ ...good, kind: "night" }).ok, false);
  });

  it("沒有員工或不是物件就拒絕", () => {
    assert.equal(parseOvertime({ ...good, employee: " " }).ok, false);
    assert.equal(parseOvertime(null).ok, false);
    assert.equal(parseOvertime("x").ok, false);
  });

  it("事由最多 200 字", () => {
    const r = parseOvertime({ ...good, reason: "字".repeat(300) });
    assert.ok(r.ok && r.value.reason?.length === 200);
  });
});
