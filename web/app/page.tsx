import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { COMMERCIAL, PRICE_LABEL, PRICE_NOTE } from "@/lib/commercial";
import { DAILY_FLOW } from "@/lib/flow";
import { listIndustries } from "@/lib/industries";

export default function HomePage() {
  const count = listIndustries().length;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto flex min-h-[86vh] max-w-6xl items-end px-5 pb-16 pt-28 md:items-center md:pt-24">
          <article className="glass glass-hero max-w-xl p-8 md:p-10">
            <p className="display text-xs tracking-[0.28em] text-cream-dim uppercase">
              {COMMERCIAL.legalName} · DropOut OS
            </p>
            <h1 className="mt-4 text-4xl leading-[1.12] font-medium md:text-5xl">
              打開就知道下一步。
            </h1>
            <p className="mt-4 text-base text-cream-dim">
              回覆留言、跟客人、做生意、收錢。對齊鼎新 A1／億看的進銷存，不必先背單據名稱。
              {count} 個產業包，{PRICE_LABEL}。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/workspace" className="glass-cta rounded-full px-6 py-3 font-medium">
                開始今天的生意
              </Link>
              <Link href="/workspace/erp/compare" className="text-sm text-cream-dim hover:text-cream">
                和 A1／億看對照
              </Link>
            </div>
            <p className="mt-4 text-xs text-cream-dim">{PRICE_NOTE}</p>
          </article>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <p className="scene-type display text-xs tracking-[0.22em] uppercase">每天這條路</p>
          <h2 className="scene-type mt-2 text-3xl font-medium">四步，不要九個選單。</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DAILY_FLOW.map((step, index) => (
              <li key={step.href}>
                <Link href={step.href} className="glass glass-lift block h-full p-6">
                  <p className="display text-xs text-cream-dim">0{index + 1}</p>
                  <h3 className="mt-3 text-2xl font-medium">{step.label}</h3>
                  <p className="mt-2 text-sm text-cream-dim">{step.hint}</p>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 md:grid-cols-2">
          <article className="glass p-8">
            <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">年費</p>
            <h2 className="mt-3 text-2xl">{PRICE_LABEL}</h2>
            <p className="mt-3 text-cream-dim">含每天使用與顧問到現場。不收人頭費、不另外加購功能。</p>
            <Link href="/pricing" className="mt-6 inline-block text-sm text-cream hover:underline">
              看費用怎麼算
            </Link>
          </article>
          <article className="glass p-8">
            <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">導入</p>
            <h2 className="mt-3 text-2xl">顧問去現場，不另開帳單</h2>
            <p className="mt-3 text-cream-dim">打開最接近的產業包，用真實資料跑完一筆生意。</p>
            <Link href="/consulting" className="mt-6 inline-block text-sm text-cream hover:underline">
              導入怎麼走
            </Link>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
