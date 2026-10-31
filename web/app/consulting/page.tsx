import Link from "next/link";
import { connection } from "next/server";
import { ConsultingForm } from "@/components/ConsultingForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { AI_USAGE_NOTE, COMMERCIAL, CONSULTING_STEPS, PRICE_LABEL } from "@/lib/commercial";
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
      <SiteHeader primary={false} />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-12 px-5 py-10 sm:py-14">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr]">
          <header className="space-y-4">
            <h1 className="site-display text-3xl sm:text-5xl">顧問到現場導入</h1>
            <div className="flex flex-wrap gap-2">
              {["30 分鐘看現場", "不用 AI 免費", PRICE_LABEL, "現在不限量，以後限量先說"].map((tag) => (
                <span key={tag} className="site-chip" data-tone="ok">
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-xs text-cream-dim">{AI_USAGE_NOTE}</p>
            <figure className="site-shot pt-2">
              <img src="/shots/today-white.png" alt="今天的工作畫面" width={1280} height={800} className="site-shot-light" />
              <img src="/shots/today-black.png" alt="今天的工作畫面" width={1280} height={800} className="site-shot-dark" />
            </figure>
            <p className="text-sm text-cream-dim">
              <Link href="/pricing" className="underline underline-offset-4 hover:text-cream">
                產品與價格
              </Link>
              <Link href="/saas" className="ml-4 underline underline-offset-4 hover:text-cream">
                對照鼎新・億看
              </Link>
            </p>
          </header>
          <div id="book" className="scroll-mt-24">
            <ConsultingForm demo={demo} turnstileSiteKey={env("TURNSTILE_SITE_KEY")} email={COMMERCIAL.email} />
          </div>
        </div>
        <ol className="site-steps" aria-label="導入步驟">
          {CONSULTING_STEPS.map((step) => (
            <li key={step.id}>
              <p className="site-step-no">{step.id}</p>
              <h2 className="mt-2 font-medium">{step.title}</h2>
              <p className="mt-1 text-sm text-cream-dim">{step.body}</p>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}
