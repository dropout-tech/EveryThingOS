import Link from "next/link";
import { formatTwd, type Books } from "@/lib/erp";

export function MoneyStrip({ books }: { books: Books }) {
  const cells = [
    { label: "這個月賣了", value: books.monthSales },
    { label: "還有人欠我們", value: books.ar, warn: books.overdueAr > 0 },
    { label: "我們欠廠商", value: books.ap },
    { label: "帳上現金", value: books.cash },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((cell) => (
        <article key={cell.label} className="rounded-2xl border border-[var(--line)] bg-ink-2 p-4">
          <p className="text-xs text-cream-dim">{cell.label}</p>
          <p className={`mt-2 display text-2xl ${cell.warn ? "text-orange" : "text-teal"}`}>
            {formatTwd(cell.value)}
          </p>
        </article>
      ))}
    </div>
  );
}

export function TodayList({ books }: { books: Books }) {
  const tone = {
    urgent: "border-orange text-orange",
    warn: "border-gold text-gold",
    ok: "border-teal text-teal",
  } as const;

  return (
    <section>
      <h2 className="text-lg">今天只要做這三件</h2>
      <p className="mt-1 text-sm text-cream-dim">
        鼎新 A1／億看要把這些散在應收帳款、庫存、電子發票三個選單。這裡直接排好。
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {books.today.map((item, index) => (
          <li key={item.title}>
            <Link
              href={item.href}
              className={`block h-full rounded-2xl border p-4 ${tone[item.tone]}`}
            >
              <p className="display text-xs">0{index + 1}</p>
              <p className="mt-2 text-cream">{item.title}</p>
              <p className="mt-2 text-sm text-cream-dim">{item.detail}</p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
