import type { ReactNode } from "react";
import Link from "next/link";
import { ToastRoot } from "./ActionNote";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { SideNav, TabBar } from "./SideNav";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
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
  notice?: { message: string; urgent: boolean; readOnly?: boolean; payUrl?: string } | null;
  canReset?: boolean;
};

export function OsShell({ industry, shop, children, company, team = false, reports = false, notice, canReset = true }: OsShellProps) {
  const items = navItemsForShop(shop, { team, reports });
  const reset = canReset ? (
    <Link href="/?setup=1" className={buttonClass({ variant: "ghost", size: "sm" })}>
      重設現場
    </Link>
  ) : null;

  return (
    <div className="os-shell flex min-h-screen text-cream">
      <a href="#main" className="skip-link">
        跳到內容
      </a>
      <aside className="os-rail sticky top-0 hidden h-screen w-56 shrink-0 flex-col md:flex">
        <div className="border-b border-[var(--paper-line)] px-4 py-4">
          <BrandMark href="/workspace" compact />
        </div>
        <SideNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="os-top sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-8">
            <p className="min-w-0 truncate text-sm font-medium md:text-base" title={company ?? industry.nameZh}>
              <span className="sr-only">公司：</span>
              {company ?? industry.nameZh}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/help" className={buttonClass({ variant: "ghost", size: "sm" })}>
                <span aria-hidden className="font-medium">?</span>
                說明
              </Link>
              <AppearanceBar />
              <span className="hidden md:inline-flex">{reset}</span>
            </div>
          </div>
          {notice ? (
            <div
              role="status"
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--paper-line)] px-4 py-2 text-sm md:px-8 ${notice.urgent ? "text-warn" : "text-cream"}`}
            >
              {notice.readOnly ? <Badge tone="readonly" /> : null}
              <span className="min-w-0 flex-1">{notice.message}</span>
              <span className="flex items-center gap-2">
                <Link href="/workspace/settings#plan" className={buttonClass({ variant: "ghost", size: "sm" })}>
                  看方案
                </Link>
                {notice.payUrl ? (
                  <a href={notice.payUrl} className={buttonClass({ variant: "primary", size: "sm" })}>
                    線上付款
                  </a>
                ) : null}
              </span>
            </div>
          ) : null}
        </header>
        <main id="main" tabIndex={-1} className="os-sheet flex-1 outline-none">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <TabBar items={items} extras={reset} />
      <ToastRoot />
    </div>
  );
}
