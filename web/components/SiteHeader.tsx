import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { PRICE_LABEL } from "@/lib/commercial";
import { hasChosenIndustry } from "@/lib/workspace";

const links = [{ href: "/pricing", label: PRICE_LABEL.replace("每年 ", "") }];

export async function SiteHeader() {
  const chosen = await hasChosenIndustry();

  return (
    <header className="glass glass-bar sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <BrandMark />
        <nav className="hidden items-center gap-6 text-sm text-cream-dim md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-cream">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <AppearanceBar />
          <Link
            href={chosen ? "/workspace" : "/"}
            className="glass-cta rounded-full px-4 py-2 text-sm font-medium"
          >
            {chosen ? "今天" : "開始"}
          </Link>
        </div>
      </div>
    </header>
  );
}
