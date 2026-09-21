import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { COMMERCIAL, PRICE_LABEL } from "@/lib/commercial";

export function SiteFooter() {
  return (
    <footer className="glass glass-bar mt-8 px-5 py-10 text-sm text-cream-dim">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <BrandMark href="/" />
          <p className="mt-3">
            {COMMERCIAL.legalName} · {PRICE_LABEL} · 免費顧問導入
          </p>
        </div>
        <div className="flex gap-5">
          <Link href="/industries" className="hover:text-teal">
            產業包
          </Link>
          <Link href="/pricing" className="hover:text-teal">
            定價
          </Link>
          <a href={`mailto:${COMMERCIAL.email}`} className="hover:text-teal">
            {COMMERCIAL.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
