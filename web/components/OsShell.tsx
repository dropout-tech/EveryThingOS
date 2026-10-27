import type { ReactNode } from "react";
import Link from "next/link";
import { ToastRoot } from "./ActionNote";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { SideNav, TabBar } from "./SideNav";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { DEFAULT_BRAND } from "@/lib/brand";
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
  const name = shop.name ?? company ?? industry.nameZh;
  const reset = canReset ? (
    <Link href="/?setup=1" className={buttonClass({ variant: "ghost", size: "sm" })}>
      重設現場
    </Link>
  ) : null;

  return (
    <div className="os-shell flex min-h-screen text-cream" data-brand={shop.brand ?? DEFAULT_BRAND}>
      <a href="#main" className="skip-link">
        跳到內容
      </a>
      <aside className="os-rail sticky top-0 hidden h-screen w-60 shrink-0 flex-col md:flex">
        <div className="flex h-14 items-center px-5">
          <BrandMark href="/workspace" compact />
        </div>
        <p className="nav-section">工作</p>
        <SideNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="os-top sticky top-0 z-30">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-10">
            <p className="flex min-w-0 items-center gap-2.5 text-sm font-semibold" title={name}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal text-xs font-semibold text-ink" aria-hidden="true">
                {name.slice(0, 1)}
              </span>
              <span className="sr-only">公司：</span>
              <span className="truncate">{name}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
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
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] px-4 py-2 text-sm md:px-10 ${notice.urgent ? "text-warn" : "text-cream"}`}
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
