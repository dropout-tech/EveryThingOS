import Link from "next/link";
import { PlatformTable, type PlatformRow } from "@/components/PlatformTable";
import { glueAdmin, type BillingSummary, type PlatformAccount } from "@/lib/platform";
import type { Stage } from "@/lib/sources/config";

function num(v: unknown) {
  return typeof v === "number" ? v : null;
}

function backupAge(iso: string, bytes?: number) {
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
  return `${hours < 1 ? "1 小時內" : `${Math.round(hours)} 小時前`}・${Math.round((bytes ?? 0) / 1048576)} MB`;
}

function Gateway({ label, mode }: { label: string; mode: "production" | "staging" | null }) {
  return (
    <span className="site-chip" data-tone={mode === "production" ? "ok" : mode === "staging" ? "warn" : "bad"}>
      {label}：{mode === "production" ? "正式" : mode === "staging" ? "測試環境（不會真的扣款）" : "沒有設定"}
    </span>
  );
}

export default async function PlatformPage({ searchParams }: PageProps<"/platform">) {
  const [res, bill] = await Promise.all([glueAdmin<{ today: string; accounts: PlatformAccount[] }>("/admin/accounts"), glueAdmin<BillingSummary>("/admin/billing")]);
  if (!res.operator) return null;
  if (!res.ok || !res.data)
    return (
      <p role="alert" className="site-sheet site-error p-5">
        讀不到公司清單：{res.text || res.status}
      </p>
    );
  const { accounts, today } = res.data;
  const billing = bill.ok ? bill.data : null;
  const { sort } = await searchParams;
  const count = (...stages: Stage[]) => accounts.filter((a) => stages.includes(a.lifecycle.stage)).length;
  const rows: PlatformRow[] = accounts.map((a) => {
    const b = billing?.accounts[a.site];
    const db = num(a.usage?.db_mb);
    return {
      site: a.site,
      company: a.company,
      stage: a.lifecycle.stage,
      ends: a.lifecycle.ends,
      health: b?.health ?? null,
      open: b?.open?.amount ?? null,
      einvoiceFailed: Boolean(b?.einvoice_failed),
      users: num(a.usage?.users),
      active: num(a.usage?.active_users_30d),
      invoices: num(a.usage?.invoices_this_month),
      dataMb: db !== null ? Math.round(db + (num(a.usage?.files_mb) ?? 0)) : null,
      usageError: typeof a.usage?.error === "string",
      backup: a.usage?.backup?.offsite?.taken_at ? backupAge(a.usage.backup.offsite.taken_at, a.usage.backup.offsite.bytes) : null,
      backupProblem: a.backup_problem ?? null,
      hosts: a.hosts,
    };
  });
  const purgeDue = accounts.filter((a) => a.purge?.due);
  const staleBackups = accounts.filter((a) => a.backup_problem).length;
  const stats: [string, number | string, string?][] = [
    ["公司", accounts.length],
    ["帳號", rows.reduce((n, r) => n + (r.users ?? 0), 0)],
    ["試用", count("trial")],
    ["60 天內到期", count("due_soon"), count("due_soon") ? "warn" : undefined],
    ["寬限中", count("past_due"), count("past_due") ? "bad" : undefined],
    ["只能看／暫停", count("read_only", "suspended"), count("read_only", "suspended") ? "bad" : undefined],
    ["高風險", billing ? rows.filter((r) => r.health?.level === "high").length : "—", billing && rows.some((r) => r.health?.level === "high") ? "bad" : undefined],
    ["未付帳單", billing ? rows.filter((r) => r.open !== null).length : "—", billing && rows.some((r) => r.open !== null) ? "warn" : undefined],
  ];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" aria-label="總覽">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="site-sheet !rounded-2xl p-4">
            <p className="text-xs text-cream-dim">{label}</p>
            <p className="mt-1 text-2xl tabular-nums">{tone ? <span className="site-chip site-chip-icon !text-xl" data-tone={tone}>{value}</span> : value}</p>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap items-center gap-2 text-xs text-cream-dim">
        <span>今天 {today}（台灣）・用量每天凌晨兩點更新</span>
        {staleBackups ? (
          <span className="site-chip" data-tone="bad">
            {staleBackups} 家備份有問題（看「最近備份」欄）
          </span>
        ) : null}
        {billing ? (
          <>
            <Gateway label="線上付款（綠界）" mode={billing.gateway.ecpay} />
            <Gateway label="電子發票" mode={billing.gateway.einvoice} />
          </>
        ) : (
          <span className="site-chip" data-tone="bad">
            讀不到帳單與健康度：{bill.text || bill.status}
          </span>
        )}
      </div>
      {purgeDue.length ? (
        <section className="site-sheet space-y-2 p-5">
          <h2 className="text-lg font-medium">解約滿 90 天，待刪除</h2>
          <p className="text-xs text-cream-dim">系統不會自動刪。確認客戶已經拿到資料後，在主機上跑 dropout-onboard fleet purge &lt;site&gt;（先預演，再加 --apply）。</p>
          <ul className="space-y-1 text-sm">
            {purgeDue.map((a) => (
              <li key={a.site}>
                <Link href={`/platform/${encodeURIComponent(a.site)}`} className="underline-offset-4 hover:underline">
                  {a.company}
                </Link>
                <span className="text-cream-dim">（{a.site}）解約 {a.cancelled_at?.slice(0, 10) ?? "—"}，{a.purge?.due_on} 起可刪</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <PlatformTable rows={rows} initialSort={sort === "ends" ? "stage" : "risk"} />
    </div>
  );
}
