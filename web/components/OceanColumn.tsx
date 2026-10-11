"use client";

import { useEffect } from "react";
import { useFluidStyle } from "./styles/fluid/useFluidStyle";

export function OceanColumn() {
  const fluid = useFluidStyle();

  useEffect(() => {
    const root = document.documentElement;
    if (!fluid || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;

    function write() {
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      const t = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty("--ocean-y", `${(t * 100).toFixed(2)}%`);
    }

    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        write();
      });
    }

    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--ocean-y");
    };
  }, [fluid]);

  return null;
}
