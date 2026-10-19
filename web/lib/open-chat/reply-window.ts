import type { OpenChannel } from "./types";

const DAY_MINUTES = 24 * 60;

/** One sentence about whether this channel can still be answered from here. */
export function windowNote(channel: OpenChannel, waitedMinutes: number): string {
  switch (channel) {
    case "line":
      return "這則用回覆 token 回，不吃方案額度。這裡不主動推播。";
    case "ig":
    case "fb":
      return waitedMinutes < DAY_MINUTES
        ? "客人最後一則之後還在 24 小時內，可以回。"
        : "已超過 24 小時。超過要用人工客服標籤，這裡不代送。";
    case "web":
      return "官網小工具沒有 24 小時限制。接上收件匣後在那裡回。";
  }
}
