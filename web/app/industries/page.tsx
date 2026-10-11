import Link from "next/link";
import { IndustryPicker } from "@/components/IndustryPicker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { industriesByGroup, listIndustries, listIndustryChoices } from "@/lib/industries";

export const metadata = { title: "一百個產業包" };

export default function IndustriesPage() {
  const groups = industriesByGroup();
  const total = listIndustries().length;
  const options = listIndustryChoices();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-teal uppercase">一百產業</p>
        <h1 className="scene-type mt-3 text-4xl font-medium">{total} 種行業，選了才知道今天做什麼</h1>
        <p className="mt-4 max-w-2xl text-cream-dim">
          不要在一百張名片裡用眼睛掃。先搜，點下去就開始今天。每一包都設定好在賣什麼、怎麼交給客人、每天看哪些數字。
        </p>
        <div className="glass mt-8 max-w-xl p-5">
          <IndustryPicker options={options} variant="hero" />
        </div>
        <div className="mt-12 space-y-12">
          {groups.map((group) => (
            <section key={group.group}>
              <h2 className="text-xl text-gold">
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
