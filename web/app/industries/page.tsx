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
      <main id="main" className="site-scope mx-auto max-w-6xl space-y-10 px-5 py-10 sm:py-14">
        <header className="grid items-end gap-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <h1 className="site-display text-3xl sm:text-5xl">{total} 種行業</h1>
            <div className="mt-5 max-w-xl">
              <IndustryPicker options={options} variant="hero" />
            </div>
          </div>
          <figure className="site-shot">
            <img src="/shots/today-white.png" alt="產業包工作畫面" width={1280} height={800} className="site-shot-light" />
            <img src="/shots/today-black.png" alt="產業包工作畫面" width={1280} height={800} className="site-shot-dark" />
          </figure>
        </header>
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.group} className="border-t border-[var(--text)] pt-4">
              <h2 className="scene-type text-base font-medium">
                {group.group}
                <span className="ml-2 text-sm text-cream-dim">{group.items.length}</span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <Link key={item.id} href={`/industries/${item.id}`} className="glass-pill px-3 py-1.5 text-sm">
                    {item.nameZh}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
