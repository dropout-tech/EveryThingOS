import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { IndustryPicker, type IndustryChoice } from "./IndustryPicker";
import { PRICE_LABEL, PRICE_NOTE } from "@/lib/commercial";

export function PickIndustryScreen({ options }: { options: IndustryChoice[] }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass glass-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <BrandMark href="/" />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="hidden text-sm text-cream-dim hover:text-cream sm:inline">
              {PRICE_LABEL.replace("每年 ", "")}
            </Link>
            <AppearanceBar />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 py-24">
        <article className="glass glass-hero w-full p-8 md:p-10">
          <h1 className="text-4xl leading-[1.12] font-medium md:text-5xl">你做哪一行。</h1>
          <div className="mt-8">
            <IndustryPicker options={options} variant="hero" />
          </div>
          <p className="mt-6 text-xs text-cream-dim">{PRICE_NOTE}</p>
        </article>
      </main>
    </div>
  );
}
