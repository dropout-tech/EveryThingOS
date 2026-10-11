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
        <header className="site-sheet p-6 sm:p-10">
          <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">產業包</p>
          <h1 className="mt-3 text-3xl font-medium sm:text-4xl">{total} 種行業，選了才知道今天做什麼</h1>
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
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link href={`/industries/${item.id}`} className="glass-well block h-full p-4 hover:bg-white/10">
                      <p className="font-medium">{item.nameZh}</p>
                      <p className="mt-2 text-sm text-cream-dim">{item.tagline}</p>
                      <p className="mt-2 text-xs text-cream-dim">{item.sampleLoop}</p>
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
