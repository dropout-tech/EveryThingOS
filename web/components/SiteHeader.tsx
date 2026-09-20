import Link from "next/link";
import { BrandMark } from "./BrandMark";

const links = [
  { href: "/industries", label: "一百產業" },
  { href: "/saas", label: "取代 SaaS" },
  { href: "/pricing", label: "一年十萬" },
  { href: "/consulting", label: "免費導入" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:rgb(26_22_18_/_0.92)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <BrandMark />
        <nav className="hidden items-center gap-6 text-sm text-cream-dim md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-teal">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/workspace"
          className="rounded-full bg-teal px-4 py-2 text-sm font-medium text-ink hover:bg-teal-deep"
        >
          進入作業系統
        </Link>
      </div>
    </header>
  );
}
