import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  COMMERCIAL,
  PILLARS,
  PRICE_LABEL,
  PRICE_NOTE,
} from "@/lib/commercial";
import { listIndustries, listGroups } from "@/lib/industries";

export default function HomePage() {
  const count = listIndustries().length;
  const groups = listGroups();

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className="display text-xs tracking-[0.28em] text-teal uppercase">
            {COMMERCIAL.legalName} · DropOut OS
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-medium md:text-6xl">
            取代鼎新 A1、億看 ECOUNT，
            <span className="text-teal">但打開就知道下一步。</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-cream-dim">
            進銷存、帳款、稅、電子發票對齊它們的等級。再加上 CRM、魅力圈、清庫。
            員工用現場的話做事，不用先背「銷貨單」。{count} 個產業包，{PRICE_LABEL}，顧問免費導入。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/workspace" className="glass-cta rounded-full px-6 py-3 font-medium">
              打開作業系統
            </Link>
            <Link href="/workspace/erp/compare" className="glass-pill px-6 py-3">
              和 A1／億看對照
            </Link>
          </div>
          <p className="mt-4 text-sm text-cream-dim">{PRICE_NOTE}</p>
        </section>

        <section className="px-5 py-14">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-4">
            {PILLARS.map((pillar) => (
              <article key={pillar.id} className="glass p-5">
                <h2 className="text-lg font-medium">{pillar.name}</h2>
                <p className="mt-2 text-sm text-cream-dim">{pillar.detail}</p>
                <p className="mt-3 text-xs text-gold">取代 {pillar.replaces}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-medium">不是再買第四套雲端，是把現場接起來。</h2>
          <p className="mt-4 max-w-2xl text-cream-dim">
            產業不同，主檔相同：人、商品、事件、同意。一百個情境差在流程階段、Dashboard、要不要庫存。
            顧問幫你打開最接近的一包，而不是從頭做專案。
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {groups.map((group) => (
              <span key={group} className="glass-pill px-3 py-1 text-sm">
                {group}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 md:grid-cols-2">
          <article className="glass p-8">
            <p className="display text-xs tracking-[0.2em] text-orange uppercase">Commercial</p>
            <h2 className="mt-3 text-2xl">{PRICE_LABEL}／年</h2>
            <ul className="mt-4 space-y-2 text-cream-dim">
              <li>進銷存＋財務對齊鼎新 A1／億看，操作改成下一步</li>
              <li>全模組：CRM、ERP、魅力圈、清庫、短網址、官網</li>
              <li>{count} 個產業包，可依現場改 Dashboard 與流程</li>
              <li>免費顧問導入，不另收導入專案費</li>
              <li>全部套琢奧識別，員工看不到開源原廠皮</li>
            </ul>
            <Link href="/pricing" className="mt-6 inline-block text-teal hover:underline">
              看費用怎麼算
            </Link>
          </article>
          <article className="glass p-8">
            <p className="display text-xs tracking-[0.2em] text-teal uppercase">Consulting</p>
            <h2 className="mt-3 text-2xl">顧問去現場，導入不另外開帳單</h2>
            <p className="mt-4 text-cream-dim">
              用昨天的工具打不贏明天的市場。我們先看你最耗時的一段，打開對應產業包，帶你們用真實資料跑完一筆生意。
            </p>
            <Link href="/consulting" className="mt-6 inline-block text-teal hover:underline">
              導入怎麼走
            </Link>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
