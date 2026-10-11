import Link from "next/link";
import { buttonClass } from "./ui/Button";

type Action = { href: string; label: string };

/** What to do when a page has nothing yet: one sentence, the next action, and the guide. */
export function EmptyState({
  title,
  detail,
  action,
  secondary,
  help,
  compact = false,
}: {
  title: string;
  detail?: string;
  action?: Action;
  secondary?: Action;
  /** Slug of the /help article. */
  help?: string;
  compact?: boolean;
}) {
  const external = (href: string) => /^https?:/.test(href);
  const link = (a: Action, className: string) =>
    external(a.href) ? (
      <a href={a.href} target="_blank" rel="noreferrer" className={className}>
        {a.label}
      </a>
    ) : (
      <Link href={a.href} className={className}>
        {a.label}
      </Link>
    );

  return (
    <section className={`empty-state glass-well ${compact ? "p-4" : "p-6 md:p-8"}`} aria-label={title}>
      <p className={compact ? "text-sm" : "text-lg"}>{title}</p>
      {detail ? <p className="mt-1 max-w-xl text-sm text-cream-dim">{detail}</p> : null}
      {action || secondary || help ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {action ? link(action, buttonClass({ variant: "primary", size: compact ? "sm" : "md" })) : null}
          {secondary ? link(secondary, "text-cream-dim underline hover:text-cream") : null}
          {help ? (
            <Link href={`/help/${help}`} className="text-cream-dim underline hover:text-cream">
              怎麼做（說明）
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
