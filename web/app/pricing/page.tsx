import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FaqList, ModuleGrid, OnboardingSteps, ParityPreview, ProductShots, TierCompare, TrustStrip } from "@/components/SiteSections";
import { CONTRACT, SLA } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/pricing",
  "產品與價格：不用 AI 免費，AI 版一年含稅 NT$69,000",
  "客人、進銷存、帳、薪資可以免費使用。AI 版一年含稅 NT$69,000。現在 AI 用量不限。以後會限量，上限和開始日會先寫在這一頁。",
);

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-10 sm:py-14">
        <h1 className="site-display text-3xl sm:text-5xl">產品與價格</h1>
        <TierCompare />
        <ProductShots />
        <ModuleGrid />
        <ParityPreview />
        <OnboardingSteps />
        <ul aria-label="合約數字" className="site-steps">
          <li>
            <p className="site-step-no">{CONTRACT.trialDays}天</p>
            <p className="mt-2 text-sm text-cream-dim">試用期</p>
          </li>
          <li>
            <p className="site-step-no">{CONTRACT.noticeDays}天</p>
            <p className="mt-2 text-sm text-cream-dim">到期前續約提醒</p>
          </li>
          <li>
            <p className="site-step-no">{CONTRACT.graceDays}天</p>
            <p className="mt-2 text-sm text-cream-dim">過期寬限，不刪資料</p>
          </li>
          <li>
            <p className="site-step-no">{SLA.uptime}</p>
            <p className="mt-2 text-sm text-cream-dim">
              月可用率目標（
              <Link href="/sla" className="underline underline-offset-4 hover:text-cream">
                服務水準
              </Link>
              ）
            </p>
          </li>
        </ul>
        <FaqList />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
