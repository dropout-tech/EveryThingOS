import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { AppearanceBar } from "./AppearanceBar";
import { IndustrySwitcher } from "./IndustrySwitcher";
import { SideNav } from "./SideNav";
import { listIndustries } from "@/lib/industries";
import type { IndustryPack } from "@/lib/types";

type OsShellProps = {
  industry: IndustryPack;
  children: ReactNode;
};

export async function OsShell({ industry, children }: OsShellProps) {
  const industries = listIndustries();

  return (
    <div className="flex min-h-screen text-cream">
      <aside className="glass glass-nav sticky top-0 hidden h-screen w-56 shrink-0 flex-col md:flex">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <BrandMark href="/workspace" compact />
        </div>
        <SideNav />
        <p className="px-4 py-3 text-[11px] leading-5 text-cream-dim">
          全模組已套琢奧識別。底層仍是開源組裝，員工只看到 DropOut OS。
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass glass-bar sticky top-0 z-30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="display text-xs tracking-[0.2em] text-teal uppercase">DropOut OS</p>
              <h1 className="text-base font-medium">
                {industry.nameZh}
                <span className="ml-2 text-xs text-cream-dim">{industry.code}</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <AppearanceBar />
              <IndustrySwitcher current={industry} options={industries} />
              <Link href="/" className="text-xs text-cream-dim hover:text-teal">
                回介紹
              </Link>
            </div>
          </div>
          <div className="border-t border-[var(--line)] md:hidden">
            <SideNav variant="top" />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
