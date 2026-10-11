import { AppearanceMenu } from "./AppearanceMenu";
import { currentStyle } from "@/lib/style-server";
import { currentTheme } from "@/lib/theme-server";

export async function AppearanceBar() {
  const [theme, style] = await Promise.all([currentTheme(), currentStyle()]);
  return <AppearanceMenu theme={theme} style={style} />;
}
