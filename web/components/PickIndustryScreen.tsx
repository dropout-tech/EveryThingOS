import Link from "next/link";
import { AppearanceBar } from "./AppearanceBar";
import { BrandMark } from "./BrandMark";
import { IndustryPicker, type IndustryChoice } from "./IndustryPicker";

export function PickIndustryScreen({ options }: { options: IndustryChoice[] }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass glass-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <BrandMark />
          <AppearanceBar />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 items-end px-5 pb-16 pt-24 md:items-center">
        <article className="glass glass-hero w-full p-8 md:p-10">
          <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">先這一步</p>
          <h1 className="mt-3 text-3xl font-medium md:text-4xl">先選你做哪一行</h1>
          <p className="mt-3 text-sm text-cream-dim">
            一百種現場不一樣。選了，今天要做的三件事才會變成你的話，而不是別人的催收與發票。
          </p>
          <div className="mt-6">
            <IndustryPicker options={options} variant="hero" />
          </div>
          <p className="mt-4 text-xs text-cream-dim">
            選錯也沒關係，進去右上角再換。
            <Link href="/" className="ml-2 underline">
              回介紹
            </Link>
          </p>
        </article>
      </main>
    </div>
  );
}
