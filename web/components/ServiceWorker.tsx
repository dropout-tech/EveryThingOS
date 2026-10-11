"use client";

import { useEffect } from "react";

/** Registers public/sw.js, which only serves the offline page. Skipped in `next dev` so stale workers never hide changes. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
