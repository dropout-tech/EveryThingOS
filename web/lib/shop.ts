import { getIndustry, listIndustries } from "./industries";
import type { IndustryPack } from "./types";

export const SHOP_COOKIE = "dropout_shop";

export type FeatureId =
  | "crm"
  | "sales"
  | "stock"
  | "purchase"
  | "finance"
  | "funnel"
  | "reply"
  | "website";

export type ShopSize = "solo" | "small" | "mid" | "large";

export type ShopProfile = {
  scene: string;
  size: ShopSize;
  modules: FeatureId[];
};

export const SCENES = [
  { id: "retail", label: "賣東西", group: "零售", stages: ["進貨", "上架", "銷售", "回購"] },
  { id: "food", label: "做餐飲", group: "餐飲", stages: ["訂位", "出餐", "結帳"] },
  { id: "edu", label: "教課／教室", group: "教育", stages: ["預約", "上課", "續報"] },
  { id: "care", label: "診所／美容", group: "健康美容", stages: ["預約", "服務", "回訪"] },
  { id: "service", label: "接案／專業", group: "專業服務", stages: ["詢問", "交付", "請款"] },
  { id: "make", label: "製造／加工", group: "製造", stages: ["接單", "生產", "出貨"] },
  { id: "build", label: "工地／裝潢", group: "營建不動產", stages: ["估價", "施工", "請款"] },
  { id: "move", label: "運送／倉儲", group: "運輸物流", stages: ["接單", "配送", "對帳"] },
  { id: "stay", label: "住宿／活動", group: "旅宿活動", stages: ["預訂", "入住", "結帳"] },
  { id: "farm", label: "產銷／農漁", group: "農林漁牧", stages: ["採收", "出貨", "對帳"] },
  { id: "other", label: "其他現場", group: "公共與其他", stages: ["詢問", "答應", "收款"] },
] as const;

export const FEATURES: { id: FeatureId; label: string; hint: string }[] = [
  { id: "crm", label: "跟人", hint: "誰來過、跟到哪" },
  { id: "sales", label: "做成一筆生意", hint: "報價到出貨" },
  { id: "stock", label: "管倉庫", hint: "貨夠不夠" },
  { id: "purchase", label: "跟廠商進貨", hint: "請購到付款" },
  { id: "finance", label: "收錢對帳", hint: "誰欠我們" },
  { id: "funnel", label: "把人帶來", hint: "活動、信件" },
  { id: "reply", label: "社群留言", hint: "留言轉對話" },
  { id: "website", label: "官網", hint: "客人看得到的頁" },
];

export const SIZES: { id: ShopSize; label: string; hint: string }[] = [
  { id: "solo", label: "就我一個", hint: "自己做完" },
  { id: "small", label: "2–10 人", hint: "小團隊" },
  { id: "mid", label: "11–50 人", hint: "分人做事" },
  { id: "large", label: "50 人以上", hint: "多點、多分" },
];

const FEATURE_IDS = new Set(FEATURES.map((item) => item.id));

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
    case "care":
      return ["crm", "finance", "reply"];
    case "make":
    case "farm":
    case "move":
      return ["sales", "stock", "purchase", "finance"];
    case "build":
    case "service":
      return ["crm", "sales", "finance"];
    case "stay":
      return ["crm", "sales", "finance", "website"];
    default:
      return ["crm", "finance"];
  }
}

export function recommendModules(sceneId: string, size: ShopSize, picked: FeatureId[]): FeatureId[] {
  const set = new Set(picked.length ? picked : defaultsForScene(sceneId));
  if (set.has("sales") || set.has("stock") || set.has("purchase")) set.add("finance");
  if (set.has("funnel") || set.has("reply") || set.has("website")) set.add("crm");
  if ((sceneId === "retail" || sceneId === "make" || sceneId === "food") && size !== "solo") {
    set.add("stock");
  }
  if (size === "solo") {
    set.delete("website");
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
      ? value.modules.filter((id): id is FeatureId => FEATURE_IDS.has(id as FeatureId))
      : defaultsForScene(scene);
    return { scene, size, modules: modules.length ? modules : defaultsForScene(scene) };
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
  if (pack.modules.funnel) modules.push("funnel");
  if (pack.modules.line) modules.push("reply");
  if (pack.modules.website) modules.push("website");
  return { scene, size: "small", modules: recommendModules(scene, "small", modules) };
}

export function applyShop(pack: IndustryPack, shop: ShopProfile): IndustryPack {
  const scene = sceneById(shop.scene);
  const mods = new Set(shop.modules);
  return {
    ...pack,
    nameZh: scene.label,
    nameEn: scene.id,
    group: scene.group,
    tagline: `${SIZES.find((item) => item.id === shop.size)?.label ?? ""} · ${shop.modules.length} 個功能`,
    workflow: { ...pack.workflow, id: scene.id, name: scene.label, stages: [...scene.stages] },
    sampleLoop: scene.stages.join(" → "),
    modules: {
      crm: mods.has("crm"),
      funnel: mods.has("funnel"),
      hygiene: false,
      website: mods.has("website"),
      line: mods.has("reply"),
      erp: {
        inventory: mods.has("stock"),
        manufacturing: shop.scene === "make" && shop.size !== "solo",
        pos: shop.scene === "retail" || shop.scene === "food",
        projects: shop.scene === "build" || shop.scene === "service",
        batch: shop.scene === "make" || shop.scene === "food" || shop.scene === "farm",
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
    case "funnel":
      return "/workspace/funnel";
    case "reply":
      return "/workspace/reply";
    case "website":
      return "/workspace/website";
  }
}

export function navItemsForShop(shop: ShopProfile): { href: string; label: string }[] {
  const labels: Record<FeatureId, string> = {
    crm: "客人",
    sales: "生意",
    stock: "倉庫",
    purchase: "進貨",
    finance: "收錢",
    funnel: "把人帶來",
    reply: "回覆",
    website: "官網",
  };
  const items = [{ href: "/workspace", label: "今天" }];
  for (const id of FEATURES.map((item) => item.id)) {
    if (shop.modules.includes(id)) items.push({ href: moduleHref(id), label: labels[id] });
  }
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
