"use client";

import { useEffect } from "react";
import { useFluidStyle } from "./styles/fluid/useFluidStyle";

export function GlassPointer() {
  const fluid = useFluidStyle();

  useEffect(() => {
    if (!fluid || window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    function onMove(event: PointerEvent) {
      const node = (event.target as Element | null)?.closest?.(".lens, .glass");
      if (!(node instanceof HTMLElement)) return;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      node.style.setProperty("--glass-px", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`);
      node.style.setProperty("--glass-py", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [fluid]);

  return null;
}
