import { cookies } from "next/headers";
import { DEFAULT_INDUSTRY_ID, getIndustry } from "./industries";
import type { IndustryPack } from "./types";

export const INDUSTRY_COOKIE = "dropout_industry";

export async function hasChosenIndustry(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(INDUSTRY_COOKIE)?.value);
}

export async function currentIndustry(): Promise<IndustryPack> {
  const jar = await cookies();
  return getIndustry(jar.get(INDUSTRY_COOKIE)?.value ?? DEFAULT_INDUSTRY_ID);
}

export function demoRecords(pack: IndustryPack) {
  const stages = pack.workflow.stages;
  const leads = [
    { name: `${pack.nameZh} 新名單 A`, stage: stages[0], score: 12, channel: "官網" },
    { name: `${pack.nameZh} 新名單 B`, stage: stages[1] ?? stages[0], score: 38, channel: "社群短網址" },
    { name: `${pack.nameZh} 合格線索`, stage: stages[Math.min(2, stages.length - 1)], score: 71, channel: "Email" },
    { name: `${pack.nameZh} 既有客戶`, stage: stages[stages.length - 1], score: 88, channel: "LINE" },
  ];
  const orders = [
    { no: "SO-10421", party: leads[3].name, item: pack.itemType, status: pack.fulfillment, amount: "NT$28,600" },
    { no: "SO-10418", party: leads[2].name, item: pack.itemType, status: stages[Math.min(3, stages.length - 1)], amount: "NT$12,400" },
    { no: "SO-10409", party: "舊客複購", item: pack.itemType, status: "已收款", amount: "NT$9,800" },
  ];
  const links = [
    { code: "do-home", dest: "官網首頁", clicks: 1284, source: "website" },
    { code: "do-ig", dest: "落地頁／磁鐵", clicks: 642, source: "ig" },
    { code: "do-line", dest: "LINE 選單", clicks: 891, source: "line" },
    { code: "do-qr", dest: "名片 QR", clicks: 77, source: "qr" },
  ];
  const hygiene = [
    { email: "owner@example.com", result: "可用", action: "進客人，之後可以寄信" },
    { email: "info@example.com", result: "不穩", action: "進客人，先不要狂寄" },
    { email: "temp@mailinator.com", result: "假的", action: "擋下，不寄信" },
  ];
  return { leads, orders, links, hygiene };
}
