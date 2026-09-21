import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";
import { currentTheme } from "@/lib/theme-server";

const links = [
  { href: "/industries", label: "一百產業" },
  { href: "/saas", label: "取代 SaaS" },
  { href: "/pricing", label: "一年十萬" },
  { href: "/consulting", label: "免費導入" },
];

export async function SiteHeader() {
  const theme = await currentTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-ink/90 backdrop-blur">
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
          <ThemeToggle current={theme} />
          <Link href="/workspace" className="rounded-full bg-teal px-4 py-2 text-sm font-medium text-ink hover:bg-teal-deep">
            進入作業系統
          </Link>
        </div>
      </div>
    </header>
  );
}
