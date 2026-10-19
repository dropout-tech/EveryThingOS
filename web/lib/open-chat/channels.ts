import type { ChannelFact } from "./types";

export const CHANNELS: ChannelFact[] = [
  {
    id: "line",
    label: "LINE 官方帳號",
    replaces: "「LINE 官方帳號後台」",
    note: "一對一回覆用回覆 token，不吃方案額度。這裡不做群發，也不串 LINE 社群（沒有官方 API）。",
  },
  {
    id: "ig",
    label: "IG 私訊",
    replaces: "「Instagram 收件匣」",
    note: "客人最後一則之後 24 小時內可回。超過不在這裡代送。",
  },
  {
    id: "fb",
    label: "FB 粉專",
    replaces: "「Facebook 收件匣」",
    note: "與 IG 同一個 24 小時視窗。留言轉私訊不在這一排，走關鍵字。",
  },
  {
    id: "web",
    label: "官網小工具",
    replaces: "「官網右下角聊天客服」",
    note: "官網來的人進同一個收件匣，不另開一套客服。",
  },
  {
    id: "keyword",
    label: "留言關鍵字",
    replaces: "「ManyChat」",
    note: "留言出現關鍵字才私訊，公開回一句。沒接上之前按送出只寫在這台電腦，不會傳到 Instagram。不做流程畫布，不做自動廣播。",
  },
];

export function channelById(id: ChannelFact["id"]): ChannelFact | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}
