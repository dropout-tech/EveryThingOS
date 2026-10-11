export const STYLE_COOKIE = "dropout_style";

export const STYLES = [
  { id: "minimal", name: "現代極簡", note: "平面、留白、資訊清楚，整天盯螢幕也不累" },
  { id: "fluid", name: "流體藝術", note: "海與液態玻璃，琢奧的識別" },
  { id: "social", name: "社群媒體", note: "像滑手機的卡片、頭像與亮色漸層" },
] as const;

export type UiStyle = (typeof STYLES)[number]["id"];

export const DEFAULT_STYLE: UiStyle = "fluid";

export function parseStyle(value: string | undefined | null): UiStyle {
  return STYLES.some((style) => style.id === value) ? (value as UiStyle) : DEFAULT_STYLE;
}
