import type { IndustryPack } from "./types";
import packs from "../data/industries.json";

const industries = packs as IndustryPack[];

export const DEFAULT_INDUSTRY_ID = "billiards-academy";

export function listIndustries(): IndustryPack[] {
  return industries;
}

export function listGroups(): string[] {
  return [...new Set(industries.map((item) => item.group))];
}

export function getIndustry(id: string | undefined | null): IndustryPack {
  const match = industries.find((item) => item.id === id);
  if (match) return match;
  return industries.find((item) => item.id === DEFAULT_INDUSTRY_ID) ?? industries[0];
}

export function industriesByGroup(): { group: string; items: IndustryPack[] }[] {
  return listGroups().map((group) => ({
    group,
    items: industries.filter((item) => item.group === group),
  }));
}

export function enabledErpLabels(pack: IndustryPack): string[] {
  const labels: string[] = ["報價", "訂單", "應收"];
  if (pack.modules.erp.inventory) labels.push("庫存");
  if (pack.modules.erp.pos) labels.push("POS");
  if (pack.modules.erp.manufacturing) labels.push("工單／用料");
  if (pack.modules.erp.projects) labels.push("專案");
  if (pack.modules.erp.batch) labels.push("批次");
  return labels;
}
