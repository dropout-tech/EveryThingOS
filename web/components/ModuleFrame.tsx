import type { ReactNode } from "react";

type ModuleFrameProps = {
  kicker: string;
  title: string;
  hint?: string;
  children: ReactNode;
};

export function ModuleFrame({ kicker, title, hint, children }: ModuleFrameProps) {
  return (
    <section className="space-y-5">
      <header>
        <p className="scene-type display text-xs tracking-[0.22em] uppercase">{kicker}</p>
        <h2 className="scene-type mt-1 text-2xl font-medium">{title}</h2>
        {hint ? <p className="mt-2 max-w-2xl text-sm text-cream-dim">{hint}</p> : null}
      </header>
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
    <div className="glass overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-ink-2 text-cream-dim">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")} className="border-t border-[var(--line)]">
              {row.map((cell) => (
                <td key={cell} className="px-4 py-3">
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
