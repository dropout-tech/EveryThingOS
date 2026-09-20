import Link from "next/link";
import { enabledErpLabels } from "@/lib/industries";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "作業系統" };

export default async function WorkspaceHome() {
  const pack = await currentIndustry();
  const demo = demoRecords(pack);

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-cream-dim">{pack.tagline}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pack.kpis.map((kpi) => (
          <article key={kpi} className="rounded-2xl border border-[var(--line)] bg-ink-2 p-4">
            <p className="text-xs text-cream-dim">KPI</p>
            <p className="mt-2 text-lg">{kpi}</p>
            <p className="mt-3 display text-2xl text-teal">—</p>
            <p className="text-xs text-cream-dim">示範站，接上 ERPNext 後寫入真實數</p>
          </article>
        ))}
      </div>
      <section className="rounded-2xl border border-[var(--line)] p-5">
        <h2 className="text-sm text-gold">這家公司的一筆生意</h2>
        <p className="mt-2 text-cream-dim">{pack.sampleLoop}</p>
        <p className="mt-2 text-sm">
          物項 {pack.itemType} · 履行 {pack.fulfillment} · ERP {enabledErpLabels(pack).join("、")}
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] p-5">
          <div className="flex items-center justify-between">
            <h2>最新線索</h2>
            <Link href="/workspace/crm" className="text-sm text-teal">
              CRM
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {demo.leads.map((lead) => (
              <li key={lead.name} className="flex justify-between gap-3 text-cream-dim">
                <span>{lead.name}</span>
                <span>{lead.stage}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-[var(--line)] p-5">
          <div className="flex items-center justify-between">
            <h2>履行中</h2>
            <Link href="/workspace/erp" className="text-sm text-teal">
              ERP
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {demo.orders.map((order) => (
              <li key={order.no} className="flex justify-between gap-3 text-cream-dim">
                <span>
                  {order.no} {order.party}
                </span>
                <span>{order.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
