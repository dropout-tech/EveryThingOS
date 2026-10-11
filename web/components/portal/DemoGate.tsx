"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DEMO_TRACK_PREFIX, readDemoTrack, writeDemoTrack } from "@/lib/portal";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Demo only. Counts this view in the browser so the salesperson's 客戶入口 tab
 * shows 「看過 N 次」, and honours a revoke made in that tab. Demo links have no
 * server state, so this only works in the same browser, which is the point of a demo.
 */
export function DemoGate({ linkId, revoked, children }: { linkId: string; revoked: ReactNode; children: ReactNode }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(DEMO_TRACK_PREFIX + linkId),
    () => null,
  );
  const isRevoked = Boolean(raw && readDemoTrack(linkId).revokedAt);

  useEffect(() => {
    if (readDemoTrack(linkId).revokedAt) return;
    const at = new Date().toISOString();
    writeDemoTrack(linkId, (t) => ({ ...t, views: (t.views ?? 0) + 1, firstViewedAt: t.firstViewedAt ?? at, lastViewedAt: at }));
  }, [linkId]);

  return isRevoked ? revoked : children;
}
