import { notFound } from "next/navigation";
import { PlatformAccountPanel } from "@/components/PlatformAccountPanel";
import { glueAdmin, platformOperator, STAGE_LABEL, type AccountEvent, type PlatformAccount } from "@/lib/platform";

export default async function PlatformAccountPage({ params }: PageProps<"/platform/[site]">) {
  const operator = (await platformOperator())!;
  const { site } = await params;
  const res = await glueAdmin<{ account: PlatformAccount; events: AccountEvent[]; dead_letters: number }>(`/admin/accounts/${encodeURIComponent(site)}`, operator);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) return <p className="text-orange">讀不到這家公司：{res.text || res.status}</p>;
  const { account, events, dead_letters } = res.data;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl">{account.company}</h2>
        <p className="text-sm text-cream-dim">
          {account.site} · {STAGE_LABEL[account.lifecycle.stage]}
          {account.lifecycle.message ? ` · ${account.lifecycle.message}` : ""}
        </p>
        {dead_letters ? <p className="mt-1 text-sm text-orange">{dead_letters} 件同步卡住（客戶在設定頁可以看原因並重送）</p> : null}
      </header>
      <PlatformAccountPanel account={account} />
      <section className="glass-well space-y-2 p-5">
        <h3 className="text-sm">用量</h3>
        {account.usage ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(account.usage).map(([k, v]) => (
              <li key={k}>
                <span className="text-cream-dim">{k}</span> {String(v)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">還沒收過用量。</p>
        )}
      </section>
      <section className="glass-well space-y-2 p-5">
        <h3 className="text-sm">紀錄</h3>
        <ul className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3">
              <span className="text-cream-dim">{e.at.slice(0, 16).replace("T", " ")}</span>
              <span>{e.actor}</span>
              <span>{e.action}</span>
              <span className="text-cream-dim">{e.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
