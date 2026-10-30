import Link from "next/link";
import { IndustryPicker } from "@/components/IndustryPicker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { industriesByGroup, listIndustries, listIndustryChoices } from "@/lib/industries";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/industries",
  "一百個產業包",
  "零售、餐飲、補習班、診所、工廠、工程、貿易……一百種行業的預設：在賣什麼、怎麼交給客人、每天看哪些數字。搜尋最像你們的一包，打開就能試。",
);

export default function IndustriesPage() {
  const groups = industriesByGroup();
  const total = listIndustries().length;
  const options = listIndustryChoices();

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <header className="max-w-2xl">
          <h1 className="site-display text-3xl sm:text-5xl">{total} 種行業，選了才知道今天做什麼</h1>
          <p className="mt-4 max-w-2xl text-cream-dim">
            不用在一百張卡片裡用眼睛掃。先搜，點下去就開始示範。每一包都設定好在賣什麼、怎麼交給客人、每天看哪些數字；產業包可以隨時切換，不另外收費。
          </p>
          <div className="mt-6 max-w-xl">
            <IndustryPicker options={options} variant="hero" />
          </div>
        </header>
        <div className="mt-12 space-y-12">
          {groups.map((group) => (
            <section key={group.group}>
              <h2 className="scene-type text-xl">
                {group.group}
                <span className="ml-2 text-sm text-cream-dim">{group.items.length}</span>
              </h2>
              <ul className="site-ruled mt-4">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link href={`/industries/${item.id}`} className="site-row">
                      <span className="font-medium">{item.nameZh}</span>
                      <span className="min-w-0 text-sm text-cream-dim">
                        {item.tagline}
                        <span className="mt-1 block text-xs">{item.sampleLoop}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
