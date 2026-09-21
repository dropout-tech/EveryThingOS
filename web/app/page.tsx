import Link from "next/link";
import { IndustryPicker } from "@/components/IndustryPicker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { COMMERCIAL, PRICE_LABEL, PRICE_NOTE } from "@/lib/commercial";
import { listIndustries, listIndustryChoices } from "@/lib/industries";
import { industryDayPath } from "@/lib/operator-day";
import { hasChosenIndustry, currentIndustry } from "@/lib/workspace";

export default async function HomePage() {
  const count = listIndustries().length;
  const options = listIndustryChoices();
  const chosen = await hasChosenIndustry();
  const pack = chosen ? await currentIndustry() : null;
  const steps = pack ? industryDayPath(pack) : [];

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto flex min-h-[100svh] max-w-6xl items-end px-5 pb-20 pt-28 md:items-center md:pt-24">
          <article className="glass glass-hero w-full max-w-xl p-8 md:p-10">
            <p className="display text-xs tracking-[0.28em] text-cream-dim uppercase">
              {COMMERCIAL.legalName} · DropOut OS
            </p>
            <h1 className="mt-4 text-4xl leading-[1.12] font-medium md:text-5xl">先告訴我你做哪一行。</h1>
            <p className="mt-4 text-base text-cream-dim">
              一百種現場，不能共用同一張「催收、發票」待辦。選好行業，今天要做的三件事才會變成你的話。
              {count} 個產業包，{PRICE_LABEL}。
            </p>
            <div className="mt-8">
              <IndustryPicker options={options} currentId={pack?.id} variant="hero" />
            </div>
            {pack ? (
              <p className="mt-4 text-xs text-cream-dim">
                現在是「{pack.nameZh}」。
                <Link href="/workspace" className="ml-2 underline">
                  直接開始今天
                </Link>
              </p>
            ) : null}
            <p className="mt-4 text-xs text-cream-dim">{PRICE_NOTE}</p>
          </article>
        </section>

        <p className="depth-caption">淺水</p>

        <section className="mx-auto flex min-h-[80svh] max-w-6xl flex-col justify-center px-5 py-16">
          <p className="scene-type display text-xs tracking-[0.22em] uppercase">每天這條路</p>
          <h2 className="scene-type mt-2 text-3xl font-medium">
            {pack ? `${pack.nameZh} 不是別人的四步。` : "選好行業，這條路才會出現。"}
          </h2>
          {pack ? (
            <>
              <p className="mt-3 max-w-xl text-sm text-cream-dim">{pack.sampleLoop}</p>
              <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((step, index) => (
                  <li key={`${step.href}-${step.label}`}>
                    <Link href={step.href} className="glass glass-lift block h-full p-6">
                      <p className="display text-xs text-cream-dim">0{index + 1}</p>
                      <h3 className="mt-3 text-2xl font-medium">{step.label}</h3>
                      <p className="mt-2 text-sm text-cream-dim">{step.hint}</p>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <article className="glass mt-8 max-w-xl p-6">
              <p className="text-cream-dim">服飾店是企劃到回購，教室是預約到續報，診所是看診到回診。先在上面選一行。</p>
            </article>
          )}
        </section>

        <p className="depth-caption">中層</p>

        <section className="mx-auto grid min-h-[80svh] max-w-6xl content-center gap-4 px-5 py-16 md:grid-cols-2">
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

        <p className="depth-caption">深海</p>

        <section className="mx-auto flex min-h-[70svh] max-w-6xl flex-col justify-center px-5 py-16">
          <article className="glass glass-hero max-w-xl p-8">
            <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">對齊進銷存</p>
            <h2 className="mt-3 text-3xl font-medium">鼎新 A1／億看會的，這裡用下一步做完</h2>
            <p className="mt-3 text-sm text-cream-dim">
              報價到收款、採購、倉庫、帳齡、稅。服務業看不到倉庫。現在按下去只在這台電腦走，正式帳本導入時再接。
            </p>
            <Link href="/workspace/erp/compare" className="glass-cta mt-6 inline-flex rounded-full px-5 py-2 text-sm">
              和 A1／億看對照
            </Link>
          </article>
        </section>

        <p className="depth-caption">海底</p>
      </main>
      <SiteFooter />
    </>
  );
}
