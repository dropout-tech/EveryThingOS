import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardScreen } from "@/components/OnboardScreen";
import { SiteFooter } from "@/components/SiteFooter";
import { ModuleGrid, SiteHero, TrustStrip } from "@/components/SiteSections";
import { COMMERCIAL } from "@/lib/commercial";
import { hasChosenIndustry } from "@/lib/workspace";

export const metadata = {
  title: { absolute: "EveryThingOS｜台灣中小企業的 CRM、進銷存、財務與薪資，一年 NT$100,000" },
  description: "客人、進銷存、帳、人事薪資、老闆報表、對話與電子報，一個登入做完。對齊鼎新 A1／億看，每年 NT$100,000 未稅，不限帳號，含顧問到現場導入。",
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const setup = (await searchParams).setup;
  if ((await hasChosenIndustry()) && setup !== "1") {
    redirect("/workspace");
  }
  return (
    <>
      <OnboardScreen />
      <div className="site-scope mx-auto max-w-6xl space-y-14 px-5 pb-10">
        <p className="scene-type text-center text-sm">
          第一次來？往下看 {COMMERCIAL.product} 是什麼、多少錢。
        </p>
        <SiteHero demoHref="#top" as="h2" />
        <ModuleGrid />
        <TrustStrip />
        <p className="text-center">
          <Link href="/pricing" className="glass-pill px-5 py-2.5">
            看完整介紹、跟鼎新／億看的對照與常見問題
          </Link>
        </p>
      </div>
      <SiteFooter />
    </>
  );
}
