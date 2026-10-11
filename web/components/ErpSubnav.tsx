"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ErpSubnavProps = {
  showSales: boolean;
  showPurchase: boolean;
  showStock: boolean;
  showFinance: boolean;
};

export function ErpSubnav({ showSales, showPurchase, showStock, showFinance }: ErpSubnavProps) {
  const path = usePathname();
  const items = [
    ...(showSales ? [{ href: "/workspace/erp/sales", label: "銷售流水" }] : []),
    ...(showPurchase ? [{ href: "/workspace/erp/purchase", label: "進貨" }] : []),
    ...(showStock ? [{ href: "/workspace/erp/stock", label: "倉庫" }] : []),
    ...(showFinance ? [{ href: "/workspace/erp/finance", label: "收錢" }] : []),
  ];

  if (!items.length) return null;

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = path === item.href || (item.href.endsWith("/sales") && path === "/workspace/erp");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-sm ${
              active ? "glass-cta" : "text-cream-dim hover:text-cream"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
