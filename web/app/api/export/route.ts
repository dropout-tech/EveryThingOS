import type { NextRequest } from "next/server";
import { ADMIN_ROLE } from "@/lib/access";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { SourceError, erpFile } from "@/lib/sources/erpnext";
import { liveMe } from "@/lib/sources/live";

const EXPORTS: Record<string, { doctype: string; label: string; fields: string[] }> = {
  customers: { doctype: "Customer", label: "客戶", fields: ["name", "customer_name", "customer_group", "territory", "tax_id", "mobile_no", "email_id", "disabled"] },
  items: { doctype: "Item", label: "商品", fields: ["name", "item_name", "item_group", "stock_uom", "is_stock_item", "disabled"] },
  invoices: { doctype: "Sales Invoice", label: "銷項發票", fields: ["name", "customer", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "status", "docstatus"] },
};

const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

/**
 * 設定 → 下載全部資料: one CSV through Frappe's own export (`frappe.desk.reportview.export_query`),
 * as the logged-in user, so ERPNext's export permission and Access Log apply. Reading is never locked by the contract.
 */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  const spec = Object.hasOwn(EXPORTS, kind) ? EXPORTS[kind] : null;
  if (!spec) return new Response("找不到這種匯出", { status: 404 });
  const config = await liveConfig();
  if (!config.erpnext) return new Response("ERPNext 還沒接上", { status: 503 });
  try {
    if (loginRequired(config) && !(await liveMe()).roles.includes(ADMIN_ROLE)) return new Response("只有老闆（System Manager）可以下載全部資料", { status: 403 });
    const table = `\`tab${spec.doctype}\``;
    const res = await erpFile("frappe.desk.reportview.export_query", {
      doctype: spec.doctype,
      file_format_type: "CSV",
      title: spec.doctype,
      fields: spec.fields.map((f) => `${table}.\`${f}\``),
      order_by: `${table}.\`creation\` asc`,
    }, config);
    const body = new Uint8Array(await res.arrayBuffer());
    const hasBom = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf;
    const name = `${config.tenant?.company ?? "DropOut"}-${spec.label}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(hasBom ? body : new Blob([BOM, body]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${spec.doctype.replace(" ", "_")}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof SourceError ? { login: 401, denied: 403, unreachable: 502, upstream: 502 }[error.kind] : 500;
    return new Response(error instanceof Error ? error.message : "匯出失敗", { status });
  }
}
