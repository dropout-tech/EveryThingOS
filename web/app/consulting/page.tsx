import Link from "next/link";
import { connection } from "next/server";
import { ConsultingForm } from "@/components/ConsultingForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SectionTitle } from "@/components/SiteSections";
import { COMMERCIAL, CONSULTING_STEPS, PRICE_LABEL } from "@/lib/commercial";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/consulting",
  "約免費顧問導入",
  "顧問到現場看你們怎麼做事，選產業包、搬資料、帶你們跑完一筆真實生意。導入含在年費裡，不另外收費。留下聯絡方式，顧問會跟你約時間。",
);

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export default async function ConsultingPage() {
  await connection();
  const demo = !(env("GLUE_URL") && env("CONSULTING_FORM_SITE"));

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-10 sm:py-14">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
          <header className="site-sheet p-6 sm:p-10">
            <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">免費導入</p>
            <h1 className="mt-3 text-3xl font-medium sm:text-4xl">顧問去現場，導入不另開帳單</h1>
            <p className="mt-4 text-cream-dim">
              年費已含到現場。我們不另外賣「導入專案」。懂生意的人跟第一線看同一筆資料，打開對的產業包，只改你們真正不一樣的地方。
            </p>
            <ul className="mt-6 space-y-3">
              {["第一次 30 分鐘，看現場、不推銷", "不用先簽約，也不用先給統編", `決定要用才開始算年費（${PRICE_LABEL}，未稅）`].map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="text-cream-dim">✓</span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-cream-dim">
              還在比較？先看
              <Link href="/pricing" className="mx-1 underline underline-offset-4 hover:text-cream">
                產品與價格
              </Link>
              或
              <Link href="/saas" className="mx-1 underline underline-offset-4 hover:text-cream">
                跟鼎新・億看的對照
              </Link>
              。
            </p>
          </header>
          <div id="book" className="scroll-mt-24">
            <ConsultingForm demo={demo} turnstileSiteKey={env("TURNSTILE_SITE_KEY")} email={COMMERCIAL.email} />
          </div>
        </div>
        <section className="space-y-6" aria-labelledby="steps">
          <div id="steps">
            <SectionTitle kicker="導入怎麼走" title="從第一次見面到交給你們">
              每一家的順序差不多；用不到的步驟會直接跳過。
            </SectionTitle>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CONSULTING_STEPS.map((step) => (
              <li key={step.id} className="site-sheet p-5">
                <p className="display text-sm text-cream-dim">{step.id}</p>
                <h3 className="mt-1 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-cream-dim">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
