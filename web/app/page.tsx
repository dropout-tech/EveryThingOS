import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ModuleGrid, SectionTitle, SiteHero, TrustStrip } from "@/components/SiteSections";
import { StylePicker } from "@/components/StylePicker";
import { currentStyle } from "@/lib/style-server";
import { hasChosenIndustry } from "@/lib/workspace";

export const metadata = {
  title: { absolute: "DropOut OS｜台灣中小企業的 CRM、進銷存、財務與薪資，一年 NT$100,000" },
  description: "客人、進銷存、帳、人事薪資、老闆報表、對話與電子報，一個登入做完。對齊鼎新 A1／億看，每年 NT$100,000 未稅，不限帳號，含顧問到現場導入。",
  alternates: { canonical: "/" },
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const setup = (await searchParams).setup;
  if (setup === "1") redirect("/start");
  if (await hasChosenIndustry()) redirect("/workspace");
  const style = await currentStyle();

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-14 px-5 py-8 sm:py-12">
        <SiteHero />
        <section className="space-y-5" aria-labelledby="looks">
          <div id="looks">
            <SectionTitle kicker="三種樣子" title="選你喜歡的樣子">
              功能和位置都一樣，只換外觀。現在選，進示範就是這個樣子；之後在「設定」隨時換。
            </SectionTitle>
          </div>
          <StylePicker current={style} variant="cards" />
          <p>
            <Link href="/start" className="btn btn-primary">
              用這個樣子看示範
            </Link>
          </p>
        </section>
        <ModuleGrid />
        <TrustStrip />
        <p className="text-center">
          <Link href="/pricing" className="glass-pill px-5 py-2.5">
            看完整介紹、跟鼎新／億看的對照與常見問題
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
