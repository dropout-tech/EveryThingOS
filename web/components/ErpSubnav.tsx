"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ErpSubnavProps = {
  showStock: boolean;
};

export function ErpSubnav({ showStock }: ErpSubnavProps) {
  const path = usePathname();
  const items = [
    { href: "/workspace/erp", label: "一眼看懂" },
    { href: "/workspace/erp/sales", label: "銷售流水" },
    { href: "/workspace/erp/purchase", label: "採購入庫" },
    ...(showStock ? [{ href: "/workspace/erp/stock", label: "倉庫" }] : []),
    { href: "/workspace/erp/finance", label: "帳款與稅" },
    { href: "/workspace/erp/compare", label: "對照 A1／億看" },
  ];

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = path === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-sm ${
              active ? "bg-teal text-ink" : "border border-[var(--line)] text-cream-dim hover:text-teal"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
