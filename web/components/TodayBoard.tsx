import Link from "next/link";
import { buttonClass } from "./ui/Button";
import type { Books } from "@/lib/erp";

export function TodayList({ books }: { books: Books }) {
  const [primary, ...rest] = books.today;

  return (
    <section className="space-y-6">
      <section className="paper-hero" aria-label="現在這件">
        <Link href={primary.href} className="block p-6 focus-visible:[outline-offset:-5px] md:p-8">
          <p className="kicker">現在這件</p>
          <h2 className="mt-4 max-w-xl text-3xl leading-[1.15] font-medium sm:text-4xl md:text-5xl">{primary.title}</h2>
          <p className="mt-4 max-w-xl text-base text-cream-dim">{primary.detail}</p>
          <span className={buttonClass({ variant: "primary", className: "mt-6 px-6" })}>去做</span>
        </Link>
      </section>
      {rest.length ? (
        <ol className="glass-well divide-y divide-[var(--line)] px-2" aria-label="接著做">
          {rest.map((item, index) => (
            <li key={item.title}>
              <Link href={item.href} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm hover:bg-white/5">
                <span className="display text-xs text-cream-dim">0{index + 2}</span>
                <span className="flex-1">{item.title}</span>
                <span aria-hidden="true" className="text-cream-dim">→</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
