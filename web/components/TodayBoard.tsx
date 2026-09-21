import Link from "next/link";
import type { Books } from "@/lib/erp";

export function TodayList({ books }: { books: Books }) {
  const [primary, ...rest] = books.today;

  return (
    <section className="space-y-6">
      <Link href={primary.href} className="glass glass-hero glass-lift block p-8 md:p-10">
        <p className="display text-[11px] tracking-[0.2em] text-cream-dim uppercase">現在這件</p>
        <h2 className="mt-4 max-w-xl text-4xl leading-[1.12] font-medium md:text-5xl">{primary.title}</h2>
        <p className="mt-4 max-w-xl text-base text-cream-dim">{primary.detail}</p>
        <span className="glass-cta mt-8 inline-flex rounded-full px-5 py-2.5 text-sm">去做</span>
      </Link>
      {rest.length ? (
        <ol className="space-y-2 px-1">
          {rest.map((item, index) => (
            <li key={item.title}>
              <Link href={item.href} className="flex items-baseline gap-3 text-sm text-cream-dim hover:text-cream">
                <span className="display text-xs">0{index + 2}</span>
                <span>{item.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
