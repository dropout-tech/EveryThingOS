import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";

const links = [
  { href: "/industries", label: "一百產業" },
  { href: "/saas", label: "取代 SaaS" },
  { href: "/pricing", label: "一年十萬" },
  { href: "/consulting", label: "免費導入" },
];

export async function SiteHeader() {
  return (
    <header className="glass glass-bar sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <BrandMark />
        <nav className="hidden items-center gap-6 text-sm text-cream-dim md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-teal">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <AppearanceBar />
          <Link href="/workspace" className="glass-cta rounded-full px-4 py-2 text-sm font-medium">
            進入作業系統
          </Link>
        </div>
      </div>
    </header>
  );
}
