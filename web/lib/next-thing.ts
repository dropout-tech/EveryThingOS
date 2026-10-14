import { SALES_STEP_ORDER, SALES_STEPS, formatTwd, type AgingRow, type SalesDoc, type SalesStep, type StockRow } from "./erp";
import type { OwnerReport } from "./reports";

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

const PURCHASE_RANK = ["請購中", "待付款", "已進貨待付款"];

/** The purchase that is least far along. Paid rows are finished. */
export function nextPurchase<T extends { status: string; next: string }>(rows: T[]): T | null {
  const open = rows.filter((row) => row.next !== "完成");
  if (!open.length) return null;
  const rank = (status: string) => {
    const index = PURCHASE_RANK.indexOf(status);
    return index < 0 ? PURCHASE_RANK.length : index;
  };
  return [...open].sort((a, b) => rank(a.status) - rank(b.status))[0];
}

/** Overdue receivables first, then the shortest stock line. Looking at the chart is not a task. */
export function nextReport(report: OwnerReport): { title: string; detail: string; href: string; label: string } | null {
  const overdue = (report.aging?.d61_90 ?? 0) + (report.aging?.d90plus ?? 0);
  if (overdue > 0) {
    return {
      title: `逾期未收 ${formatTwd(overdue)}`,
      detail: "60 天以上的應收。先去收，報表上的數字才會下來。",
      href: "/workspace/erp/finance",
      label: "去收錢",
    };
  }
  const low = report.lowStock?.find((row) => row.actual < row.reorderLevel) ?? report.lowStock?.[0];
  if (low && report.lowStock?.length) {
    return {
      title: `${low.name} 快不夠`,
      detail: `${low.warehouse} 現有 ${low.actual}，再訂購點 ${low.reorderLevel}。`,
      href: "/workspace/erp/stock",
      label: "去倉庫",
    };
  }
  return null;
}

/** An unsent draft when we can send it; otherwise people still waiting on the confirm mail. */
export function nextLetter<T extends { sent: boolean; scheduled: string | null }>(
  newsletters: T[],
  pending: number,
  canSend: boolean,
): { kind: "draft"; letter: T } | { kind: "pending"; count: number } | null {
  if (canSend) {
    const draft = newsletters.find((letter) => !letter.sent && !letter.scheduled);
    if (draft) return { kind: "draft", letter: draft };
  }
  if (pending > 0) return { kind: "pending", count: pending };
  return null;
}

/** The soonest meeting that has not been turned off. */
export function nextUpcoming<T extends { start: string; skipped: boolean }>(rows: T[] | null): T | null {
  if (!rows?.length) return null;
  const open = rows.filter((row) => !row.skipped);
  if (!open.length) return null;
  return [...open].sort((a, b) => a.start.localeCompare(b.start))[0];
}

/** A fake or bouncing mailbox before an unstable one. Usable addresses are not a task. */
export function nextHygiene<T extends { result: string }>(rows: T[]): T | null {
  const rank = (result: string) => {
    if (result.includes("假")) return 0;
    if (result.includes("退") || result.includes("不穩")) return 1;
    return 9;
  };
  const stuck = rows.filter((row) => rank(row.result) < 9);
  if (!stuck.length) return null;
  return [...stuck].sort((a, b) => rank(a.result) - rank(b.result))[0];
}

/** The customer with the oldest overdue bucket. */
export function nextAging(rows: AgingRow[]): AgingRow | null {
  const late = rows.filter((row) => row.d90 > 0 || row.d60 > 0);
  if (!late.length) return null;
  return [...late].sort((a, b) => b.d90 - a.d90 || b.d60 - a.d60)[0];
}
