/** 這一筆還能不能下。limit 沒有或是 0 表示不限。金額直接加，不另算稅。 */

export type CreditDecision = { ok: true } | { ok: false; message: string };

export function canOrder(input: { limit?: number | null; outstanding: number; nextAmount: number }): CreditDecision {
  const { limit, outstanding, nextAmount } = input;
  if (limit == null || limit === 0) return { ok: true };
  if (outstanding + nextAmount > limit) return { ok: false, message: "超過信用額度" };
  return { ok: true };
}
