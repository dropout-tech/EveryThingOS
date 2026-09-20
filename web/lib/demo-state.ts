"use client";

import { useCallback, useSyncExternalStore } from "react";

const memory = new Map<string, unknown>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function readSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = sessionStorage.getItem(key);
    const value = raw ? (JSON.parse(raw) as T) : fallback;
    memory.set(key, value);
    return value;
  } catch {
    memory.set(key, fallback);
    return fallback;
  }
}

export function demoKey(kind: string, packId: string) {
  return `dropout:${kind}:${packId}`;
}

export function writeDemoState<T>(key: string, value: T) {
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* demo-only; quota should not crash the board */
  }
  emit();
}

export function peekDemoState<T>(key: string, fallback: T): T {
  return readSession(key, fallback);
}

export function useDemoState<T>(key: string, initial: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => readSession(key, initial),
    () => initial,
  );

  const save = useCallback(
    (next: T | ((prev: T) => T)) => {
      const previous = readSession(key, initial);
      const resolved = typeof next === "function" ? (next as (current: T) => T)(previous) : next;
      writeDemoState(key, resolved);
    },
    [key, initial],
  );

  return [value, save] as const;
}
