import { AppearanceMenu } from "./AppearanceMenu";
import { currentTheme } from "@/lib/theme-server";

export async function AppearanceBar() {
  const theme = await currentTheme();
  return <AppearanceMenu theme={theme} />;
}
