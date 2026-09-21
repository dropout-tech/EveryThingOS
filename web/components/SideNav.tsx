"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(path: string, href: string) {
  if (href === "/workspace") return path === "/workspace";
  if (href === "/workspace/erp/sales") return path === href || path === "/workspace/erp";
  return path === href || path.startsWith(`${href}/`);
}

export function SideNav({
  items,
  variant = "side",
}: {
  items: { href: string; label: string }[];
  variant?: "side" | "top";
}) {
  const path = usePathname();

  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-sm" aria-label="工作選單">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1.5 ${isActive(path, item.href) ? "glass-cta" : "text-cream-dim"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3 text-sm" aria-label="工作選單">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-2xl px-3 py-2 ${isActive(path, item.href) ? "glass-cta" : "text-cream-dim hover:text-cream"} ${
            item.href === "/workspace/settings" ? "mt-auto" : ""
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
