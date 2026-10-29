import { canOrder } from "@/lib/credit";

export function CreditHint({
  limit,
  outstanding,
  nextAmount,
}: {
  limit?: number | null;
  outstanding: number;
  nextAmount: number;
}) {
  const decision = canOrder({ limit, outstanding, nextAmount });
  if (!decision.ok) {
    return <p className="text-xs text-warn">超過信用額度</p>;
  }
  return null;
}
