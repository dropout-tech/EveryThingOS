import { readLook, type BrandId } from "./brand";
import { getIndustry, listIndustries } from "./industries";
import {
  buildScript,
  careScript,
  eduScript,
  farmScript,
  foodScript,
  makeScript,
  moveScript,
  otherScript,
  retailScript,
  serviceScript,
  stayScript,
} from "./tw-real/index";
import type { IndustryPack } from "./types";

export const SHOP_COOKIE = "dropout_shop";

export type FeatureId =
  | "crm"
  | "sales"
  | "stock"
  | "purchase"
  | "finance"
  | "letter"
  | "chat"
  | "meetings"
  | "website"
  | "hr";

export type ShopSize = "solo" | "small" | "mid" | "large";

export type ShopProfile = {
  scene: string;
  size: ShopSize;
  modules: FeatureId[];
  brand?: BrandId;
  /** Display name for the top bar and booking page. */
  name?: string;
};

function stageNames(script: { beats: readonly { step: string }[] }) {
  return script.beats.map((beat) => beat.step);
}

/** Ten beats for one job, written the way that Taiwan trade actually works. Practice walks them one step at a time; the last step becomes a sale. Sentences live in `web/lib/tw-real/`. */
export const SCENES = [
  { id: "retail", label: "賣東西", group: "零售", stages: stageNames(retailScript) },
  { id: "food", label: "做餐飲", group: "餐飲", stages: stageNames(foodScript) },
  { id: "edu", label: "教課／教室", group: "教育", stages: stageNames(eduScript) },
  { id: "care", label: "診所／美容", group: "健康美容", stages: stageNames(careScript) },
  { id: "service", label: "接案／專業", group: "專業服務", stages: stageNames(serviceScript) },
  { id: "make", label: "製造／加工", group: "製造", stages: stageNames(makeScript) },
  { id: "build", label: "工地／裝潢", group: "營建不動產", stages: stageNames(buildScript) },
  { id: "move", label: "運送／倉儲", group: "運輸物流", stages: stageNames(moveScript) },
  { id: "stay", label: "住宿／活動", group: "旅宿活動", stages: stageNames(stayScript) },
  { id: "farm", label: "產銷／農漁", group: "農林漁牧", stages: stageNames(farmScript) },
  { id: "other", label: "其他現場", group: "公共與其他", stages: stageNames(otherScript) },
] as const;

export const FEATURES: { id: FeatureId; label: string; hint: string }[] = [
  { id: "crm", label: "跟人", hint: "誰來過、跟到哪" },
  { id: "sales", label: "做成一筆生意", hint: "報價到出貨" },
  { id: "stock", label: "管倉庫", hint: "貨夠不夠" },
  { id: "purchase", label: "跟廠商進貨", hint: "請購到付款" },
  { id: "finance", label: "收錢對帳", hint: "誰欠我們" },
  { id: "letter", label: "電子報", hint: "名單、寄信、退訂" },
  { id: "chat", label: "對話", hint: "LINE、IG、FB、官網" },
  { id: "meetings", label: "會議紀錄", hint: "機器人自己進 Zoom／Meet" },
  { id: "website", label: "官網", hint: "客人看得到的頁" },
  { id: "hr", label: "人事", hint: "請假、打卡、薪資" },
];

export const SIZES: { id: ShopSize; label: string; hint: string }[] = [
  { id: "solo", label: "就我一個", hint: "自己做完" },
  { id: "small", label: "2–10 人", hint: "小團隊" },
  { id: "mid", label: "11–50 人", hint: "分人做事" },
  { id: "large", label: "50 人以上", hint: "多點、多分" },
];

const FEATURE_IDS = new Set(FEATURES.map((item) => item.id));

/** Feature ids saved in cookies before the rename; the onboarding toolkit maps them the same way. */
export const LEGACY_FEATURES: Record<string, FeatureId> = { reply: "chat", funnel: "letter" };

export function sceneById(id: string | undefined) {
  return SCENES.find((item) => item.id === id) ?? SCENES[SCENES.length - 1];
}

export function sceneFromGroup(group: string) {
  return SCENES.find((item) => item.group === group) ?? SCENES[SCENES.length - 1];
}

export function seedPackForScene(sceneId: string): IndustryPack {
  const scene = sceneById(sceneId);
  const match = listIndustries().find((item) => item.group === scene.group);
  return match ?? getIndustry(undefined);
}

export function defaultsForScene(sceneId: string): FeatureId[] {
  switch (sceneId) {
    case "retail":
      return ["crm", "sales", "stock", "purchase", "finance"];
    case "food":
      return ["crm", "sales", "stock", "finance"];
    case "edu":
      return ["crm", "sales", "stock", "finance", "chat", "hr"];
    case "care":
      return ["crm", "finance", "chat"];
    case "make":
    case "farm":
    case "move":
      return ["sales", "stock", "purchase", "finance"];
    case "build":
      return ["crm", "sales", "finance"];
    case "service":
      return ["crm", "sales", "finance", "meetings"];
    case "stay":
      return ["crm", "sales", "finance", "website"];
    default:
      return ["crm", "finance"];
  }
}

export function recommendModules(sceneId: string, size: ShopSize, picked: FeatureId[]): FeatureId[] {
  const set = new Set(picked.length ? picked : defaultsForScene(sceneId));
  if (set.has("sales") || set.has("stock") || set.has("purchase")) set.add("finance");
  if (set.has("letter") || set.has("chat") || set.has("website")) set.add("crm");
  if ((sceneId === "retail" || sceneId === "make" || sceneId === "food" || sceneId === "edu") && size !== "solo") {
    set.add("stock");
  }
  if (size === "solo") {
    set.delete("website");
  } else {
    set.add("hr");
  }
  if (size === "large" && (sceneId === "retail" || sceneId === "stay" || sceneId === "edu")) {
    set.add("website");
  }
  return FEATURES.map((item) => item.id).filter((id) => set.has(id));
}

export function parseShop(raw: string | undefined | null): ShopProfile | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ShopProfile>;
    const scene = sceneById(typeof value.scene === "string" ? value.scene : "").id;
    const size = SIZES.some((item) => item.id === value.size) ? (value.size as ShopSize) : "small";
    const modules = Array.isArray(value.modules)
      ? [...new Set(value.modules.map((id) => LEGACY_FEATURES[id as string] ?? id))].filter((id): id is FeatureId => FEATURE_IDS.has(id as FeatureId))
      : defaultsForScene(scene);
    return { scene, size, modules: modules.length ? modules : defaultsForScene(scene), ...readLook(value) };
  } catch {
    return null;
  }
}

export function shopFromPack(pack: IndustryPack): ShopProfile {
  const scene = sceneFromGroup(pack.group).id;
  const modules: FeatureId[] = [];
  if (pack.modules.crm) modules.push("crm");
  modules.push("sales", "finance");
  if (pack.modules.erp.inventory) modules.push("stock", "purchase");
  if (pack.modules.funnel) modules.push("letter");
  if (pack.modules.line) modules.push("chat");
  if (pack.modules.website) modules.push("website");
  return { scene, size: "small", modules: recommendModules(scene, "small", modules) };
}

export function applyShop(pack: IndustryPack, shop: ShopProfile): IndustryPack {
  const scene = sceneById(shop.scene);
  const mods = new Set(shop.modules);
  return {
    ...pack,
    workflow: { ...pack.workflow, id: scene.id, name: scene.label, stages: [...scene.stages] },
    sampleLoop: scene.stages.join(" → "),
    modules: {
      crm: mods.has("crm"),
      funnel: mods.has("letter"),
      hygiene: false,
      website: mods.has("website"),
      line: mods.has("chat"),
      erp: {
        inventory: mods.has("stock"),
        manufacturing: shop.scene === "make" && shop.size !== "solo",
        pos: shop.scene === "retail" || shop.scene === "food",
        projects: shop.scene === "build" || shop.scene === "service",
        batch: shop.scene === "make" || shop.scene === "food" || shop.scene === "farm" || pack.modules.erp.batch,
      },
    },
  };
}

export function moduleHref(id: FeatureId): string {
  switch (id) {
    case "crm":
      return "/workspace/crm";
    case "sales":
      return "/workspace/erp/sales";
    case "stock":
      return "/workspace/erp/stock";
    case "purchase":
      return "/workspace/erp/purchase";
    case "finance":
      return "/workspace/erp/finance";
    case "letter":
      return "/workspace/letter";
    case "chat":
      return "/workspace/chat";
    case "meetings":
      return "/workspace/meetings";
    case "website":
      return "/workspace/website";
    case "hr":
      return "/workspace/hr";
  }
}

export function navItemsForShop(shop: ShopProfile, { team = false, reports = false } = {}): { href: string; label: string }[] {
  const labels: Record<FeatureId, string> = {
    crm: "客人",
    sales: "生意",
    stock: "倉庫",
    purchase: "進貨",
    finance: "收錢",
    letter: "電子報",
    chat: "對話",
    meetings: "會議",
    website: "官網",
    hr: "人事",
  };
  const items = [{ href: "/workspace", label: "今天" }];
  for (const id of FEATURES.map((item) => item.id)) {
    if (shop.modules.includes(id)) items.push({ href: moduleHref(id), label: labels[id] });
  }
  if (reports) items.push({ href: "/workspace/reports", label: "儀表板" });
  if (team) items.push({ href: "/workspace/team", label: "團隊" });
  items.push({ href: "/workspace/settings", label: "設定" });
  return items;
}

export function hrefAllowed(href: string, shop: ShopProfile): boolean {
  if (href === "/workspace" || href.startsWith("/workspace/settings") || href.startsWith("/workspace/erp/compare")) {
    return true;
  }
  if (href.startsWith("/workspace/erp") && !href.includes("/stock") && !href.includes("/purchase") && !href.includes("/sales") && !href.includes("/finance")) {
    return shop.modules.includes("sales") || shop.modules.includes("finance") || shop.modules.includes("stock");
  }
  return shop.modules.some((id) => {
    const target = moduleHref(id);
    return href === target || href.startsWith(`${target}/`);
  });
}
