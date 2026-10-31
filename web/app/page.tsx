import Link from "next/link";
import { OnboardScreen } from "@/components/OnboardScreen";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { FlowDiagram, ModuleGrid, ProductShots, SiteHero, TierCompare, TrustStrip } from "@/components/SiteSections";
import { COMMERCIAL } from "@/lib/commercial";

export const metadata = {
  title: { absolute: "EveryThingOS｜不用 AI 免費，AI 版一年含稅 NT$69,000" },
  description: "客人、進銷存、帳、人事薪資可以免費使用。AI 版一年含稅 NT$69,000。現在 AI 用量不限，以後會限量，限量前會先寫在價格頁。",
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if ((await searchParams).setup === "1") return <OnboardScreen />;

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-12 px-5 py-8 sm:py-10">
        <SiteHero />
        <FlowDiagram />
        <ProductShots />
        <TierCompare />
        <ModuleGrid />
        <TrustStrip />
        <p className="text-sm text-cream-dim">
          {COMMERCIAL.legalName}
          <Link href="/login" className="ml-4 underline underline-offset-4 hover:text-cream">
            登入
          </Link>
          <Link href="/blog" className="ml-4 underline underline-offset-4 hover:text-cream">
            部落格
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
