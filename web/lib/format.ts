const grouping = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

/** NT$12,345 — negatives as −NT$12,345 so the sign is never lost between the symbol and the digits. */
export function formatTwd(amount: number) {
  const rounded = Math.round(amount);
  const body = `NT$${grouping.format(Math.abs(rounded))}`;
  return rounded < 0 ? `−${body}` : body;
}

/** Short money for tiles: NT$1.2 萬, NT$350 萬. Falls back to the full figure under 10,000. */
export function formatTwdShort(amount: number) {
  const abs = Math.abs(amount);
  if (abs < 10000) return formatTwd(amount);
  const wan = abs / 10000;
  const text = `NT$${wan >= 100 ? Math.round(wan).toLocaleString("zh-TW") : wan.toFixed(1).replace(/\.0$/, "")} 萬`;
  return amount < 0 ? `−${text}` : text;
}

export function formatNumber(value: number) {
  return grouping.format(value);
}

export function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${value}%`;
}
