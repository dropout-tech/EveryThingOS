import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { AppearanceBar } from "./AppearanceBar";
import { IndustryPicker } from "./IndustryPicker";
import { SideNav } from "./SideNav";
import { listIndustryChoices } from "@/lib/industries";
import { industryDayPath } from "@/lib/operator-day";
import type { IndustryPack } from "@/lib/types";

type OsShellProps = {
  industry: IndustryPack;
  children: ReactNode;
};

export async function OsShell({ industry, children }: OsShellProps) {
  const industries = listIndustryChoices();
  const steps = industryDayPath(industry);

  return (
    <div className="flex min-h-screen text-cream">
      <aside className="glass glass-nav sticky top-0 hidden h-screen w-56 shrink-0 flex-col md:flex">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <BrandMark href="/workspace" compact />
        </div>
        <SideNav steps={steps} />
        <p className="px-4 py-3 text-[11px] leading-5 text-cream-dim">左邊照這個行業的順序做。官網、信件要再用再打開。</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass glass-bar sticky top-0 z-30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="display text-xs tracking-[0.2em] text-teal uppercase">DropOut OS</p>
              <h1 className="text-base font-medium">{industry.nameZh}</h1>
            </div>
            <div className="flex items-center gap-3">
              <AppearanceBar />
              <IndustryPicker currentId={industry.id} options={industries} variant="compact" />
              <Link href="/" className="text-xs text-cream-dim hover:text-cream">
                介紹
              </Link>
            </div>
          </div>
          <div className="border-t border-[var(--line)] md:hidden">
            <SideNav variant="top" steps={steps} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
