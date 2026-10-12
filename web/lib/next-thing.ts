import { SALES_STEP_ORDER, SALES_STEPS, type AgingRow, type SalesDoc, type SalesStep, type StockRow } from "./erp";

/** The open document to do first: a real overdue invoice, otherwise the earliest step. */
export function nextSalesDoc(docs: SalesDoc[]): SalesDoc | null {
  const open = docs.filter((doc) => doc.step !== "paid");
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    const overdue = (b.overdueDays ?? 0) - (a.overdueDays ?? 0);
    if (overdue) return overdue;
    return SALES_STEP_ORDER.indexOf(a.step) - SALES_STEP_ORDER.indexOf(b.step);
  })[0];
}

export function salesPlain(step: SalesStep) {
  return SALES_STEPS.find((row) => row.id === step)?.plain ?? step;
}

/** The person furthest along. Closing them is the next thing; new names wait behind. */
export function nextLead<T extends { stage: string }>(leads: T[], stages: string[]): T | null {
  if (!leads.length || !stages.length) return null;
  return [...leads].sort((a, b) => stageIndex(stages, b.stage) - stageIndex(stages, a.stage))[0];
}

function stageIndex(stages: string[], stage: string) {
  const index = stages.indexOf(stage);
  return index < 0 ? -1 : index;
}

/** The item furthest under its safety quantity. */
export function nextStock(rows: StockRow[]): StockRow | null {
  const low = rows.filter((row) => row.onHand < row.safety);
  if (!low.length) return null;
  return [...low].sort((a, b) => b.safety - b.onHand - (a.safety - a.onHand))[0];
}

/** The customer with the oldest overdue bucket. */
export function nextAging(rows: AgingRow[]): AgingRow | null {
  const late = rows.filter((row) => row.d90 > 0 || row.d60 > 0);
  if (!late.length) return null;
  return [...late].sort((a, b) => b.d90 - a.d90 || b.d60 - a.d60)[0];
}
