import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

const DOCTYPES = new Set(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Purchase Order", "Purchase Invoice"]);

/** Takes one sales or purchase document to its next step in ERPNext. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ doctype?: string; name?: string }>(request);
  if (!body?.doctype || !DOCTYPES.has(body.doctype) || !body.name) return refuse("缺少單據");
  return erpAction(request, "dropout_core.actions.advance", { doctype: body.doctype, name: body.name });
}
