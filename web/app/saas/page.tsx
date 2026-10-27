import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ParityPreview, SectionTitle } from "@/components/SiteSections";
import { SAAS_MATRIX } from "@/lib/commercial";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/saas",
  "對照鼎新 A1、億看與常見訂閱",
  "EveryThingOS 的進銷存與帳對齊鼎新 A1、億看 ECOUNT，另外取代 CRM、電子報、表單、短網址等月租工具。逐項對照，照實寫。",
);

export default function SaasPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-10 sm:py-14">
        <header className="site-sheet p-6 sm:p-10">
          <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">現在付的那些帳</p>
          <h1 className="mt-3 text-3xl font-medium sm:text-4xl">先取代鼎新 A1 或億看</h1>
          <p className="mt-4 max-w-2xl text-cream-dim">
            進銷存與帳，對齊台灣中小企業最常用的兩套。更好用的地方：用現場的話、這個行業用不到的欄位先藏起來、今天先做一件，以及它們沒有的對話與客人。
          </p>
          <Link href="/consulting#book" className="glass-cta mt-6 inline-flex rounded-full px-6 py-3 font-medium">
            約顧問看我們現在的系統
          </Link>
        </header>
        <ParityPreview full />
        <section className="space-y-6" aria-labelledby="others">
          <div id="others">
            <SectionTitle kicker="其他月租" title="常被一起併進來的工具">
              這些不是每一家都在用；列出來是讓你們對照現在付了哪些。
            </SectionTitle>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SAAS_MATRIX.map((row) => (
              <li key={row.category} className="site-sheet p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{row.category}</p>
                  <span className="site-chip shrink-0">{row.pillar}</span>
                </div>
                <p className="mt-2 text-cream-dim">{row.tools.join("、")}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
