import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAYOUT, addWidget, hiddenWidgets, isDefaultLayout, moveWidget, parseLayout, removeWidget, WIDGETS } from "./dashboard.ts";

describe("自訂儀表板", () => {
  it("沒存過或存壞了就用預設", () => {
    assert.deepEqual(parseLayout(null), DEFAULT_LAYOUT);
    assert.deepEqual(parseLayout("{"), DEFAULT_LAYOUT);
    assert.deepEqual(parseLayout('{"a":1}'), DEFAULT_LAYOUT);
  });

  it("丟掉不認得與重複的卡片，保留順序", () => {
    assert.deepEqual(parseLayout('["aging","mining","aging",3,"revenue"]'), ["aging", "revenue"]);
  });

  it("全部拿掉也照存", () => {
    assert.deepEqual(parseLayout("[]"), []);
  });

  it("上移下移在邊界不動", () => {
    const layout = parseLayout('["revenue","aging","lowStock"]');
    assert.deepEqual(moveWidget(layout, "aging", -1), ["aging", "revenue", "lowStock"]);
    assert.deepEqual(moveWidget(layout, "revenue", -1), layout);
    assert.deepEqual(moveWidget(layout, "lowStock", 1), layout);
    assert.deepEqual(moveWidget(layout, "margin", 1), layout);
  });

  it("加入放最後，不重複；拿掉後回到可加入清單", () => {
    const layout = removeWidget(DEFAULT_LAYOUT, "aging");
    assert.ok(hiddenWidgets(layout).includes("aging"));
    assert.deepEqual(addWidget(layout, "aging").at(-1), "aging");
    assert.equal(addWidget(DEFAULT_LAYOUT, "aging"), DEFAULT_LAYOUT);
    assert.equal(hiddenWidgets(WIDGETS.map((w) => w.id)).length, 0);
  });

  it("認得預設", () => {
    assert.ok(isDefaultLayout([...DEFAULT_LAYOUT]));
    assert.ok(!isDefaultLayout(moveWidget(DEFAULT_LAYOUT, "revenue", 1)));
  });
});
