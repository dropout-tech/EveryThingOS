import assert from "node:assert/strict";
import test from "node:test";
import { paymentAmount, priceLines } from "./money.ts";

test("未稅 12000 加 5% 是稅 600、含稅 12600", () => {
  const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 12000 }]);
  assert.equal(priced.ok, true);
  if (!priced.ok) return;
  assert.equal(priced.untaxed, 12000);
  assert.equal(priced.tax, 600);
  assert.equal(priced.total, 12600);
  assert.equal(priced.lines[0].amount, 12000);
});

test("稅用四捨五入，333 的 5% 是 17", () => {
  const priced = priceLines([{ itemCode: "A", qty: 1, rate: 333 }]);
  assert.equal(priced.ok, true);
  if (!priced.ok) return;
  assert.equal(priced.tax, 17);
  assert.equal(priced.total, 350);
});

test("單價先收成整數，不採用小數單價直接乘出來的合計", () => {
  const priced = priceLines([{ itemCode: "A", qty: 2, rate: 100.4 }]);
  assert.equal(priced.ok, true);
  if (!priced.ok) return;
  assert.equal(priced.lines[0].rate, 100);
  assert.equal(priced.untaxed, 200);
  assert.equal(priced.tax, 10);
  assert.equal(priced.total, 210);
});

test("多列先各算整數再加總，然後才乘 5%", () => {
  const priced = priceLines([
    { itemCode: "A", qty: 1, rate: 10 },
    { itemCode: "B", qty: 3, rate: 10 },
  ]);
  assert.equal(priced.ok, true);
  if (!priced.ok) return;
  assert.equal(priced.untaxed, 40);
  assert.equal(priced.tax, 2);
  assert.equal(priced.total, 42);
});

test("空的、零、超過一千萬都拒絕", () => {
  assert.equal(priceLines([]).ok, false);
  assert.equal(priceLines([{ itemCode: "A", qty: 0, rate: 100 }]).ok, false);
  assert.equal(priceLines([{ itemCode: "A", qty: 1, rate: 10_000_001 }]).ok, false);
  assert.equal(priceLines([{ itemCode: "  ", qty: 1, rate: 100 }]).ok, false);
});

test("收款金額收成整數新台幣", () => {
  assert.equal(paymentAmount(1.4), 1);
  assert.equal(paymentAmount(0), null);
  assert.equal(paymentAmount(Number.NaN), null);
});
