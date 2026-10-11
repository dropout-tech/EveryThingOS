import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { SITE_NAV } from "@/lib/commercial";
import { hasChosenIndustry } from "@/lib/workspace";

export async function SiteHeader() {
  const chosen = await hasChosenIndustry();

  return (
    <>
      <a href="#main" className="site-skip site-noprint">
        跳到內容
      </a>
      <header className="glass glass-bar site-scope sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <span className="sm:hidden">
            <BrandMark compact />
          </span>
          <span className="hidden sm:inline-flex">
            <BrandMark />
          </span>
          <nav aria-label="主要" className="hidden items-center gap-6 text-sm text-cream-dim lg:flex">
            {SITE_NAV.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-cream">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex">
              <AppearanceBar />
            </span>
            <Link href={chosen ? "/workspace" : "/"} className="hidden text-sm text-cream-dim hover:text-cream sm:inline">
              {chosen ? "回到今天" : "先看示範"}
            </Link>
            <Link href="/consulting#book" className="glass-cta rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap">
              約免費導入
            </Link>
            <details className="relative lg:hidden">
              <summary className="glass-pill cursor-pointer list-none px-3 py-2 text-sm [&::-webkit-details-marker]:hidden" aria-label="選單">
                選單
              </summary>
              <nav aria-label="主要（手機）" className="site-sheet absolute right-0 mt-2 flex w-56 flex-col p-2 text-sm">
                {SITE_NAV.map((link) => (
                  <Link key={link.href} href={link.href} className="rounded-xl px-3 py-2.5 hover:bg-white/10">
                    {link.label}
                  </Link>
                ))}
                <Link href={chosen ? "/workspace" : "/"} className="rounded-xl px-3 py-2.5 hover:bg-white/10">
                  {chosen ? "回到今天" : "先看示範"}
                </Link>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 pt-3 pb-1 sm:hidden">
                  <span className="text-cream-dim">畫面</span>
                  <AppearanceBar />
                </div>
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
