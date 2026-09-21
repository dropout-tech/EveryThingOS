"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const work = [
  { href: "/workspace", label: "今天" },
  { href: "/workspace/crm", label: "客人" },
  { href: "/workspace/erp", label: "生意" },
  { href: "/workspace/reply", label: "回覆" },
];

const channels = [
  { href: "/workspace/funnel", label: "魅力圈" },
  { href: "/workspace/hygiene", label: "清庫" },
  { href: "/workspace/links", label: "短網址" },
  { href: "/workspace/website", label: "官網" },
];

const settings = [{ href: "/workspace/settings", label: "設定" }];

function isActive(path: string, href: string) {
  if (href === "/workspace/erp") return path.startsWith("/workspace/erp");
  return path === href;
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

export function SideNav({ variant = "side" }: { variant?: "side" | "top" }) {
  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-sm" aria-label="作業系統">
        <NavLinks items={[...work, ...channels, ...settings]} variant="top" />
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-5 p-3 text-sm" aria-label="作業系統">
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] tracking-[0.18em] text-cream-dim uppercase">做事</p>
        <NavLinks items={work} variant="side" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] tracking-[0.18em] text-cream-dim uppercase">通道</p>
        <NavLinks items={channels} variant="side" />
      </div>
      <div className="mt-auto flex flex-col gap-1">
        <NavLinks items={settings} variant="side" />
      </div>
    </nav>
  );
}
