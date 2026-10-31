import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FlowDiagram, ParityPreview, ProductShots, SectionTitle } from "@/components/SiteSections";
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
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-12 px-5 py-10 sm:py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="site-display text-3xl sm:text-5xl">對照鼎新 A1、億看</h1>
          <Link href="/consulting#book" className="glass-pill px-5 py-2.5">
            約顧問對照
          </Link>
        </header>
        <FlowDiagram />
        <ParityPreview full />
        <ProductShots />
        <section className="space-y-4" aria-labelledby="others">
          <div id="others">
            <SectionTitle kicker="其他月租" title="可併進來的訂閱" />
          </div>
          <ul className="site-ruled">
            {SAAS_MATRIX.map((row) => (
              <li key={row.category} className="site-row text-sm">
                <p className="font-medium">{row.category}</p>
                <p className="text-cream-dim">{row.tools.join("、")}</p>
                <span className="site-chip">{row.pillar}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
