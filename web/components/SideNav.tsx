"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DayStep } from "@/lib/operator-day";

const channels = [
  { href: "/workspace/funnel", label: "把人帶來" },
  { href: "/workspace/hygiene", label: "擋假信" },
  { href: "/workspace/links", label: "短網址" },
  { href: "/workspace/website", label: "官網" },
];

const settings = [{ href: "/workspace/settings", label: "設定" }];

function isActive(path: string, href: string) {
  if (href === "/workspace") return path === "/workspace";
  if (href === "/workspace/erp") return path.startsWith("/workspace/erp");
  return path === href || path.startsWith(`${href}/`);
}

function NavLinks({
  items,
  variant,
}: {
  items: { href: string; label: string }[];
  variant: "side" | "top";
}) {
  const path = usePathname();

  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={
        variant === "top"
          ? `shrink-0 rounded-full px-3 py-1.5 ${isActive(path, item.href) ? "glass-cta" : "text-cream-dim"}`
          : `rounded-2xl px-3 py-2 ${isActive(path, item.href) ? "glass-cta" : "text-cream-dim hover:text-cream"}`
      }
    >
      {item.label}
    </Link>
  ));
}

export function SideNav({
  variant = "side",
  steps,
}: {
  variant?: "side" | "top";
  steps: DayStep[];
}) {
  const work = [{ href: "/workspace", label: "今天" }, ...steps.map((step) => ({ href: step.href, label: step.label }))];

  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-sm" aria-label="工作選單">
        <NavLinks items={[...work, { href: "/workspace/settings", label: "設定" }]} variant="top" />
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-5 p-3 text-sm" aria-label="工作選單">
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] tracking-[0.18em] text-cream-dim uppercase">今天這條</p>
        <NavLinks items={work} variant="side" />
      </div>
      <details className="group px-1">
        <summary className="cursor-pointer list-none rounded-2xl px-3 py-2 text-cream-dim hover:text-cream [&::-webkit-details-marker]:hidden">
          對外
          <span className="ml-2 text-[11px] opacity-70">官網、信、短網址</span>
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          <NavLinks items={channels} variant="side" />
        </div>
      </details>
      <div className="mt-auto flex flex-col gap-1">
        <NavLinks items={settings} variant="side" />
      </div>
    </nav>
  );
}
