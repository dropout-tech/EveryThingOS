import { notFound } from "next/navigation";
import { PlatformAccountPanel } from "@/components/PlatformAccountPanel";
import { PlatformInvoices } from "@/components/PlatformInvoices";
import { glueAdmin, HEALTH_LABEL, STAGE_LABEL, type AccountEvent, type GatewayStatus, type Health, type PlatformAccount, type PlatformInvoice } from "@/lib/platform";

export default async function PlatformAccountPage({ params }: PageProps<"/platform/[site]">) {
  const { site } = await params;
  const [res, bill] = await Promise.all([
    glueAdmin<{ account: PlatformAccount; events: AccountEvent[]; dead_letters: number }>(`/admin/accounts/${encodeURIComponent(site)}`),
    glueAdmin<{ gateway: GatewayStatus; health: Health; invoices: PlatformInvoice[] }>(`/admin/accounts/${encodeURIComponent(site)}/invoices`),
  ]);
  if (!res.operator) return null;
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) return <p className="text-orange">讀不到這家公司：{res.text || res.status}</p>;
  const { account, events, dead_letters } = res.data;
  const billing = bill.ok ? bill.data : null;
  const health = billing?.health;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl">{account.company}</h2>
        <p className="text-sm text-cream-dim">
          {account.site} · {STAGE_LABEL[account.lifecycle.stage]}
          {account.lifecycle.message ? ` · ${account.lifecycle.message}` : ""}
        </p>
        {dead_letters ? <p className="mt-1 text-sm text-orange">{dead_letters} 件同步卡住（客戶在設定頁可以看原因並重送）</p> : null}
        {account.backup_problem ? <p className="mt-1 text-sm text-orange">備份：{account.backup_problem}</p> : null}
        {account.purged_at ? (
          <p className="mt-1 text-sm text-cream-dim">{account.purged_at.slice(0, 10)} 已刪除資料</p>
        ) : account.purge?.due_on ? (
          <p className={`mt-1 text-sm ${account.purge.due ? "text-orange" : "text-cream-dim"}`}>
            {account.purge.due_on} 起可以刪除資料（dropout-onboard fleet purge {account.site}）
          </p>
        ) : null}
        {health && health.level !== "gone" ? (
          <p className={`mt-1 text-sm ${health.level === "high" ? "text-orange" : "text-cream-dim"}`}>
            健康 {health.score} · {HEALTH_LABEL[health.level]}
            {health.reasons.length ? `：${health.reasons.join("；")}` : ""}
          </p>
        ) : null}
      </header>
      <PlatformAccountPanel account={account} />
      {billing ? <PlatformInvoices site={account.site} invoices={billing.invoices} gateway={billing.gateway} /> : <p className="text-sm text-orange">讀不到帳單：{bill.text || bill.status}</p>}
      <section className="glass-well space-y-2 p-5">
        <h3 className="text-sm">用量</h3>
        {account.usage ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(account.usage).filter(([k]) => k !== "backup").map(([k, v]) => (
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
