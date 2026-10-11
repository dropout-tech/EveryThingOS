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
};

export function OsShell({ industry, shop, children }: OsShellProps) {
  const items = navItemsForShop(shop);

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
            <h1 className="text-base font-medium">{industry.nameZh}</h1>
            <div className="flex items-center gap-3">
              <AppearanceBar />
              <Link href="/?setup=1" className="glass-chip px-3 py-1.5 text-xs">
                重設
              </Link>
            </div>
          </div>
          <div className="border-t border-[var(--line)] md:hidden">
            <SideNav variant="top" items={items} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
