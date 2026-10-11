"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbTrail } from "@/lib/nav";

/** 今天 / 生意 / 收錢 — every crumb but the last is a way back. Falls back to the kicker on unknown paths. */
export function Breadcrumbs({ fallback }: { fallback?: string }) {
  const path = usePathname();
  const trail = breadcrumbTrail(path);
  if (trail.length < 2) return fallback ? <p className="kicker scene-type">{fallback}</p> : null;

  return (
    <nav aria-label="目前位置" className="breadcrumbs scene-type">
      <ol>
        {trail.map((crumb, index) =>
          index === trail.length - 1 ? (
            <li key={crumb.href}>
              <span aria-current="page">{crumb.label}</span>
            </li>
          ) : (
            <li key={crumb.href}>
              <Link href={crumb.href}>{crumb.label}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
