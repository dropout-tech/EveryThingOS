import { notFound } from "next/navigation";
import { EnterWorkspaceButton } from "@/components/EnterWorkspaceButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { enabledErpLabels, getIndustry, listIndustries } from "@/lib/industries";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listIndustries().map((item) => ({ slug: item.id }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const pack = listIndustries().find((item) => item.id === slug);
  if (!pack) return { title: "產業包" };
  return { title: `${pack.nameZh}產業包`, description: `${pack.tagline} EveryThingOS 的${pack.nameZh}預設：在賣什麼、怎麼交給客人、每天看哪些數字。`, alternates: { canonical: `/industries/${pack.id}` } };
}

export default async function IndustryDetailPage({ params }: Props) {
  const { slug } = await params;
  const exists = listIndustries().some((item) => item.id === slug);
  if (!exists) notFound();
  const pack = getIndustry(slug);

  return (
    <>
      <SiteHeader primary={false} />
      <main id="main" className="site-scope mx-auto max-w-3xl space-y-12 px-5 py-10 sm:py-14">
        <header>
          <p className="text-sm text-cream-dim">{pack.group}</p>
          <h1 className="site-display mt-2 text-4xl">{pack.nameZh}</h1>
          <p className="mt-3 text-cream-dim">{pack.tagline}</p>
          <p className="mt-2 text-sm text-cream-dim">
            賣什麼：{pack.itemType}。怎麼交：{pack.fulfillment}。
          </p>
        </header>
        <div className="grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-sm font-medium">現場最痛的</h2>
            <ul className="site-ruled mt-3 text-cream-dim">
              {pack.pains.map((pain) => (
                <li key={pain} className="py-3">{pain}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-medium">每天看的數字</h2>
            <ul className="site-ruled mt-3 text-cream-dim">
              {pack.kpis.map((kpi) => (
                <li key={kpi} className="py-3">{kpi}</li>
              ))}
            </ul>
          </section>
        </div>
        <section>
          <h2 className="text-sm font-medium">客人怎麼往前走</h2>
          <p className="mt-2">{pack.workflow.name}</p>
          <p className="mt-1 text-cream-dim">{pack.sampleLoop}</p>
        </section>
        <section>
          <h2 className="text-sm font-medium">這包會用到的生意功能</h2>
          <p className="mt-2 text-cream-dim">{enabledErpLabels(pack).join("、")}</p>
        </section>
        <section>
          <h2 className="text-sm font-medium">這包主要取代</h2>
          <p className="mt-2 text-sm text-cream-dim">{pack.saasReplaced.join("、")}</p>
        </section>
        <EnterWorkspaceButton industryId={pack.id} label={`用「${pack.nameZh}」開始今天`} />
        <p className="mt-3 text-xs text-cream-dim">
          進去後右上角可再換其他行業。每天看的數字、客人怎麼走、在賣什麼會跟著變。
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
