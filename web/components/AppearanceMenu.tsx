"use client";

import type { UiTheme } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

export function AppearanceMenu({ theme }: { theme: UiTheme }) {
  return <ThemeToggle current={theme} />;
}
