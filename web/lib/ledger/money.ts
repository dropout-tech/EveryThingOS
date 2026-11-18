/** 生意頁那套：未稅加 5%，結果是整數新台幣。不接收瀏覽器算好的合計。 */

const MAX_TWD = 10_000_000;

export type PriceLine = {
  itemCode: string;
  itemName: string;
  qty: number;
  /** 單價，整數新台幣。 */
  rate: number;
  /** 這一列的未稅金額，整數新台幣。 */
  amount: number;
};

export type PricedQuote = {
  ok: true;
  untaxed: number;
  tax: number;
  total: number;
  lines: PriceLine[];
};

export type PriceFailure = { ok: false; error: string };

export type RawLine = { itemCode?: string; itemName?: string; qty?: number; rate?: number };

/**
 * 單價先收成整數新台幣，列金額是數量乘上那個整數再四捨五入。
 * 未稅是列金額加總，稅是 Math.round(未稅 × 0.05)，含稅是未稅加稅。
 * 12000 → 稅 600、含稅 12600。
 */
export function priceLines(items: RawLine[]): PricedQuote | PriceFailure {
  if (!items.length) return { ok: false, error: "至少要有一項商品，數量大於 0" };
  if (items.length > 50) return { ok: false, error: "一次最多 50 項" };
  const lines: PriceLine[] = [];
  for (const item of items) {
    const qty = Number(item.qty);
    const rate = Number(item.rate);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return { ok: false, error: "數量要大於 0" };
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_TWD) return { ok: false, error: "單價要是 0 以上的數字" };
    const rateTwd = Math.round(rate);
    const amount = Math.round(qty * rateTwd);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_TWD) return { ok: false, error: "金額超出範圍" };
    const itemCode = (item.itemCode ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
    if (!itemCode) return { ok: false, error: "缺少品項" };
    const itemName = (item.itemName ?? itemCode).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || itemCode;
    lines.push({ itemCode, itemName, qty, rate: rateTwd, amount });
  }
  const untaxed = lines.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isSafeInteger(untaxed) || untaxed <= 0 || untaxed > MAX_TWD) return { ok: false, error: "未稅金額要是 1 到一千萬之間的整數" };
  const tax = Math.round(untaxed * 0.05);
  return { ok: true, untaxed, tax, total: untaxed + tax, lines };
}

/** 收款金額。只收整數新台幣，不用來重算稅。 */
export function paymentAmount(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_TWD) return null;
  const amount = Math.round(raw);
  if (amount <= 0 || amount > MAX_TWD) return null;
  return amount;
}
