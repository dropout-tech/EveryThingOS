import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { IndustrySwitcher } from "./IndustrySwitcher";
import { listIndustries } from "@/lib/industries";
import type { IndustryPack } from "@/lib/types";

const nav = [
  { href: "/workspace", label: "總覽" },
  { href: "/workspace/crm", label: "CRM" },
  { href: "/workspace/erp", label: "ERP" },
  { href: "/workspace/funnel", label: "魅力圈" },
  { href: "/workspace/hygiene", label: "清庫" },
  { href: "/workspace/links", label: "短網址" },
  { href: "/workspace/website", label: "官網" },
  { href: "/workspace/settings", label: "設定" },
];

type OsShellProps = {
  industry: IndustryPack;
  children: ReactNode;
};

export function OsShell({ industry, children }: OsShellProps) {
  const industries = listIndustries();

  return (
    <div className="flex min-h-screen bg-ink text-cream">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--line)] bg-ink-2 md:flex">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <BrandMark href="/workspace" compact />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-cream-dim hover:bg-ink hover:text-teal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="px-4 py-3 text-[11px] leading-5 text-cream-dim">
          全模組已套琢奧識別。底層仍是開源組裝，員工只看到 DropOut OS。
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="display text-xs tracking-[0.2em] text-teal uppercase">DropOut OS</p>
            <h1 className="text-base font-medium">
              {industry.nameZh}
              <span className="ml-2 text-xs text-cream-dim">{industry.code}</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <IndustrySwitcher current={industry} options={industries} />
            <Link href="/" className="text-xs text-cream-dim hover:text-teal">
              回介紹
            </Link>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
