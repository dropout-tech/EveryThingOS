/** Label for ERPNext general-ledger month sales. The figure is already untaxed in the books. */
export function monthSalesLabel(): string {
  return "本月銷貨（未稅，總帳）";
}

/** Pair that label with the already-computed month sales amount. Non-finite amounts become 0. */
export function monthSalesLine(amount: number): { label: string; amount: number } {
  return {
    label: monthSalesLabel(),
    amount: Number.isFinite(amount) ? amount : 0,
  };
}
