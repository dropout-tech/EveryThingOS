import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  compact?: boolean;
};

export function BrandMark({ href = "/", compact = false }: BrandMarkProps) {
  const inner = (
    <span className="flex items-center gap-2">
      <span className={`display tracking-[0.16em] uppercase ${compact ? "text-sm" : "text-base"}`}>
        DropOut
      </span>
      <span className="display text-[11px] tracking-[0.22em] text-cream-dim uppercase">OS</span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="DropOut OS 首頁">
      {inner}
    </Link>
  );
}
