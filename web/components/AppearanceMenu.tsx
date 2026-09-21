"use client";

import { useEffect, useRef, useState } from "react";
import { ScenePicker } from "./ScenePicker";
import { ThemeToggle } from "./ThemeToggle";
import type { UiScene } from "@/lib/scene";
import type { UiTheme } from "@/lib/theme";

export function AppearanceMenu({ theme, scene }: { theme: UiTheme; scene: UiScene }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div ref={root}>
      <button
        type="button"
        className="glass-chip px-3 py-1.5 text-xs"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        外觀
      </button>
      {open ? (
        <div className="glass fixed top-16 right-4 z-[60] flex min-w-[12.5rem] flex-col gap-3 p-3 md:right-6">
          <p className="text-[11px] tracking-[0.16em] text-cream-dim uppercase">顏色</p>
          <ThemeToggle current={theme} />
          <p className="text-[11px] tracking-[0.16em] text-cream-dim uppercase">風景</p>
          <ScenePicker current={scene} />
        </div>
      ) : null}
    </div>
  );
}
