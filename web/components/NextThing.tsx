import type { ReactNode } from "react";

/** One real next action at the top of a workspace page. The rest of the page stays secondary. */
export function NextThing({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <section className="glass glass-hero space-y-3 p-5 md:p-6" aria-label="現在這件">
      <p className="kicker">現在這件</p>
      <h2 className="text-2xl font-medium leading-snug">{title}</h2>
      <p className="max-w-xl text-sm text-cream-dim">{detail}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </section>
  );
}
