import { ScenePicker } from "./ScenePicker";
import { ThemeToggle } from "./ThemeToggle";
import { currentScene } from "@/lib/scene-server";
import { currentTheme } from "@/lib/theme-server";

export async function AppearanceBar() {
  const [theme, scene] = await Promise.all([currentTheme(), currentScene()]);

  return (
    <details className="appearance-menu relative">
      <summary className="glass-chip px-3 py-1.5 text-xs">外觀</summary>
      <div className="glass absolute right-0 top-[calc(100%+8px)] z-50 flex min-w-[12.5rem] flex-col gap-3 p-3">
        <p className="text-[11px] tracking-[0.16em] text-cream-dim uppercase">顏色</p>
        <ThemeToggle current={theme} />
        <p className="text-[11px] tracking-[0.16em] text-cream-dim uppercase">風景</p>
        <ScenePicker current={scene} />
      </div>
    </details>
  );
}
