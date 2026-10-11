import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PlatformAccountPanel } from "@/components/PlatformAccountPanel";
import { PlatformInvoices } from "@/components/PlatformInvoices";
import { glueAdmin, type AccountEvent, type GatewayStatus, type Health, type PlatformAccount, type PlatformInvoice } from "@/lib/platform";
import { HEALTH_LABEL, HEALTH_TONE, STAGE_LABEL, STAGE_TONE } from "@/lib/platform-ui";

const USAGE_LABEL: Record<string, string> = {
  users: "帳號",
  active_users_30d: "30 天活躍",
  invoices_this_month: "本月發票",
  db_mb: "資料庫（MB）",
  files_mb: "檔案（MB）",
  error: "讀取錯誤",
};

const SECTIONS = [
  ["contract", "合約"],
  ["billing", "帳單"],
  ["health", "健康度"],
  ["history", "歷史"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="site-sheet scroll-mt-20 space-y-4 !rounded-3xl p-5 sm:p-6">
      <h2 id={`${id}-h`} className="text-lg font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-cream-dim">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export default async function PlatformAccountPage({ params }: PageProps<"/platform/[site]">) {
  const { site } = await params;
  const [res, bill] = await Promise.all([
    glueAdmin<{ account: PlatformAccount; events: AccountEvent[]; dead_letters: number }>(`/admin/accounts/${encodeURIComponent(site)}`),
    glueAdmin<{ gateway: GatewayStatus; health: Health; invoices: PlatformInvoice[] }>(`/admin/accounts/${encodeURIComponent(site)}/invoices`),
  ]);
  if (!res.operator) return null;
  if (res.status === 404) notFound();
  if (!res.ok || !res.data)
    return (
      <p role="alert" className="site-sheet site-error p-5">
        讀不到這家公司：{res.text || res.status}
      </p>
    );
  const { account, events, dead_letters } = res.data;
  const billing = bill.ok ? bill.data : null;
  const health = billing?.health;
  const life = account.lifecycle;

  return (
    <div className="space-y-5">
      <Link href="/platform" className="text-sm text-cream-dim hover:text-cream">
        ← 所有公司
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium sm:text-3xl">{account.company}</h1>
          <p className="mt-1 text-sm text-cream-dim">{account.site}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="site-chip" data-tone={STAGE_TONE[life.stage]}>
              {STAGE_LABEL[life.stage]}
            </span>
            {health ? (
              <span className="site-chip" data-tone={HEALTH_TONE[health.level]}>
                {health.level === "gone" ? HEALTH_LABEL.gone : `健康度 ${health.score}・${HEALTH_LABEL[health.level]}`}
              </span>
            ) : null}
            {dead_letters ? (
              <span className="site-chip" data-tone="warn">
                {dead_letters} 件同步卡住
              </span>
            ) : null}
            {account.backup_problem ? (
              <span className="site-chip" data-tone="bad">
                備份：{account.backup_problem}
              </span>
            ) : null}
            {account.purged_at ? (
              <span className="site-chip">{account.purged_at.slice(0, 10)} 已刪除資料</span>
            ) : account.purge?.due_on ? (
              <span className="site-chip" data-tone={account.purge.due ? "warn" : undefined}>
                {account.purge.due_on} 起可以刪除資料（dropout-onboard fleet purge {account.site}）
              </span>
            ) : null}
          </div>
        </div>
        <nav aria-label="這家公司" className="flex flex-wrap gap-2 text-sm">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="glass-pill px-3 py-1.5">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section id="contract" title="合約">
            {life.message ? <p className="text-sm text-cream-dim">{life.message}</p> : null}
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Fact label="到期">{life.ends ?? "—"}</Fact>
              <Fact label="試用到">{account.trial_ends ?? "—"}</Fact>
              <Fact label="年約到">{account.renews_on ?? "—"}</Fact>
              <Fact label="聯絡人">{account.contact_email ?? "—"}</Fact>
              <Fact label="統編">{account.tax_id ?? "—"}</Fact>
              <Fact label="網址">{account.hosts.join("、") || "—"}</Fact>
            </dl>
            <div className="border-t border-[var(--line)] pt-4">
              <PlatformAccountPanel account={account} />
            </div>
          </Section>
          <Section id="billing" title="帳單">
            {billing ? (
              <PlatformInvoices site={account.site} invoices={billing.invoices} gateway={billing.gateway} />
            ) : (
              <p className="site-error text-sm">讀不到帳單：{bill.text || bill.status}</p>
            )}
          </Section>
        </div>
        <div className="space-y-5">
          <Section id="health" title="健康度">
            {health ? (
              <div className="flex items-start gap-4">
                <span className="text-4xl font-medium tabular-nums">{health.level === "gone" ? "—" : health.score}</span>
                <div className="space-y-1 text-sm">
                  <span className="site-chip" data-tone={HEALTH_TONE[health.level]}>
                    {HEALTH_LABEL[health.level]}
                  </span>
                  {health.reasons.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-cream-dim">
                      {health.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-cream-dim">沒有需要注意的地方。</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-cream-dim">還沒有健康度資料。</p>
            )}
            {dead_letters ? <p className="text-sm text-cream-dim">{dead_letters} 件同步卡住；客戶在設定頁可以看原因並重送。</p> : null}
            <div className="border-t border-[var(--line)] pt-4">
              <h3 className="text-sm text-cream-dim">用量{account.usage_at ? `（${account.usage_at.slice(0, 16).replace("T", " ")} 更新）` : ""}</h3>
              {account.usage ? (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(account.usage).filter(([k]) => k !== "backup").map(([k, v]) => (
                    <Fact key={k} label={USAGE_LABEL[k] ?? k}>
                      <span className="tabular-nums">{String(v)}</span>
                    </Fact>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-cream-dim">還沒收過用量。</p>
              )}
            </div>
          </Section>
          <Section id="history" title="歷史">
            {events.length ? (
              <ol className="space-y-3 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="grid grid-cols-[8.5rem_1fr] gap-x-3">
                    <time className="text-cream-dim tabular-nums">{e.at.slice(0, 16).replace("T", " ")}</time>
                    <span>
                      <span className="font-medium">{e.action}</span>
                      <span className="text-cream-dim">・{e.actor}</span>
                      {e.detail ? <span className="block text-cream-dim">{e.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-cream-dim">還沒有紀錄。</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
