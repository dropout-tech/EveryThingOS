/** 給客人看的一張單。金額是數量乘單價，稅額固定 0，後餘是前餘加本筆。 */

export type SlipLine = {
  item: string;
  qty: number;
  rate: number;
};

export type SlipInput = {
  party: string;
  lines: SlipLine[];
  previousBalance: number;
};

function amountOf(line: SlipLine) {
  return line.qty * line.rate;
}

function figure(value: number) {
  return String(value);
}

export function formatSlip({ party, lines, previousBalance }: SlipInput): string {
  const current = lines.reduce((sum, line) => sum + amountOf(line), 0);
  const balance = previousBalance + current;
  const rows = lines.map((line) => `品名 ${line.item} 數量 ${figure(line.qty)} 金額 ${figure(amountOf(line))}`);
  return [
    `客人 ${party}`,
    ...rows,
    `前餘 ${figure(previousBalance)}`,
    `本筆 ${figure(current)}`,
    `後餘 ${figure(balance)}`,
    "稅額 0",
  ].join("\n");
}
