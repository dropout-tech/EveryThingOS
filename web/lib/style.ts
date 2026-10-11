import { parseTheme, type UiTheme } from "./theme";

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

/** Browser chrome colour (phone status bar, PWA title bar): the page background of each look. */
const THEME_COLORS: Record<UiStyle, Record<UiTheme, string>> = {
  minimal: { black: "#0b0b0c", white: "#fafaf9" },
  fluid: { black: "#07080c", white: "#eef1f6" },
  social: { black: "#000000", white: "#f0f2f5" },
};

export function themeColor(style: UiStyle, theme: UiTheme) {
  return THEME_COLORS[style][theme];
}

/** Appearance switches repaint before the server round-trip; keep the browser chrome in step. */
export function syncThemeColor() {
  const root = document.documentElement;
  const color = themeColor(parseStyle(root.dataset.style), parseTheme(root.dataset.theme));
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = color;
  });
}
