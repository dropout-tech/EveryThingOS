import type { ReactNode } from "react";
import Link from "next/link";
import { DeskLink } from "./DeskLink";
import { formatTwd } from "@/lib/erp";
import { REPORT_MONTHS, monthLabel, type OwnerReport, type ReportSection } from "@/lib/reports";

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

function Section({ id, title, hint, report, children }: { id: ReportSection; title: string; hint?: string; report: OwnerReport; children: () => ReactNode }) {
  const link = report.links?.[id];
  return (
    <section className="glass space-y-3 p-5" aria-labelledby={`report-${id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`report-${id}`} className="text-lg">
          {title}
        </h3>
        {link ? (
          <DeskLink href={link} className="text-sm text-cream-dim hover:text-cream">
            在 ERPNext 打開
          </DeskLink>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-cream-dim">{hint}</p> : null}
      {report.denied.includes(id) ? (
        <p className="text-sm text-cream-dim">你的 ERPNext 角色看不到這一段。需要的話，請老闆到「團隊」調整職務。</p>
      ) : report.failed.includes(id) ? (
        <p role="alert" className="text-sm text-orange">
          這一段現在拿不到，其他段落不受影響。原因記在 ERPNext 的
          {report.links?.errors ? (
            <DeskLink href={report.links.errors} className="underline">
              錯誤紀錄
            </DeskLink>
          ) : (
            "錯誤紀錄"
          )}
          。
        </p>
      ) : (
        children()
      )}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-chip p-4">
      <p className="text-sm text-cream-dim">{label}</p>
      <p className="display mt-2 text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-cream-dim">{sub}</p> : null}
    </div>
  );
}

function MonthAxis({ months }: { months: string[] }) {
  const step = months.length > 12 ? 3 : months.length > 6 ? 2 : 1;
  return (
    <div className="grid text-[10px] text-cream-dim" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden="true">
      {months.map((m, i) => (
        <span key={m} className="truncate text-center">
          {(months.length - 1 - i) % step === 0 ? monthLabel(m) : ""}
        </span>
      ))}
    </div>
  );
}

function MonthBars({ rows, label }: { rows: { month: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const w = 100 / rows.length;
  const last = rows[rows.length - 1];
  const best = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);
  return (
    <figure className="space-y-1">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label={`${label}。最近一個月 ${formatTwd(last.value)}，最高是 ${monthLabel(best.month)} ${formatTwd(best.value)}。`}>
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity="0.5" />
        ))}
        {rows.map((r, i) => {
          const h = (Math.max(0, r.value) / max) * 38;
          return (
            <rect key={r.month} x={i * w + w * 0.18} y={40 - h} width={w * 0.64} height={h} fill="var(--teal)" opacity={i === rows.length - 1 ? 0.95 : 0.5}>
              <title>{`${monthLabel(r.month)} ${formatTwd(r.value)}`}</title>
            </rect>
          );
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      </svg>
      <MonthAxis months={rows.map((r) => r.month)} />
    </figure>
  );
}

function PercentLine({ rows, label }: { rows: { month: string; percent: number | null }[]; label: string }) {
  const values = rows.map((r) => r.percent).filter((v): v is number => v !== null);
  if (!values.length) return <p className="text-sm text-cream-dim">這段期間沒有銷貨，算不出毛利率。</p>;
  const top = Math.max(10, ...values) * 1.1;
  const bottom = Math.min(0, ...values);
  const w = 100 / rows.length;
  const y = (v: number) => 40 - ((v - bottom) / (top - bottom)) * 38;
  const segments: string[][] = [[]];
  rows.forEach((r, i) => {
    if (r.percent === null) segments.push([]);
    else segments[segments.length - 1].push(`${(i + 0.5) * w},${y(r.percent)}`);
  });
  const lastValue = values[values.length - 1];
  return (
    <figure className="space-y-1">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full" role="img" aria-label={`${label}。最近一個月 ${lastValue}%，期間最低 ${Math.min(...values)}%，最高 ${Math.max(...values)}%。`}>
        {bottom < 0 ? <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--line)" vectorEffect="non-scaling-stroke" /> : null}
        {segments
          .filter((s) => s.length)
          .map((s) =>
            s.length === 1 ? (
              <line key={s[0]} x1={Number(s[0].split(",")[0]) - w * 0.2} x2={Number(s[0].split(",")[0]) + w * 0.2} y1={s[0].split(",")[1]} y2={s[0].split(",")[1]} stroke="var(--teal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ) : (
              <polyline key={s.join(" ")} points={s.join(" ")} fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ),
          )}
        <line x1="0" x2="100" y1="40" y2="40" stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      </svg>
      <MonthAxis months={rows.map((r) => r.month)} />
    </figure>
  );
}

function Numbers({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-cream-dim">看每月數字</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left">
          <thead className="text-cream-dim">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])} className="border-t border-[var(--line)]">
                {row.map((cell, i) => (
                  <td key={i} className="px-2 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function HBar({ value, max }: { value: number; max: number }) {
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-2 w-full" aria-hidden="true">
      <rect x="0" y="0" width="100" height="4" fill="var(--line)" opacity="0.35" />
      <rect x="0" y="0" width={max ? (Math.max(0, value) / max) * 100 : 0} height="4" fill="var(--teal)" opacity="0.8" />
    </svg>
  );
}

const AGING_BUCKETS: { key: "d0_30" | "d31_60" | "d61_90" | "d90plus"; label: string; opacity: number; tone: string }[] = [
  { key: "d0_30", label: "未到期與 30 天內", opacity: 0.3, tone: "" },
  { key: "d31_60", label: "31–60 天", opacity: 0.55, tone: "" },
  { key: "d61_90", label: "61–90 天", opacity: 0.8, tone: "text-gold" },
  { key: "d90plus", label: "超過 90 天", opacity: 1, tone: "text-orange" },
];

function AgingBar({ aging }: { aging: NonNullable<OwnerReport["aging"]> }) {
  const parts = AGING_BUCKETS.map((b) => ({ ...b, value: Math.max(0, aging[b.key]) }));
  const whole = parts.reduce((n, p) => n + p.value, 0);
  const widths = parts.map((p) => (whole ? (p.value / whole) * 100 : 0));
  const starts = widths.map((_, i) => widths.slice(0, i).reduce((n, w) => n + w, 0));
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-4 w-full" role="img" aria-label={`應收合計 ${formatTwd(aging.total)}：${parts.map((p) => `${p.label} ${formatTwd(p.value)}`).join("，")}。`}>
        <rect x="0" y="0" width="100" height="6" fill="var(--line)" opacity="0.25" />
        {parts.map((p, i) => (
          <rect key={p.key} x={starts[i]} y="0" width={widths[i]} height="6" fill="var(--teal)" opacity={p.opacity} />
        ))}
      </svg>
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex items-start gap-2">
            <svg viewBox="0 0 10 10" className="mt-1 h-3 w-3 shrink-0" aria-hidden="true">
              <rect width="10" height="10" fill="var(--teal)" opacity={p.opacity} />
            </svg>
            <div>
              <dt className="text-cream-dim">{p.label}</dt>
              <dd className={p.value && p.tone ? p.tone : ""}>{formatTwd(p.value)}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

const PIPELINE_STEPS: { key: keyof NonNullable<OwnerReport["pipeline"]>; label: string }[] = [
  { key: "lead", label: "有人來問" },
  { key: "opportunity", label: "有機會（商機）" },
  { key: "quotation", label: "報了價" },
  { key: "salesOrder", label: "答應要了（訂單）" },
];

export function ReportBoard({ report, demo }: { report: OwnerReport; demo: boolean }) {
  const revenue = report.revenue;
  const margin = report.margin;
  const thisMonth = revenue?.[revenue.length - 1];
  const lastMonth = revenue?.[revenue.length - 2];
  const marginNow = margin?.[margin.length - 1];
  const aging = report.aging;
  const unavailable = (id: ReportSection) => (report.denied.includes(id) ? "你的角色看不到" : "現在拿不到");

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="期間">
        {REPORT_MONTHS.map((m) => (
          <Link key={m} href={`/workspace/reports?months=${m}`} aria-current={m === report.months ? "page" : undefined} className={`rounded-full px-3 py-1.5 ${m === report.months ? "glass-cta" : "glass-chip"}`}>
            近 {m} 個月
          </Link>
        ))}
        <span className="text-xs text-cream-dim">算到 {report.asOf}</span>
        {demo ? <span className="glass-chip px-3 py-1 text-xs">示範資料</span> : null}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="本月營收（未稅）" value={thisMonth ? formatTwd(thisMonth.amount) : "—"} sub={thisMonth ? (lastMonth ? `上個月整月 ${formatTwd(lastMonth.amount)}` : undefined) : unavailable("revenue")} />
        <Kpi label={`近 ${report.months} 個月營收`} value={revenue ? formatTwd(revenue.reduce((n, r) => n + r.amount, 0)) : "—"} sub={revenue ? "已扣掉退貨" : unavailable("revenue")} />
        <Kpi label="本月毛利率" value={marginNow?.percent != null ? `${marginNow.percent}%` : "—"} sub={marginNow ? `毛利 ${formatTwd(marginNow.profit)}` : margin ? undefined : unavailable("margin")} />
        <Kpi label="還沒收到的錢" value={aging ? formatTwd(aging.total) : "—"} sub={aging ? `超過 60 天 ${formatTwd(aging.d61_90 + aging.d90plus)}` : unavailable("aging")} />
      </div>

      <Section id="revenue" title="每月營收" hint="已送出的銷項發票，未稅，扣掉退貨（折讓單）。" report={report}>
        {() => (
          <>
            <MonthBars rows={revenue!.map((r) => ({ month: r.month, value: r.amount }))} label="每月營收長條圖" />
            <Numbers head={["月份", "營收"]} rows={revenue!.map((r) => [r.month, formatTwd(r.amount)])} />
          </>
        )}
      </Section>

      <Section id="margin" title="毛利" hint="照 ERPNext 毛利報表算：營收減掉出貨當下的成本。服務類沒有成本的品項，毛利等於營收。" report={report}>
        {() => (
          <>
            <PercentLine rows={margin!} label="每月毛利率折線圖" />
            <Numbers head={["月份", "營收", "毛利", "毛利率"]} rows={margin!.map((r) => [r.month, formatTwd(r.revenue), formatTwd(r.profit), r.percent === null ? "—" : `${r.percent}%`])} />
          </>
        )}
      </Section>

      <Section id="aging" title="誰欠我們多久（帳齡）" hint="照 ERPNext 應收帳款報表，從付款到期日算起。" report={report}>
        {() => (aging!.total ? <AgingBar aging={aging!} /> : <p className="text-sm text-cream-dim">沒有人欠款。</p>)}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="topCustomers" title="前十大客人" hint={`近 ${report.months} 個月的銷項發票，未稅，扣掉退貨。`} report={report}>
          {() => {
            const rows = report.topCustomers!;
            if (!rows.length) return <p className="text-sm text-cream-dim">這段期間還沒有開發票。</p>;
            const total = revenue?.reduce((n, r) => n + r.amount, 0) ?? 0;
            return (
              <ol className="space-y-3 text-sm">
                {rows.map((c, i) => (
                  <li key={c.name + i} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span>
                        <span className="text-cream-dim">{i + 1}.</span> {c.href ? <DeskLink href={c.href} className="hover:underline">{c.name}</DeskLink> : c.name}
                      </span>
                      <span>
                        {formatTwd(c.amount)}
                        {total > 0 ? <span className="ml-2 text-xs text-cream-dim">{percent(c.amount, total)}</span> : null}
                      </span>
                    </div>
                    <HBar value={c.amount} max={rows[0].amount} />
                  </li>
                ))}
              </ol>
            );
          }}
        </Section>

        <Section id="pipeline" title="從詢問到成交" hint={`近 ${report.pipelineDays} 天新開的單數。每一步各自計數，不是同一批人一路追。`} report={report}>
          {() => {
            const p = report.pipeline!;
            const max = Math.max(1, ...PIPELINE_STEPS.map((s) => p[s.key] ?? 0));
            return (
              <ol className="space-y-3 text-sm">
                {PIPELINE_STEPS.map((step, i) => {
                  const value = p[step.key];
                  const prev = i > 0 ? p[PIPELINE_STEPS[i - 1].key] : null;
                  return (
                    <li key={step.key} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{step.label}</span>
                        <span>
                          {value === null ? <span className="text-cream-dim">看不到</span> : value}
                          {value !== null && prev ? <span className="ml-2 text-xs text-cream-dim">前一步的 {percent(value, prev)}</span> : null}
                        </span>
                      </div>
                      <HBar value={value ?? 0} max={max} />
                    </li>
                  );
                })}
              </ol>
            );
          }}
        </Section>
      </div>

      <Section id="lowStock" title="快不夠的貨" hint="跟 ERPNext 自動補貨同一個算法：預計數量（現有＋已訂未到－已接單未出）低於再訂購點。" report={report}>
        {() => {
          const rows = report.lowStock!;
          if (!rows.length) return <p className="text-sm text-cream-dim">沒有低於再訂購點的貨。品項要在 ERPNext 設好再訂購點才會列進來。</p>;
          return (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-cream-dim">
                  <tr>
                    <th className="px-2 py-2 font-medium">品項</th>
                    <th className="px-2 py-2 font-medium">倉庫</th>
                    <th className="px-2 py-2 font-medium">現有</th>
                    <th className="px-2 py-2 font-medium">預計</th>
                    <th className="px-2 py-2 font-medium">再訂購點</th>
                    <th className="px-2 py-2 font-medium">建議補</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.code}-${r.warehouse}`} className="border-t border-[var(--line)]">
                      <td className="px-2 py-2">{r.href ? <DeskLink href={r.href} className="hover:underline">{r.name}</DeskLink> : r.name}</td>
                      <td className="px-2 py-2 text-cream-dim">{r.warehouse}</td>
                      <td className="px-2 py-2">{r.actual}</td>
                      <td className={`px-2 py-2 ${r.projected <= 0 ? "text-orange" : "text-gold"}`}>{r.projected}</td>
                      <td className="px-2 py-2">{r.reorderLevel}</td>
                      <td className="px-2 py-2">{r.reorderQty || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Section>
    </div>
  );
}
