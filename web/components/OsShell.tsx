import type { ReactNode } from "react";
import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { SideNav } from "./SideNav";
import { navItemsForShop, type ShopProfile } from "@/lib/shop";
import type { IndustryPack } from "@/lib/types";

type OsShellProps = {
  industry: IndustryPack;
  shop: ShopProfile;
  children: ReactNode;
  company?: string;
  team?: boolean;
  reports?: boolean;
  /** Contract notice (trial, renewal, read-only). */
  notice?: { message: string; urgent: boolean; payUrl?: string } | null;
  canReset?: boolean;
};

export function OsShell({ industry, shop, children, company, team = false, reports = false, notice, canReset = true }: OsShellProps) {
  const items = navItemsForShop(shop, { team, reports });

  return (
    <div className="flex min-h-screen text-cream">
      <aside className="glass glass-nav sticky top-0 hidden h-screen w-52 shrink-0 flex-col md:flex">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <BrandMark href="/workspace" compact />
        </div>
        <SideNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass glass-bar sticky top-0 z-30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <h1 className="text-base font-medium">{company ?? industry.nameZh}</h1>
            <div className="flex items-center gap-3">
              <Link href="/help" className="glass-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs" aria-label="說明中心">
                <span aria-hidden className="font-medium">?</span>
                說明
              </Link>
              <AppearanceBar />
              {canReset ? (
                <Link href="/?setup=1" className="glass-chip px-3 py-1.5 text-xs">
                  重設
                </Link>
              ) : null}
            </div>
          </div>
          <div className="border-t border-[var(--line)] md:hidden">
            <SideNav variant="top" items={items} />
          </div>
          {notice ? (
            <p role="status" className={`border-t border-[var(--line)] px-4 py-2 text-sm ${notice.urgent ? "text-orange" : "text-cream-dim"}`}>
              {notice.message}{" "}
              <Link href="/workspace/settings#plan" className="underline">
                看方案
              </Link>
              {notice.payUrl ? (
                <>
                  {" "}
                  <a href={notice.payUrl} className="glass-cta ml-2 inline-block rounded-full px-3 py-0.5 text-xs">
                    線上付款
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
