import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";
import { MoreText } from "./ui/MoreText";

type PageHeaderProps = {
  /** Shown when the page has no breadcrumb trail. */
  kicker: string;
  title: string;
  /** One-line purpose; longer text folds behind 看更多. */
  hint?: string;
  /** Status chip next to the title, e.g. `<Badge tone="demo" />`. */
  badge?: ReactNode;
  /** The one main thing to do on this page. */
  action?: ReactNode;
};

export function PageHeader({ kicker, title, hint, badge, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="min-w-0 max-w-2xl flex-1">
        <Breadcrumbs fallback={kicker} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="page-title scene-type">{title}</h1>
          {badge}
        </div>
        {hint ? <MoreText className="page-purpose">{hint}</MoreText> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

type ModuleFrameProps = PageHeaderProps & { children: ReactNode };

export function ModuleFrame({ children, ...header }: ModuleFrameProps) {
  return (
    <section className="space-y-6">
      <PageHeader {...header} />
      {children}
    </section>
  );
}

/** A titled block inside a page: same heading size and spacing everywhere. */
export function Section({ title, aside, id, children, className = "" }: { title: string; aside?: ReactNode; id?: string; children: ReactNode; className?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={className}>
      <div className="section-head">
        <h2 id={headingId} className="section-title scene-type">
          {title}
        </h2>
        {aside ? <div className="text-xs text-cream-dim">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="glass sm:overflow-x-auto">
      <table className="table-stack sm:min-w-[40rem]">
        <thead className="bg-ink-2">
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, i) => (
                <td key={`${i}-${cell}`} data-label={columns[i]} data-primary={i === 0 ? "" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
