import { formatTwd } from "@/lib/format";

type Tone = "auto" | "warn" | "danger" | "ok" | "none";

/** One way to print NT$: tabular digits, minus sign kept, red when negative unless told otherwise. */
export function Money({ amount, tone = "auto", className = "" }: { amount: number; tone?: Tone; className?: string }) {
  const resolved = tone === "auto" ? (amount < 0 ? "danger" : "none") : tone;
  return (
    <span className="money" data-tone={resolved === "none" ? undefined : resolved}>
      <span className={className}>{formatTwd(amount)}</span>
    </span>
  );
}
