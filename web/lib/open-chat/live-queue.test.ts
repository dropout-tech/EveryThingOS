import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waitedText, waitingChats } from "./live-queue.ts";

const NOW = Date.UTC(2026, 9, 26, 4, 0, 0);
const ago = (minutes: number) => NOW / 1000 - minutes * 60;

function conversation(id: number, extra: Record<string, unknown>) {
  return { id, status: "open", meta: { sender: { name: `客人${id}` }, channel: "Channel::Line" }, ...extra };
}

describe("收件匣即時排隊", () => {
  it("客人最後說話的才算在等，等最久的排第一", () => {
    const rows = waitingChats(
      [
        conversation(1, { messages: [{ message_type: 0, created_at: ago(15), content: "明天可以取嗎" }] }),
        conversation(2, { messages: [{ message_type: 1, created_at: ago(300) }] }),
        conversation(3, { waiting_since: ago(95), messages: [{ message_type: 0, created_at: ago(5) }] }),
      ],
      NOW,
    );
    assert.deepEqual(
      rows.map((r) => [r.id, r.waitedMinutes]),
      [
        [3, 95],
        [1, 15],
      ],
    );
  });

  it("不把訊息內容帶出來", () => {
    const [row] = waitingChats([conversation(1, { messages: [{ message_type: 0, created_at: ago(1), content: "我的地址是…" }] })], NOW);
    assert.equal(JSON.stringify(row).includes("地址"), false);
  });

  it("認得 LINE、IG、FB、官網，其他通道不猜", () => {
    const channels = ["Channel::Line", "Channel::Instagram", "Channel::FacebookPage", "Channel::WebWidget", "Channel::Email"].map(
      (channel, i) => waitingChats([{ id: i + 1, meta: { channel }, waiting_since: ago(1) }], NOW)[0].channel,
    );
    assert.deepEqual(channels, ["line", "ig", "fb", "web", null]);
  });

  it("壞掉的資料跳過，不是開啟中的不算，重複的只算一次", () => {
    const rows = waitingChats(
      [null, "x", { id: "7" }, { id: 8, status: "resolved", waiting_since: ago(9) }, { id: 9, waiting_since: ago(3) }, { id: 9, waiting_since: ago(3) }, { id: 10, waiting_since: 0 }],
      NOW,
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      [9],
    );
    assert.equal(rows[0].name, "沒留名字的客人");
    assert.deepEqual(waitingChats({ payload: [] }, NOW), []);
  });

  it("時間超過兩小時改用小時、兩天以上用天", () => {
    assert.equal(waitedText(95), "95 分鐘");
    assert.equal(waitedText(180), "3 小時");
    assert.equal(waitedText(3 * 24 * 60), "3 天");
  });
});
