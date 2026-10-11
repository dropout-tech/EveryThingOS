import Link from "next/link";
import { platformEnabled, platformOperator } from "@/lib/platform";

export const metadata = { title: "DropOut OS 營運" };

export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const operator = await platformOperator();
  if (!operator) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6 text-cream">
        <h1 className="text-xl">營運後台</h1>
        <p className="text-cream-dim">
          {platformEnabled() ? "請用 DropOut 營運帳號經 Cloudflare Access 登入。" : "這個部署沒有開營運後台。"}
        </p>
      </main>
    );
  }
  return (
    <div className="min-h-screen p-4 text-cream md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/platform" className="text-lg">
          DropOut OS 營運
        </Link>
        <span className="text-xs text-cream-dim">{operator}</span>
      </header>
      {children}
    </div>
  );
}
