"use client";

import { useEffect } from "react";
import { useFluidStyle } from "./useFluidStyle";

const LITE_QUERY = "(pointer: coarse), (prefers-reduced-transparency: reduce), (max-width: 767px)";
const STILL_QUERY = "(prefers-reduced-motion: reduce)";
const RIPPLE_TARGETS = ".btn-primary, .glass-cta, .segmented a";

/**
 * Drives the fluid backdrop: scroll depth (0 at the surface, 1 at the seabed), pausing while the tab is hidden,
 * a lite flag for phones and slow machines, and the ripple on primary actions. Everything else is CSS.
 */
export function FluidMotion() {
  const fluid = useFluidStyle();

  useEffect(() => {
    if (!fluid) return;
    const root = document.documentElement;
    const still = window.matchMedia(STILL_QUERY);
    const liteQuery = window.matchMedia(LITE_QUERY);
    let frame = 0;
    let lastDepth = -1;

    function syncLite() {
      const lite = liteQuery.matches || (navigator.hardwareConcurrency || 8) <= 4;
      root.toggleAttribute("data-fluid-lite", lite);
    }

    function writeDepth() {
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      const depth = Math.round(Math.min(1, Math.max(0, window.scrollY / max)) * 100) / 100;
      if (depth === lastDepth) return;
      lastDepth = depth;
      root.style.setProperty("--fluid-depth", String(depth));
    }

    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writeDepth();
      });
    }

    function onVisibility() {
      root.toggleAttribute("data-fluid-paused", document.hidden);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || still.matches) return;
      const target = (event.target as Element | null)?.closest?.(RIPPLE_TARGETS);
      if (!(target instanceof HTMLElement) || target.matches(":disabled, [aria-disabled='true']")) return;
      const rect = target.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      target.style.setProperty("--ripple-x", `${(event.clientX - rect.left).toFixed(1)}px`);
      target.style.setProperty("--ripple-y", `${(event.clientY - rect.top).toFixed(1)}px`);
      target.style.setProperty("--ripple-size", `${size.toFixed(0)}px`);
      // Alternating names restart the keyframes without forcing a reflow.
      target.dataset.fluidRipple = target.dataset.fluidRipple === "a" ? "b" : "a";
    }

    function onAnimationEnd(event: AnimationEvent) {
      if (!event.animationName.startsWith("fluid-ripple")) return;
      const target = event.target;
      if (target instanceof HTMLElement) delete target.dataset.fluidRipple;
    }

    syncLite();
    writeDepth();
    onVisibility();
    liteQuery.addEventListener("change", syncLite);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("animationend", onAnimationEnd);

    return () => {
      liteQuery.removeEventListener("change", syncLite);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("animationend", onAnimationEnd);
      if (frame) window.cancelAnimationFrame(frame);
      root.removeAttribute("data-fluid-lite");
      root.removeAttribute("data-fluid-paused");
      root.style.removeProperty("--fluid-depth");
    };
  }, [fluid]);

  return null;
}
