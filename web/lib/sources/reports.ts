import "server-only";
import { NATIVE_REPORT, SECTION_LABEL, demoReport, type OwnerReport, type ReportSection } from "../reports";
import type { IndustryPack } from "../types";
import { liveConfig } from "./config";
import { SourceError, deskUrl, erpMethod } from "./erpnext";
import { isLive } from "./index";
import type { Sourced } from "./types";

type RawReport = {
  months: number;
  as_of: string;
  pipeline_days: number;
  revenue: OwnerReport["revenue"];
  margin: OwnerReport["margin"];
  aging: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number } | null;
  top_customers: { customer: string; name: string; amount: number; href: string }[] | null;
  pipeline: { lead: number | null; opportunity: number | null; quotation: number | null; sales_order: number | null } | null;
  low_stock: { item_code: string; item_name: string; warehouse: string; actual: number; projected: number; reorder_level: number; reorder_qty: number; href: string }[] | null;
  denied: string[];
  failed: string[];
};

const SECTION_KEYS: Record<string, ReportSection> = {
  revenue: "revenue",
  margin: "margin",
  aging: "aging",
  top_customers: "topCustomers",
  pipeline: "pipeline",
  low_stock: "lowStock",
};

const DOCTYPE_LABEL: Record<string, string> = { Lead: "詢問（Lead）", Opportunity: "商機", Quotation: "報價", "Sales Order": "訂單" };

export async function getReports(pack: IndustryPack, months: number): Promise<Sourced<OwnerReport>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: demoReport(pack, months) };
  const config = await liveConfig();
  try {
    const raw = await erpMethod<RawReport>("dropout_core.reports.overview", { months }, config);
    const link = (path: string) => deskUrl(path, config);
    const sections = (keys: string[]) => keys.map((key) => SECTION_KEYS[key]).filter(Boolean);
    const data: OwnerReport = {
      months: raw.months,
      asOf: raw.as_of,
      pipelineDays: raw.pipeline_days,
      revenue: raw.revenue,
      margin: raw.margin,
      aging: raw.aging && { d0_30: raw.aging.d0_30, d31_60: raw.aging.d31_60, d61_90: raw.aging.d61_90, d90plus: raw.aging.d90_plus, total: raw.aging.total },
      topCustomers: raw.top_customers?.map((c) => ({ name: c.name, amount: c.amount, href: link(c.href) })) ?? null,
      pipeline: raw.pipeline && { lead: raw.pipeline.lead, opportunity: raw.pipeline.opportunity, quotation: raw.pipeline.quotation, salesOrder: raw.pipeline.sales_order },
      lowStock:
        raw.low_stock?.map((r) => ({ code: r.item_code, name: r.item_name, warehouse: r.warehouse, actual: r.actual, projected: r.projected, reorderLevel: r.reorder_level, reorderQty: r.reorder_qty, href: link(r.href) })) ?? null,
      denied: sections(raw.denied),
      failed: sections(raw.failed),
      links: Object.fromEntries(Object.entries(NATIVE_REPORT).map(([key, path]) => [key, link(path)])),
    };
    const denied = raw.denied.map((key) => (SECTION_KEYS[key] ? SECTION_LABEL[SECTION_KEYS[key]] : DOCTYPE_LABEL[key] ?? key));
    return { origin: "live", system: "erpnext", data, denied, deskUrl: config.erpnext?.url };
  } catch (error) {
    if (error instanceof SourceError) return { origin: "error", system: "erpnext", message: error.message, kind: error.kind };
    return { origin: "error", system: "erpnext", message: error instanceof Error ? error.message : String(error), kind: "upstream" };
  }
}
