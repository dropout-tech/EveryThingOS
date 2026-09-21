import type { IndustryPack } from "./types";

export type ReplyChannel = "ig" | "fb";

export type ReplyRule = {
  id: string;
  keyword: string;
  dm: string;
  publicReply: string;
  channel: ReplyChannel;
};

export type ReplyStatus = "inbox" | "sent" | "skipped";

export type ReplyComment = {
  id: string;
  handle: string;
  text: string;
  post: string;
  channel: ReplyChannel;
  status: ReplyStatus;
  matched?: string;
};

export function seedReplyRules(pack: IndustryPack): ReplyRule[] {
  return [
    {
      id: "r-price",
      keyword: "價格",
      channel: "ig",
      publicReply: "私訊發給你了",
      dm: `你好，這是${pack.nameZh}的價目說明。回這則私訊，我們幫你對${pack.itemType}。`,
    },
    {
      id: "r-link",
      keyword: "LINK",
      channel: "ig",
      publicReply: "連結在私訊",
      dm: "官網與報名走品牌短網址 do-ig（Shlink），不要在留言貼長網址。",
    },
    {
      id: "r-join",
      keyword: "報名",
      channel: "ig",
      publicReply: "報名流程在私訊",
      dm: `收到報名。${pack.fulfillment}前我們會再確認，同一個人會進客人看板，不必再填一次表。`,
    },
  ];
}

export function seedReplyInbox(pack: IndustryPack): ReplyComment[] {
  return [
    {
      id: "c-price",
      handle: "@mei_studio",
      text: `想問${pack.itemType}價格`,
      post: "春季主視覺",
      channel: "ig",
      status: "inbox",
    },
    {
      id: "c-link",
      handle: "@lin.eats",
      text: "LINK",
      post: "限動導流",
      channel: "ig",
      status: "inbox",
    },
    {
      id: "c-nice",
      handle: "@wander.tw",
      text: "好美喔",
      post: "春季主視覺",
      channel: "ig",
      status: "inbox",
    },
    {
      id: "c-join",
      handle: "@office_kai",
      text: "報名",
      post: "活動貼文",
      channel: "ig",
      status: "inbox",
    },
  ];
}

export function matchRule(text: string, rules: ReplyRule[]): ReplyRule | undefined {
  const haystack = text.trim().toLowerCase();
  if (!haystack) return undefined;
  return rules.find((rule) => haystack.includes(rule.keyword.trim().toLowerCase()));
}

export function sanitizeImportedHandle(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 40);
  if (!/^@?[A-Za-z0-9._]+$/.test(trimmed)) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
