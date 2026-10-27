import { practiceCast } from "../practice";
import type { OpenThread } from "./types";

export const OPEN_THREADS: OpenThread[] = [
  {
    id: "line-anan",
    name: "林安安",
    handle: "U-line-anan",
    channel: "line",
    preview: "這件還有貨嗎",
    waitedMinutes: 95,
    stage: "客人在問",
    bought: "還沒買",
    owed: "沒有帳",
    email: "anan@example.com",
    phone: "0912-000-118",
  },
  {
    id: "ig-guan",
    name: "陳冠宇",
    handle: "@guan.yu",
    channel: "ig",
    preview: "價格",
    waitedMinutes: 40,
    stage: "客人在問",
    bought: "還沒買",
    owed: "沒有帳",
  },
  {
    id: "fb-mei",
    name: "王美玲",
    handle: "@mei.ling",
    channel: "fb",
    preview: "明天可以取嗎",
    waitedMinutes: 15,
    stage: "客人在問",
    bought: "還沒買",
    owed: "沒有帳",
  },
  {
    id: "web-zhi",
    name: "黃志明",
    handle: "web form",
    channel: "web",
    preview: "想看報價",
    waitedMinutes: 6,
    stage: "客人在問",
    bought: "還沒買",
    owed: "沒有帳",
  },
];

type Waiting = { waitedMinutes: number };

export function nextThread<T extends Waiting>(threads: T[]): T | null {
  let oldest: T | null = null;
  for (const thread of threads) {
    if (!oldest || thread.waitedMinutes > oldest.waitedMinutes) oldest = thread;
  }
  return oldest;
}

export function sortThreads<T extends Waiting>(threads: T[]): T[] {
  return [...threads].sort((a, b) => b.waitedMinutes - a.waitedMinutes);
}

export function practiceThreads(pack: { id: string; nameZh: string; itemType: string; pains?: string[] }): OpenThread[] {
  const people = practiceCast(pack.id);
  const channels = ["line", "ig", "fb", "web"] as const;
  return people.slice(0, 4).map((name, index) => ({
    id: `${pack.id}-${index}`,
    name,
    handle: `${pack.nameZh}-${index + 1}`,
    channel: channels[index] ?? "line",
    preview: pack.pains?.[index] ?? pack.itemType,
    waitedMinutes: 90 - index * 20,
    stage: "客人在問",
    bought: "還沒買",
    owed: "沒有帳",
  }));
}
