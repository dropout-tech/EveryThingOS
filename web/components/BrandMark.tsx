import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  compact?: boolean;
};

export function BrandMark({ href = "/", compact = false }: BrandMarkProps) {
  const inner = (
    <span className="flex items-center gap-3">
      <Image
        src="/brand/logo-hud-lockup-on-dark.png"
        alt="DropOut 琢奧科技"
        width={compact ? 168 : 220}
        height={compact ? 33 : 43}
        className="h-8 w-auto sm:h-9"
        priority
      />
      {!compact ? (
        <span className="display hidden text-[11px] tracking-[0.22em] text-teal uppercase sm:block">
          OS
        </span>
      ) : null}
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="DropOut OS 首頁">
      {inner}
    </Link>
  );
}
