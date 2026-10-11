// Run: npm test (from web/)
// The assistant's promise is that every number comes from the books and a missing source is said plainly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { answer, parseQuestion } from "../lib/assistant.ts";

const missing = { ok: false, reason: "off", message: "沒有開" };

function facts(overrides = {}) {
  return {
    mode: "demo",
    today: "2026-10-12",
    fulfillment: "出貨",
    money: missing,
    aging: {
      ok: true,
      data: [
        { party: "王美玲", current: 0, d30: 61_740, d60: 0, d90: 0 },
        { party: "陳冠宇", current: 30_240, d30: 0, d60: 0, d90: 0 },
      ],
    },
    sales: missing,
    stock: missing,
    purchases: missing,
    people: missing,
    hr: missing,
    report: missing,
    todo: missing,
    chatHref: null,
    ...overrides,
  };
}

function amounts(a) {
  return [...a.figures.map((f) => f.amount), ...a.rows.map((r) => r.amount)].filter((n) => typeof n === "number");
}

test("who owes the most is read from the aging rows", () => {
  const f = facts();
  assert.equal(parseQuestion("誰欠我們最多？", f).intent, "receivables");
  const a = answer("誰欠我們最多？", f);
  assert.equal(a.understood, true);
  assert.match(a.text, /王美玲/);
  const known = new Set([0, 61_740, 30_240, 91_980]);
  for (const n of amounts(a)) assert.ok(known.has(n), `unexpected number ${n}`);
});

test("full-width punctuation and spaces do not change the intent", () => {
  const f = facts();
  assert.equal(parseQuestion("　誰欠我們最多 ？", f).intent, parseQuestion("誰欠我們最多?", f).intent);
});

test("a switched-off source is a gap, never a number", () => {
  const a = answer("這個月營收多少", facts());
  assert.ok(a.gap, "expected a gap for missing money facts");
  assert.deepEqual(amounts(a), []);
});

test("nonsense is not understood and carries no figures", () => {
  const a = answer("ㄅㄆㄇㄈ qwerty", facts());
  assert.equal(a.understood, false);
  assert.deepEqual(amounts(a), []);
});
