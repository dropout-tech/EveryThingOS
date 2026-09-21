import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { OnboardCard } from "./OnboardCard";

export function OnboardScreen() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass glass-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <BrandMark href="/" />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="hidden text-sm text-cream-dim hover:text-cream sm:inline">
              NT$100,000
            </Link>
            <AppearanceBar />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 py-20">
        <OnboardCard />
      </main>
    </div>
  );
}
