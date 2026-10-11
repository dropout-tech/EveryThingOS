import { cookies } from "next/headers";
import { parseStyle, STYLE_COOKIE, type UiStyle } from "./style";

export async function currentStyle(): Promise<UiStyle> {
  const jar = await cookies();
  return parseStyle(jar.get(STYLE_COOKIE)?.value);
}
