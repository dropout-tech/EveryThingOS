import { cookies } from "next/headers";
import { DEFAULT_INDUSTRY_ID, getIndustry } from "./industries";
import { practiceCast } from "./practice";
import { SHOP_COOKIE, applyShop, parseShop, shopFromPack, type ShopProfile } from "./shop";
import type { IndustryPack } from "./types";

export const INDUSTRY_COOKIE = "dropout_industry";

export async function currentShop(): Promise<ShopProfile | null> {
  const jar = await cookies();
  const shop = parseShop(jar.get(SHOP_COOKIE)?.value);
  if (shop) return shop;
  const industry = jar.get(INDUSTRY_COOKIE)?.value;
  if (!industry) return null;
  return shopFromPack(getIndustry(industry));
}

export async function hasChosenIndustry(): Promise<boolean> {
  return Boolean(await currentShop());
}

export async function currentIndustry(): Promise<IndustryPack> {
  const shop = await currentShop();
  if (!shop) return getIndustry(DEFAULT_INDUSTRY_ID);
  const jar = await cookies();
  const seed = jar.get(INDUSTRY_COOKIE)?.value;
  const pack = getIndustry(seed);
  return applyShop(pack, shop);
}

export function demoRecords(pack: IndustryPack) {
  const stages = pack.workflow.stages;
  const people = practiceCast(pack.id);
  const leads = [
    { name: people[0], stage: stages[0], score: 12, channel: "現場" },
    { name: people[1], stage: stages[1] ?? stages[0], score: 38, channel: "IG" },
    { name: people[2], stage: stages[Math.min(2, stages.length - 1)], score: 71, channel: "LINE" },
  ];
  if (stages.length > 3) {
    leads.push({ name: people[3], stage: stages[stages.length - 1], score: 88, channel: "官網" });
  }
  const orders = [
    { no: "SO-10421", party: leads[leads.length - 1]?.name ?? people[0], item: pack.itemType, status: pack.fulfillment, amount: "NT$28,600" },
    { no: "SO-10418", party: leads[1]?.name ?? people[1], item: pack.itemType, status: stages[Math.min(2, stages.length - 1)], amount: "NT$12,400" },
    { no: "SO-10409", party: people[4], item: pack.itemType, status: "已收款", amount: "NT$9,800" },
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
