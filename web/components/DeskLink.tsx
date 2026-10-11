import type { ReactNode } from "react";

/** Opens the record in ERPNext, where the change is actually made. */
export function DeskLink({ href, children, className = "underline underline-offset-2" }: { href?: string; children: ReactNode; className?: string }) {
  if (!href) return <span className="text-cream-dim">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
