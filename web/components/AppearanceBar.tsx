import { AppearanceMenu } from "./AppearanceMenu";
import { currentScene } from "@/lib/scene-server";
import { currentTheme } from "@/lib/theme-server";

export async function AppearanceBar() {
  const [theme, scene] = await Promise.all([currentTheme(), currentScene()]);
  return <AppearanceMenu theme={theme} scene={scene} />;
}
