import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type UiTheme } from "./theme";

export async function currentTheme(): Promise<UiTheme> {
  const jar = await cookies();
  return parseTheme(jar.get(THEME_COOKIE)?.value);
}
