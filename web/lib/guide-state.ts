"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

/** Who the guide remembers things for: a hash of the logged-in user, or "practice". */
export const GuideScope = createContext<{ scope: string; role: string | null }>({ scope: "practice", role: null });

export function useGuide() {
  return useContext(GuideScope);
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("dropout:guide:")) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeGuide(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the hint just shows again next time */
  }
  listeners.forEach((listener) => listener());
}

export function guideKey(scope: string, name: string) {
  return `dropout:guide:${scope}:${name}`;
}

/**
 * A remembered string for this person. `ready` is false during the server render
 * and the first client render, so callers can render nothing until they know.
 */
export function useGuideValue(name: string) {
  const { scope } = useGuide();
  const key = guideKey(scope, name);
  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? "",
    () => null,
  );
  const set = useCallback((next: string | null) => writeGuide(key, next), [key]);
  return { ready: value !== null, value: value || null, set };
}

export function useGuideFlag(name: string) {
  const { ready, value, set } = useGuideValue(name);
  const on = useCallback(() => set("1"), [set]);
  const off = useCallback(() => set(null), [set]);
  return { ready, set: value === "1", on, off };
}
