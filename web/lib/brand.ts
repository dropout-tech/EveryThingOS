/** Store look presets. A preset only changes colours and type; every page and number stays the same. */
export const BRANDS = [
  { id: "everythingos", label: "EveryThingOS", hint: "灰白底、琢奧青綠" },
  { id: "meetplus", label: "米特製造所", hint: "奶油底、海軍藍、青綠、粉圓字" },
  { id: "store", label: "這家的名字", hint: "顏色沿用現在的，頂欄和預約頁用這一家的名字" },
] as const;

export type BrandId = (typeof BRANDS)[number]["id"];

export const DEFAULT_BRAND: BrandId = "everythingos";

export function parseBrand(value: unknown): BrandId {
  return BRANDS.some((brand) => brand.id === value) ? (value as BrandId) : DEFAULT_BRAND;
}

export const SHOP_NAME_MAX = 24;

/** The name staff and customers see in the top bar and on the booking page. Empty means "use the company name". */
export function cleanShopName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, SHOP_NAME_MAX);
  return name || undefined;
}

/** Reads the optional look fields off a stored shop profile; old profiles without them stay unchanged. */
export function readLook(value: { brand?: unknown; name?: unknown }): { brand?: BrandId; name?: string } {
  const look: { brand?: BrandId; name?: string } = {};
  if (value.brand !== undefined) look.brand = parseBrand(value.brand);
  const name = cleanShopName(value.name);
  if (name) look.name = name;
  return look;
}
