import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FaqList, ModuleGrid, OnboardingSteps, ParityPreview, SectionTitle, SiteHero, TrustStrip } from "@/components/SiteSections";
import { AI_USAGE_NOTE, PRICE_YEAR_TWD } from "@/lib/commercial";
import { listIndustries } from "@/lib/industries";
import { CONTRACT, SLA } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/pricing",
  "產品與價格：不用 AI 免費，AI 版一年含稅 NT$69,000",
  "客人、進銷存、帳、薪資可以免費使用。AI 版一年含稅 NT$69,000。現在 AI 用量不限。以後會限量，上限和開始日會先寫在這一頁。",
);

export default function PricingPage() {
  const n = listIndustries().length;
  const formatted = PRICE_YEAR_TWD.toLocaleString("zh-TW");

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-16 px-5 py-10 sm:py-14">
        <SiteHero />
        <ModuleGrid />
        <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]" aria-labelledby="price">
          <div className="site-sheet p-6 sm:p-8">
            <p className="text-sm text-cream-dim">不用 AI，系統免費。AI 版一年，含稅</p>
            <h2 id="price" className="mt-2 text-4xl font-medium sm:text-5xl">
              NT${formatted}
            </h2>
            <p className="mt-2 text-cream-dim">{AI_USAGE_NOTE}</p>
            <ul className="site-ruled mt-6">
              {[
                "不用 AI：客人、進銷存、帳、薪資、報表免費",
                "不收每人帳號費",
                `${n} 種產業包可以切換，跟客人的階段與每天看的數字可以改`,
                "AI 版含到現場導入，不另外賣導入專案",
                "更新、每日備份",
              ].map((line) => (
                <li key={line} className="py-3">
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/consulting#book" className="glass-pill px-5 py-2.5">
                約免費導入
              </Link>
              <Link href="/?setup=1" className="glass-pill px-5 py-2.5">
                先看示範
              </Link>
            </div>
          </div>
          <div className="site-sheet space-y-4 p-6 text-sm sm:p-8">
            <h3 className="text-lg font-medium">刻意不收、也不包的</h3>
            <p className="text-cream-dim">金流、簡訊、LINE 官方帳號、電子發票是外部服務，依各家原價收費、你們直接跟他們簽。我們負責接上，不抽成。</p>
            <p className="text-cream-dim">鼎新 A1 常把進銷存、會計、電子發票拆開月租；億看月費低但畫面密。這裡系統免費，AI 版一個含稅年費。現在不限量，以後會限量，並先寫在這一頁。</p>
            <h3 className="pt-2 text-lg font-medium">合約怎麼走</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-cream-dim">
              <li>開站後有試用期（預設 {CONTRACT.trialDays} 天，依訂單）</li>
              <li>到期前 {CONTRACT.noticeDays} 天開始寄續約提醒，可線上付款</li>
              <li>到期後 {CONTRACT.graceDays} 天寬限，之後改成只能看，不會刪資料</li>
              <li>不續約也能匯出全部資料</li>
            </ul>
            <p className="text-cream-dim">
              月可用率目標 {SLA.uptime}、每天備份，沒做到依
              <Link href="/sla" className="mx-1 underline underline-offset-4 hover:text-cream">
                服務水準
              </Link>
              抵扣費用。
            </p>
          </div>
        </section>
        <ParityPreview />
        <OnboardingSteps />
        <TrustStrip />
        <FaqList />
        <section className="flex flex-col items-start gap-4 border-t border-[var(--text)] pt-8 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle kicker="下一步" title="先約 30 分鐘，看你們的現場">
            不用先簽約。看完覺得不適合，就不用往下走。
          </SectionTitle>
          <Link href="/consulting#book" className="glass-pill shrink-0 px-5 py-2.5">
            約免費導入
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
