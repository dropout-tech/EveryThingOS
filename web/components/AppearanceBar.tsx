import { ScenePicker } from "./ScenePicker";
import { ThemeToggle } from "./ThemeToggle";
import { currentScene } from "@/lib/scene-server";
import { currentTheme } from "@/lib/theme-server";

export async function AppearanceBar() {
  const [theme, scene] = await Promise.all([currentTheme(), currentScene()]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ThemeToggle current={theme} />
      <ScenePicker current={scene} />
    </div>
  );
}
