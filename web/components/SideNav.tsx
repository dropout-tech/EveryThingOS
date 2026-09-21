"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/workspace", label: "今天" },
  { href: "/workspace/crm", label: "客人" },
  { href: "/workspace/erp", label: "生意" },
  { href: "/workspace/funnel", label: "魅力圈" },
  { href: "/workspace/hygiene", label: "清庫" },
  { href: "/workspace/links", label: "短網址" },
  { href: "/workspace/website", label: "官網" },
  { href: "/workspace/settings", label: "設定" },
];

function isActive(path: string, href: string) {
  if (href === "/workspace/erp") return path.startsWith("/workspace/erp");
  return path === href;
}

export function SideNav({ variant = "side" }: { variant?: "side" | "top" }) {
  const path = usePathname();

  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-sm">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1.5 ${
              isActive(path, item.href) ? "glass-cta" : "text-cream-dim"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3 text-sm">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-2xl px-3 py-2 ${
            isActive(path, item.href) ? "glass-cta" : "text-cream-dim hover:text-cream"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
