/** 員工代理人只准做這五個動作。稅額不在這裡決定，也不補 5%。 */

export const AGENT_TOOLS = [
  "create_quotation",
  "advance",
  "record_deposit",
  "deliver_partial",
  "return_against_delivery",
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

const SALES_DOCTYPES = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"] as const;

export type SalesDoctype = (typeof SALES_DOCTYPES)[number];

export type QuotationItem = { item_code: string; qty: number };

export type AgentCall =
  | { ok: true; tool: "create_quotation"; args: { party: string; items: QuotationItem[] } }
  | { ok: true; tool: "advance"; args: { doctype: SalesDoctype; name: string } }
  | { ok: true; tool: "record_deposit"; args: { sales_order: string; amount: number } }
  | { ok: true; tool: "deliver_partial"; args: { sales_order: string; qty: number } }
  | { ok: true; tool: "return_against_delivery"; args: { delivery_note: string; qty: number } }
  | { ok: false; message: string };

const DENIED = "這個動作不能從這裡做";
const TAX = "稅額不由這裡決定";

const TAX_RATE_OR_TAXES = /tax[\s_-]*rates?|\btaxes\b|稅率/i;

function fail(message: string): AgentCall {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentTool(value: string): value is AgentTool {
  return (AGENT_TOOLS as readonly string[]).includes(value);
}

function isSalesDoctype(value: string): value is SalesDoctype {
  return (SALES_DOCTYPES as readonly string[]).includes(value);
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function positive(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

function isTaxNumber(value: unknown): boolean {
  if (typeof value === "number") return Object.is(value, 0.05);
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text === "0.05" || /^5\s*%$/.test(text);
}

function textMentionsTax(text: string): boolean {
  if (TAX_RATE_OR_TAXES.test(text)) return true;
  return /(?:稅|tax)/i.test(text) && /(?:0\.05|5\s*%)/.test(text);
}

/** 參數裡出現稅率、tax_rate、taxes，或把 0.05 當成稅，就拒絕。數量本身是 0.05 不算。 */
function mentionsTax(value: unknown, key?: string): boolean {
  if (key && TAX_RATE_OR_TAXES.test(key)) return true;
  if (key && /tax|稅/i.test(key) && isTaxNumber(value)) return true;
  if (typeof value === "string") return textMentionsTax(value);
  if (Array.isArray(value)) return value.some((item) => mentionsTax(item));
  if (isRecord(value)) return Object.entries(value).some(([child, inner]) => mentionsTax(inner, child));
  return false;
}

function parseItems(value: unknown): QuotationItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: QuotationItem[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const item_code = nonEmpty(row.item_code);
    const qty = positive(row.qty);
    if (!item_code || qty == null) return null;
    items.push({ item_code, qty });
  }
  return items;
}

function parseQuotation(args: Record<string, unknown>): AgentCall {
  const party = nonEmpty(args.party);
  const items = parseItems(args.items);
  if (!party || !items) return fail(DENIED);
  return { ok: true, tool: "create_quotation", args: { party, items } };
}

function parseAdvance(args: Record<string, unknown>): AgentCall {
  const doctype = nonEmpty(args.doctype);
  const name = nonEmpty(args.name);
  if (!doctype || !name || !isSalesDoctype(doctype)) return fail(DENIED);
  return { ok: true, tool: "advance", args: { doctype, name } };
}

function parseDeposit(args: Record<string, unknown>): AgentCall {
  const sales_order = nonEmpty(args.sales_order);
  const amount = positive(args.amount);
  if (!sales_order || amount == null) return fail(DENIED);
  return { ok: true, tool: "record_deposit", args: { sales_order, amount } };
}

function parsePartial(args: Record<string, unknown>): AgentCall {
  const sales_order = nonEmpty(args.sales_order);
  const qty = positive(args.qty);
  if (!sales_order || qty == null) return fail(DENIED);
  return { ok: true, tool: "deliver_partial", args: { sales_order, qty } };
}

function parseReturn(args: Record<string, unknown>): AgentCall {
  const delivery_note = nonEmpty(args.delivery_note);
  const qty = positive(args.qty);
  if (!delivery_note || qty == null) return fail(DENIED);
  return { ok: true, tool: "return_against_delivery", args: { delivery_note, qty } };
}

export function parseAgentCall(input: unknown): AgentCall {
  if (!isRecord(input)) return fail(DENIED);
  const tool = typeof input.tool === "string" ? input.tool.trim() : "";
  if (!isAgentTool(tool)) return fail(DENIED);
  if (!isRecord(input.args)) return fail(DENIED);
  if (mentionsTax(input.args)) return fail(TAX);
  switch (tool) {
    case "create_quotation":
      return parseQuotation(input.args);
    case "advance":
      return parseAdvance(input.args);
    case "record_deposit":
      return parseDeposit(input.args);
    case "deliver_partial":
      return parsePartial(input.args);
    case "return_against_delivery":
      return parseReturn(input.args);
    default:
      return fail(DENIED);
  }
}
