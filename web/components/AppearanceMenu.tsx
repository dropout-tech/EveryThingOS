"use client";

import type { UiStyle } from "@/lib/style";
import type { UiTheme } from "@/lib/theme";
import { StylePicker } from "./StylePicker";
import { ThemeToggle } from "./ThemeToggle";

export function AppearanceMenu({ theme, style }: { theme: UiTheme; style: UiStyle }) {
  return (
    <div className="flex items-center gap-2">
      <StylePicker current={style} />
      <ThemeToggle current={theme} />
    </div>
  );
}
