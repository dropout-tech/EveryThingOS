"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-style"] });
  return () => observer.disconnect();
}

/**
 * True while <html data-style="fluid">. StylePicker flips the attribute before router.refresh(), so effects that
 * paint canvases or follow the pointer stop at once instead of waiting for the server round trip.
 */
export function useFluidStyle() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.style === "fluid",
    () => false,
  );
}
