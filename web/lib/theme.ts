export const THEME_COOKIE = "dropout_theme";

export type UiTheme = "black" | "white";

export function parseTheme(value: string | undefined | null): UiTheme {
  return value === "white" ? "white" : "black";
}
