import Link from "next/link";
import { MoneyStrip, TodayList } from "@/components/TodayBoard";
import { buildBooks } from "@/lib/erp";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "今天" };

export default async function WorkspaceHome() {
  const pack = await currentIndustry();
  const books = buildBooks(pack);
  const demo = demoRecords(pack);

  return (
    <div className="space-y-8">
      <div>
        <p className="display text-xs tracking-[0.2em] text-teal uppercase">老闆一眼</p>
        <h2 className="mt-1 text-2xl">{pack.nameZh} 今天的生意</h2>
        <p className="mt-2 max-w-2xl text-cream-dim">{pack.tagline} 數字來自進銷存與帳款，不是另一張 Excel。</p>
      </div>
      <MoneyStrip books={books} />
      <TodayList books={books} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass p-5">
          <div className="flex items-center justify-between">
            <h3>客人現在在哪</h3>
            <Link href="/workspace/crm" className="text-sm text-teal">
              看板
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
        <section className="glass p-5">
          <div className="flex items-center justify-between">
            <h3>該請人付錢</h3>
            <Link href="/workspace/erp/finance" className="text-sm text-teal">
              帳齡
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {books.arAging.slice(0, 4).map((row) => (
              <li key={row.party} className="flex justify-between gap-3 text-cream-dim">
                <span>{row.party}</span>
                <span className={row.d90 ? "text-orange" : ""}>
                  {row.d90 ? "逾期" : "正常"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
