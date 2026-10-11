import Link from "next/link";
import { glueAdmin, HEALTH_LABEL, ntd, STAGE_LABEL, type BillingSummary, type PlatformAccount } from "@/lib/platform";
import type { Stage } from "@/lib/sources/config";

const ORDER: Stage[] = ["read_only", "past_due", "suspended", "due_soon", "trial", "active", "cancelled"];

function num(v: unknown) {
  return typeof v === "number" ? v : null;
}

function backupAge(iso: string, bytes?: number) {
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
  return `${hours < 1 ? "1 小時內" : `${Math.round(hours)} 小時前`} · ${Math.round((bytes ?? 0) / 1048576)} MB`;
}

export default async function PlatformPage({ searchParams }: PageProps<"/platform">) {
  const [res, bill] = await Promise.all([glueAdmin<{ today: string; accounts: PlatformAccount[] }>("/admin/accounts"), glueAdmin<BillingSummary>("/admin/billing")]);
  if (!res.operator) return null;
  if (!res.ok || !res.data) return <p className="text-orange">讀不到公司清單：{res.text || res.status}</p>;
  const { accounts, today } = res.data;
  const billing = bill.ok ? bill.data : null;
  const { sort } = await searchParams;
  const byEnds = sort === "ends";
  const health = (a: PlatformAccount) => billing?.accounts[a.site]?.health ?? null;
  const risk = (a: PlatformAccount) => (a.lifecycle.stage === "cancelled" ? 1000 : (health(a)?.score ?? 101));
  const byStage = (a: PlatformAccount, b: PlatformAccount) => ORDER.indexOf(a.lifecycle.stage) - ORDER.indexOf(b.lifecycle.stage) || (a.lifecycle.ends ?? "9").localeCompare(b.lifecycle.ends ?? "9");
  const sorted = [...accounts].sort((a, b) => (byEnds ? byStage(a, b) : risk(a) - risk(b) || byStage(a, b)));
  const count = (stage: Stage) => accounts.filter((a) => a.lifecycle.stage === stage).length;
  const seats = accounts.reduce((n, a) => n + (num(a.usage?.users) ?? 0), 0);
  const highRisk = accounts.filter((a) => health(a)?.level === "high").length;
  const unpaid = Object.values(billing?.accounts ?? {}).filter((x) => x.open).length;
  const purgeDue = accounts.filter((a) => a.purge?.due);
  const staleBackups = accounts.filter((a) => a.backup_problem).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["公司", accounts.length],
          ["帳號", seats],
          ["試用", count("trial")],
          ["60 天內到期", count("due_soon")],
          ["寬限中", count("past_due")],
          ["只能看／暫停", count("read_only") + count("suspended")],
          ["高風險", billing ? highRisk : "—"],
          ["未付帳單", billing ? unpaid : "—"],
        ].map(([label, value]) => (
          <div key={label as string} className="glass p-4">
            <p className="text-xs text-cream-dim">{label}</p>
            <p className="mt-1 text-2xl">{value}</p>
          </div>
        ))}
      </section>
      <p className="flex flex-wrap gap-x-4 text-xs text-cream-dim">
        <span>今天 {today}（台灣）。用量每天凌晨兩點更新。</span>
        {staleBackups ? <span className="text-orange">{staleBackups} 家備份有問題（看「最近備份」欄）</span> : null}
        <span>
          排序：
          {byEnds ? <Link href="/platform" className="underline hover:text-cream">高風險在前</Link> : "高風險在前"}
          {" ／ "}
          {byEnds ? "依到期" : <Link href="/platform?sort=ends" className="underline hover:text-cream">依到期</Link>}
        </span>
        {billing ? (
          <span className={billing.gateway.ecpay === "production" ? "" : "text-orange"}>
            線上付款：{billing.gateway.ecpay === "production" ? "綠界正式" : billing.gateway.ecpay === "staging" ? "綠界測試環境（不會真的扣款）" : "沒有設定"}
            {" · "}電子發票：{billing.gateway.einvoice === "production" ? "正式" : billing.gateway.einvoice === "staging" ? "測試環境" : "沒有設定"}
          </span>
        ) : (
          <span className="text-orange">讀不到帳單與健康度：{bill.text || bill.status}</span>
        )}
      </p>
      {purgeDue.length ? (
        <section className="glass-well space-y-2 p-5">
          <h3 className="text-sm">解約滿 90 天，待刪除</h3>
          <p className="text-xs text-cream-dim">系統不會自動刪。確認客戶已經拿到資料後，在主機上跑 dropout-onboard fleet purge &lt;site&gt;（先預演，再加 --apply）。</p>
          <ul className="space-y-1 text-sm">
            {purgeDue.map((a) => (
              <li key={a.site}>
                <Link href={`/platform/${encodeURIComponent(a.site)}`} className="hover:text-teal">
                  {a.company}
                </Link>
                <span className="text-cream-dim">（{a.site}）解約 {a.cancelled_at?.slice(0, 10) ?? "—"}，{a.purge?.due_on} 起可刪</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="glass overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-cream-dim">
            <tr>
              {["公司", "健康", "狀態", "到期", "帳單", "帳號／30 天活躍", "本月發票", "資料量", "最近備份", "網址"].map((h) => (
                <th key={h} className="px-4 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const h = health(a);
              const b = billing?.accounts[a.site];
              return (
                <tr key={a.site} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3">
                    <Link href={`/platform/${encodeURIComponent(a.site)}`} className="hover:text-teal">
                      {a.company}
                    </Link>
                    <span className="block text-xs text-cream-dim">{a.site}</span>
                  </td>
                  <td className="max-w-64 px-4 py-3">
                    {h ? (
                      <>
                        <span className={h.level === "high" ? "text-orange" : h.level === "ok" ? "" : "text-cream-dim"}>
                          {h.level === "gone" ? HEALTH_LABEL.gone : `${h.score} · ${HEALTH_LABEL[h.level]}`}
                        </span>
                        {h.reasons.length && h.level !== "gone" ? <span className="block text-xs text-cream-dim">{h.reasons.join("；")}</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`px-4 py-3 ${a.lifecycle.writable && a.lifecycle.stage !== "past_due" ? "" : "text-orange"}`}>{STAGE_LABEL[a.lifecycle.stage]}</td>
                  <td className="px-4 py-3">{a.lifecycle.ends ?? "—"}</td>
                  <td className="px-4 py-3">
                    {b?.open ? <span className="text-orange">未付 {ntd(b.open.amount)}</span> : "—"}
                    {b?.einvoice_failed ? <span className="block text-xs text-orange">發票沒開成</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {num(a.usage?.users) ?? "—"} ／ {num(a.usage?.active_users_30d) ?? "—"}
                  </td>
                  <td className="px-4 py-3">{num(a.usage?.invoices_this_month) ?? "—"}</td>
                  <td className="px-4 py-3">{num(a.usage?.db_mb) !== null ? `${Math.round((num(a.usage?.db_mb) ?? 0) + (num(a.usage?.files_mb) ?? 0))} MB` : typeof a.usage?.error === "string" ? <span className="text-orange">讀不到</span> : "—"}</td>
                  <td className="max-w-56 px-4 py-3">
                    {a.usage?.backup?.offsite?.taken_at ? backupAge(a.usage.backup.offsite.taken_at, a.usage.backup.offsite.bytes) : "—"}
                    {a.backup_problem ? <span className="block text-xs text-orange">{a.backup_problem}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-cream-dim">{a.hosts.join("、") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!accounts.length ? <p className="p-5 text-sm text-cream-dim">還沒有公司。用導入工具 `dropout-onboard provision` 或 `fleet` 開第一家。</p> : null}
      </section>
    </div>
  );
}
