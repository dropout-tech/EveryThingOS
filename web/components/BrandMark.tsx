import Link from "next/link";
import { DropMark } from "./DropMark";

type BrandMarkProps = {
  href?: string;
  compact?: boolean;
};

export function BrandMark({ href = "/", compact = false }: BrandMarkProps) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <span className={`brand-glyph ${compact ? "brand-glyph-compact" : ""}`}>
        <DropMark size={compact ? 18 : 20} />
      </span>
      <span className="flex items-baseline">
        <span className={`display tracking-[-0.01em] ${compact ? "text-sm" : "text-base"}`}>EveryThing</span>
        <span className={`display tracking-[-0.01em] text-cream-dim ${compact ? "text-sm" : "text-base"}`}>OS</span>
      </span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="EveryThingOS 首頁">
      {inner}
    </Link>
  );
}
