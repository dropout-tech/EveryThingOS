import Link from "next/link";
import { formatTwd, type Books } from "@/lib/erp";
import type { DayStep } from "@/lib/operator-day";

export function MoneyStrip({ books }: { books: Books }) {
  const cells = [
    { label: "這個月賣了", value: books.monthSales },
    { label: "還有人欠我們", value: books.ar, warn: books.overdueAr > 0 },
    { label: "我們欠廠商", value: books.ap },
    { label: "帳上現金", value: books.cash },
  ];

  return (
    <div className="glass flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0">
          <p className="text-xs text-cream-dim">{cell.label}</p>
          <p className={`mt-1 display text-xl ${cell.warn ? "text-orange" : "text-teal"}`}>
            {formatTwd(cell.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function TodayList({ books }: { books: Books }) {
  const [primary, ...rest] = books.today;

  return (
    <section className="space-y-3">
      <Link href={primary.href} className="glass glass-hero glass-lift block p-7 md:p-8">
        <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">現在先做這件</p>
        <h2 className="mt-3 max-w-xl text-3xl font-medium md:text-4xl">{primary.title}</h2>
        <p className="mt-3 max-w-xl text-sm text-cream-dim">{primary.detail}</p>
        <span className="glass-cta mt-6 inline-flex rounded-full px-5 py-2 text-sm">去做這件</span>
      </Link>
      <ol className="grid gap-3 md:grid-cols-2">
        {rest.map((item, index) => (
          <li key={item.title}>
            <Link href={item.href} className="glass glass-lift block h-full p-5">
              <p className="display text-xs text-cream-dim">接著 {index + 2}</p>
              <p className="mt-2 text-lg">{item.title}</p>
              <p className="mt-2 text-sm text-cream-dim">{item.detail}</p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DailyFlow({ steps, current }: { steps: DayStep[]; current?: string }) {
  return (
    <nav className="glass px-4 py-4" aria-label="每天這條路">
      <p className="text-xs text-cream-dim">每天就走這幾步。格子名稱照這個行業，不必在選單裡找。</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const active = current ? step.href === current || current.startsWith(step.href) : false;
          return (
            <li key={`${step.href}-${step.label}`}>
              <Link
                href={step.href}
                className={`glass-chip block px-3 py-3 ${active ? "text-cream" : "text-cream-dim"}`}
              >
                <p className="display text-[11px]">0{index + 1}</p>
                <p className="mt-1 font-medium">{step.label}</p>
                <p className="mt-1 text-xs text-cream-dim">{step.hint}</p>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
