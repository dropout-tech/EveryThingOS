import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHANNELS } from "./channels.ts";
import { samePerson } from "./identity.ts";
import { windowNote } from "./reply-window.ts";
import { nextThread, OPEN_THREADS, sortThreads } from "./threads.ts";
import { matchRule, seedReplyRules } from "../reply.ts";

const pack = { nameZh: "賣東西", itemType: "件", fulfillment: "交付" } as never;

describe("開放對話", () => {
  it("下一則是等最久的 LINE 林安安", () => {
    const next = nextThread(OPEN_THREADS);
    const longest = Math.max(...OPEN_THREADS.map((thread) => thread.waitedMinutes));
    assert.equal(next?.name, "林安安");
    assert.equal(next?.channel, "line");
    assert.equal(next?.waitedMinutes, longest);
  });

  it("排序不改進來的陣列順序", () => {
    const input = [...OPEN_THREADS].reverse();
    const before = input.map((thread) => thread.id);
    const sorted = sortThreads(input);
    assert.deepEqual(
      input.map((thread) => thread.id),
      before,
    );
    assert.notEqual(sorted, input);
    assert.deepEqual(
      sorted.map((thread) => thread.waitedMinutes),
      [...input.map((thread) => thread.waitedMinutes)].sort((a, b) => b - a),
    );
  });

  it("IG 滿 24 小時要說超過，LINE 不要", () => {
    assert.match(windowNote("ig", 24 * 60), /超過/);
    assert.match(windowNote("ig", 23 * 60), /24 小時內/);
    assert.equal(/超過/.test(windowNote("line", 24 * 60)), false);
  });

  it("同一個人只靠名字不算，信箱與電話才算", () => {
    assert.equal(samePerson({ name: "林安安" }, { name: "林安安" }), null);
    assert.equal(
      samePerson({ name: "林安安", email: "anan@example.com" }, { name: "陳冠宇", email: "anan@example.com" }),
      "email",
    );
    assert.equal(
      samePerson({ name: "林安安", phone: "0912-000-118" }, { name: "陳冠宇", phone: "0912000118" }),
      "phone",
    );
  });

  it("五個通道，關鍵字那格寫到 ManyChat", () => {
    assert.deepEqual(
      CHANNELS.map((channel) => channel.id),
      ["line", "ig", "fb", "web", "keyword"],
    );
    const keyword = CHANNELS.find((channel) => channel.id === "keyword");
    assert.equal(keyword?.replaces.includes("ManyChat"), true);
  });

  it("想問價格對上價格，好美喔沒有規則", () => {
    const rules = seedReplyRules(pack);
    assert.equal(matchRule("想問價格", rules)?.keyword, "價格");
    assert.equal(matchRule("好美喔", rules), undefined);
  });
});
