import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthSalesLabel, monthSalesLine } from "./month-sales-label.ts";

describe("本月銷貨標籤", () => {
  it("標示未稅、來自總帳", () => {
    assert.equal(monthSalesLabel(), "本月銷貨（未稅，總帳）");
  });

  it("金額原樣帶上，不加稅、不乘", () => {
    assert.deepEqual(monthSalesLine(12000), { label: "本月銷貨（未稅，總帳）", amount: 12000 });
    assert.deepEqual(monthSalesLine(0), { label: monthSalesLabel(), amount: 0 });
    assert.deepEqual(monthSalesLine(-350), { label: monthSalesLabel(), amount: -350 });
    assert.deepEqual(monthSalesLine(99.5), { label: monthSalesLabel(), amount: 99.5 });
  });

  it("不是有限數字就記 0", () => {
    assert.deepEqual(monthSalesLine(Number.NaN), { label: monthSalesLabel(), amount: 0 });
    assert.deepEqual(monthSalesLine(Number.POSITIVE_INFINITY), { label: monthSalesLabel(), amount: 0 });
    assert.deepEqual(monthSalesLine(Number.NEGATIVE_INFINITY), { label: monthSalesLabel(), amount: 0 });
  });
});
