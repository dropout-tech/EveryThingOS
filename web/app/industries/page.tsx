import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { industriesByGroup, listIndustries } from "@/lib/industries";

export const metadata = { title: "一百個產業包" };

export default function IndustriesPage() {
  const groups = industriesByGroup();
  const total = listIndustries().length;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-teal uppercase">Industry packs</p>
        <h1 className="scene-type mt-3 text-4xl font-medium">{total} 個產業，同一套作業系統</h1>
        <p className="mt-4 max-w-2xl text-cream-dim">
          每一包都設定好物項、履行方式、流程階段與 KPI。導入時打開最接近的一包，再改你們自己的例外。
        </p>
        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <section key={group.group}>
              <h2 className="text-xl text-gold">
                {group.group}
                <span className="ml-2 text-sm text-cream-dim">{group.items.length}</span>
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/industries/${item.id}`}
                      className="glass-well block h-full p-4 hover:bg-white/10"
                    >
                      <p className="text-xs text-cream-dim">{item.code}</p>
                      <p className="mt-1 font-medium">{item.nameZh}</p>
                      <p className="mt-2 text-sm text-cream-dim">{item.tagline}</p>
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
