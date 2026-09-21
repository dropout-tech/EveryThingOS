"use client";

import { useEffect } from "react";

export function GlassPointer() {
  useEffect(() => {
    const root = document.documentElement;
    function onMove(event: PointerEvent) {
      const x = window.innerWidth ? (event.clientX / window.innerWidth) * 100 : 30;
      const y = window.innerHeight ? (event.clientY / window.innerHeight) * 100 : 18;
      root.style.setProperty("--glass-px", `${x.toFixed(2)}%`);
      root.style.setProperty("--glass-py", `${y.toFixed(2)}%`);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}
