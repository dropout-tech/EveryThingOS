"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "./ModuleFrame";
import { Badge } from "./ui/Badge";

type ErpSubnavProps = {
  showSales: boolean;
  showPurchase: boolean;
  showStock: boolean;
  showFinance: boolean;
  live?: boolean;
  note?: string;
};

const HEADERS: Record<string, { title: string; hint?: string }> = {
  "/workspace/erp/sales": { title: "同一張單往下走", hint: "報價、訂單、出貨、發票、收款排成一列，每張卡只有下一步。" },
  "/workspace/erp/purchase": { title: "跟廠商進貨", hint: "請購 → 進貨 → 入庫 → 付款，同一條往下走。" },
  "/workspace/erp/stock": { title: "貨夠不夠", hint: "低於安全量的先補，按一下就變成請購。" },
  "/workspace/erp/finance": { title: "誰欠我們、稅多少", hint: "帳齡、損益、電子發票都在這一頁；開單就入帳。" },
  "/workspace/erp/compare": { title: "對照 A1／億看" },
};

export function ErpSubnav({ showSales, showPurchase, showStock, showFinance, live = false, note }: ErpSubnavProps) {
  const path = usePathname();
  const items = [
    ...(showSales ? [{ href: "/workspace/erp/sales", label: "銷售" }] : []),
    ...(showStock ? [{ href: "/workspace/erp/stock", label: "庫存" }] : []),
    ...(showPurchase ? [{ href: "/workspace/erp/purchase", label: "採購" }] : []),
    ...(showFinance ? [{ href: "/workspace/erp/finance", label: "收錢" }] : []),
  ];
  const header = HEADERS[path === "/workspace/erp" ? "/workspace/erp/sales" : path];

  return (
    <>
      {header ? <PageHeader kicker="生意" title={header.title} hint={header.hint} badge={live ? <Badge tone="ok">已接 ERPNext</Badge> : <Badge tone="practice" />} /> : null}
      <div className="toolbar justify-between">
        {items.length > 1 ? (
          <nav className="segmented" aria-label="生意的四段">
            {items.map((item) => {
              const active = path === item.href || (item.href.endsWith("/sales") && path === "/workspace/erp");
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        {note ? <p className="text-xs text-cream-dim">{note}</p> : null}
      </div>
    </>
  );
}
