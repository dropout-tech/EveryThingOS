import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { COMMERCIAL, PRICE_LABEL, SITE_NAV } from "@/lib/commercial";
import { LEGAL_LINKS } from "@/lib/legal";

const SUPPORT = [
  { href: "/help", label: "說明中心" },
  { href: "/status", label: "系統狀態" },
] as const;

export function SiteFooter() {
  return (
    <footer className="glass glass-bar site-scope site-noprint mt-8 px-5 py-10 text-sm text-cream-dim">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandMark href="/" />
          <p className="mt-3">{COMMERCIAL.legalName}</p>
          <p className="mt-1">{PRICE_LABEL}（未稅）· 免費顧問導入</p>
        </div>
        <nav aria-label="產品">
          <p className="text-xs tracking-[0.18em] text-cream">產品</p>
          <ul className="mt-3 space-y-2">
            {SITE_NAV.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-cream">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="支援">
          <p className="text-xs tracking-[0.18em] text-cream">支援</p>
          <ul className="mt-3 space-y-2">
            {SUPPORT.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-cream">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={`mailto:${COMMERCIAL.email}`} className="hover:text-cream">
                {COMMERCIAL.email}
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="條款與政策">
          <p className="text-xs tracking-[0.18em] text-cream">條款與政策</p>
          <ul className="mt-3 space-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-cream">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
