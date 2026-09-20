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
  return { title: pack ? pack.nameZh : "產業包" };
}

export default async function IndustryDetailPage({ params }: Props) {
  const { slug } = await params;
  const exists = listIndustries().some((item) => item.id === slug);
  if (!exists) notFound();
  const pack = getIndustry(slug);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="text-sm text-cream-dim">
          {pack.group} · {pack.code}
        </p>
        <h1 className="mt-2 text-4xl font-medium">{pack.nameZh}</h1>
        <p className="mt-3 text-cream-dim">{pack.tagline}</p>
        <p className="mt-2 text-sm text-gold">
          物項：{pack.itemType} ／ 履行：{pack.fulfillment}
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-sm text-teal">現場痛點</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-cream-dim">
              {pack.pains.map((pain) => (
                <li key={pain}>{pain}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm text-teal">Dashboard KPI</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-cream-dim">
              {pack.kpis.map((kpi) => (
                <li key={kpi}>{kpi}</li>
              ))}
            </ul>
          </section>
        </div>
        <section className="mt-8">
          <h2 className="text-sm text-teal">預設流程</h2>
          <p className="mt-2">{pack.workflow.name}</p>
          <p className="mt-1 text-cream-dim">{pack.sampleLoop}</p>
        </section>
        <section className="mt-8">
          <h2 className="text-sm text-teal">打開的 ERP 能力</h2>
          <p className="mt-2 text-cream-dim">{enabledErpLabels(pack).join(" · ")}</p>
        </section>
        <section className="mt-8">
          <h2 className="text-sm text-teal">這包主要取代</h2>
          <p className="mt-2 text-sm text-cream-dim">{pack.saasReplaced.join("、")}</p>
        </section>
        <EnterWorkspaceButton industryId={pack.id} label={`用「${pack.nameZh}」進入 OS`} />
        <p className="mt-3 text-xs text-cream-dim">
          進入後右上角可再切換其餘 99 包。Dashboard、流程階段、物項名稱會跟著變。
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
