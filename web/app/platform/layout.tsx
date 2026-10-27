import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { platformEnabled, platformOperator } from "@/lib/platform";

export const metadata = { title: "營運後台", robots: { index: false, follow: false } };

export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const operator = await platformOperator();
  if (!operator) {
    return (
      <main className="site-scope mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6 text-cream">
        <div className="site-sheet space-y-3 p-6">
          <h1 className="text-xl font-medium">營運後台</h1>
          <p className="text-cream-dim">
            {platformEnabled() ? "請用 DropOut 營運帳號經 Cloudflare Access 登入。" : "這個部署沒有開營運後台。"}
          </p>
        </div>
      </main>
    );
  }
  return (
    <div className="site-scope min-h-screen bg-ink text-cream">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-4">
            <BrandMark href="/platform" compact />
            <Link href="/platform" className="text-sm font-medium hover:underline">
              營運後台
            </Link>
          </div>
          <span className="text-xs text-cream-dim">{operator}</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[96rem] p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
