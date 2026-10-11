import { buildBooks } from "./erp";
import { practiceCast } from "./practice";
import type { IndustryPack } from "./types";

export type ReportSection = "revenue" | "margin" | "aging" | "topCustomers" | "pipeline" | "lowStock";

export type OwnerReport = {
  months: number;
  asOf: string;
  pipelineDays: number;
  revenue: { month: string; amount: number }[] | null;
  margin: { month: string; revenue: number; profit: number; percent: number | null }[] | null;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number } | null;
  topCustomers: { name: string; amount: number; href?: string }[] | null;
  /** A step is null when the user's ERPNext role cannot read that document type. */
  pipeline: { lead: number | null; opportunity: number | null; quotation: number | null; salesOrder: number | null } | null;
  lowStock: { code: string; name: string; warehouse: string; actual: number; projected: number; reorderLevel: number; reorderQty: number; href?: string }[] | null;
  denied: ReportSection[];
  failed: ReportSection[];
  /** Native ERPNext pages for each section; only when connected. */
  links?: Partial<Record<ReportSection | "errors", string>>;
};

export const REPORT_MONTHS = [6, 12, 24] as const;

export function parseMonths(raw: unknown): number {
  const value = Number(raw);
  return (REPORT_MONTHS as readonly number[]).includes(value) ? value : 12;
}

export const SECTION_LABEL: Record<ReportSection, string> = {
  revenue: "每月營收",
  margin: "毛利",
  aging: "帳齡",
  topCustomers: "前十大客人",
  pipeline: "成交漏斗",
  lowStock: "快不夠的貨",
};

/** Desk paths of the ERPNext report behind each section. */
export const NATIVE_REPORT: Record<ReportSection | "errors", string> = {
  revenue: "/app/query-report/Sales%20Invoice%20Trends",
  margin: "/app/query-report/Gross%20Profit",
  aging: "/app/query-report/Accounts%20Receivable",
  topCustomers: "/app/query-report/Sales%20Analytics",
  pipeline: "/app/sales-funnel",
  lowStock: "/app/query-report/Stock%20Projected%20Qty",
  errors: "/app/error-log",
};

export function monthKeys(asOf: Date, months: number): string[] {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return month === "01" ? `${year.slice(2)}年1月` : `${Number(month)}月`;
}

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Practice numbers built from the same demo books as 收錢 and 倉庫, so the pages agree. */
export function demoReport(pack: IndustryPack, months: number, asOf = new Date()): OwnerReport {
  const books = buildBooks(pack);
  const seed = hash(`${pack.id}:reports`);
  const keys = monthKeys(asOf, months);
  const baseMargin = books.monthSales ? 1 - books.monthCost / books.monthSales : 0.4;
  const revenue = keys.map((month, i) => {
    const last = i === keys.length - 1;
    const swing = 0.72 + (((seed >>> (i % 24)) + i * 37) % 45) / 100;
    return { month, amount: last ? books.monthSales : Math.round((books.monthSales * swing) / 1000) * 1000 };
  });
  const margin = revenue.map(({ month, amount }, i) => {
    const pct = baseMargin + ((((seed >>> (i % 16)) + i * 13) % 9) - 4) / 100;
    const profit = Math.round(amount * pct);
    return { month, revenue: amount, profit, percent: amount ? Math.round((profit / amount) * 1000) / 10 : null };
  });
  const sum = (pick: (row: (typeof books.arAging)[number]) => number) => books.arAging.reduce((n, row) => n + pick(row), 0);
  const d90 = sum((r) => r.d90);
  const aging = { d0_30: sum((r) => r.current + r.d30), d31_60: sum((r) => r.d60), d61_90: Math.round(d90 * 0.6), d90plus: d90 - Math.round(d90 * 0.6), total: 0 };
  aging.total = aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90plus;
  const yearTotal = revenue.reduce((n, r) => n + r.amount, 0);
  const topCustomers = practiceCast(pack.id).map((name, i) => ({ name, amount: Math.round((yearTotal * 0.22) / (i + 1.4) / 1000) * 1000 }));
  const lead = 90 + (seed % 70);
  const opportunity = Math.round(lead * 0.46);
  const quotation = Math.round(opportunity * 0.7);
  const lowStock = books.stock
    .filter((row) => row.onHand < row.safety)
    .map((row) => ({ code: row.sku, name: row.name, warehouse: row.warehouse, actual: row.onHand, projected: row.onHand, reorderLevel: row.safety, reorderQty: row.safety * 2 }));

  return {
    months,
    asOf: asOf.toISOString().slice(0, 10),
    pipelineDays: 90,
    revenue,
    margin,
    aging,
    topCustomers,
    pipeline: { lead, opportunity, quotation, salesOrder: Math.round(quotation * 0.48) },
    lowStock,
    denied: [],
    failed: [],
  };
}
