import "server-only";
import type { NextRequest } from "next/server";
import { ADMIN_ROLE } from "./access";
import { refuse, sameOrigin } from "./actions";
import { KINDS, type CheckContext, type DocDefaults, type ImportKind } from "./importer";
import { liveConfig, type LiveConfig } from "./sources/config";
import { erpPost, SourceError } from "./sources/erpnext";
import { liveMe } from "./sources/live";

export const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };

export function failure(error: unknown) {
  if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
  return refuse(error instanceof Error ? error.message : String(error), 500);
}

/** Reads a same-origin JSON body no bigger than `limit` bytes. */
export async function readLimited<T>(request: NextRequest, limit: number): Promise<{ body: T } | { error: Response }> {
  if (!sameOrigin(request)) return { error: refuse("這個請求不是從 DropOut OS 送出的", 403) };
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return { error: refuse("一次送太多了，請分批", 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > limit) return { error: refuse("一次送太多了，請分批", 413) };
  try {
    return { body: JSON.parse(text) as T };
  } catch {
    return { error: refuse("看不懂送來的資料") };
  }
}

/** Live ERPNext and the logged-in person is the owner (System Manager); otherwise the refusal to send back. */
export async function adminConfig(): Promise<{ config: LiveConfig } | { error: Response }> {
  const config = await liveConfig();
  if (!config.erpnext) return { error: refuse("ERPNext 還沒接上，現在是示範模式", 409) };
  try {
    const me = await liveMe();
    if (!me.roles.includes(ADMIN_ROLE)) return { error: refuse("只有老闆（System Manager）可以匯入資料", 403) };
  } catch (error) {
    return { error: failure(error) };
  }
  return { config };
}

type Row = Record<string, string | null>;

function list(config: LiveConfig, doctype: string, fields: string[], filters: unknown[] = [], limit = 2000) {
  return erpPost<Row[]>("frappe.client.get_list", { doctype, fields, filters, limit_page_length: limit, order_by: "name asc" }, config);
}

async function single(config: LiveConfig, doctype: string, field: string) {
  try {
    return (await erpPost<string | null>("frappe.client.get_single_value", { doctype, field }, config)) || "";
  } catch (error) {
    if (error instanceof SourceError && error.kind !== "upstream") throw error;
    return "";
  }
}

const names = (rows: Row[]) => rows.map((r) => r.name ?? "").filter(Boolean);

export type ImportOptions = Required<Pick<CheckContext, "groups">> & Pick<CheckContext, "territories" | "uoms"> & { defaults: DocDefaults; priceList?: string };

/** Link values ERPNext will accept, and the defaults used when a row leaves them blank. */
export async function importOptions(kind: ImportKind, config: LiveConfig): Promise<ImportOptions> {
  if (kind === "customers") {
    const [groups, territories, group, territory] = await Promise.all([
      list(config, "Customer Group", ["name"], [["is_group", "=", 0]]),
      list(config, "Territory", ["name"], [["is_group", "=", 0]]),
      single(config, "Selling Settings", "customer_group"),
      single(config, "Selling Settings", "territory"),
    ]);
    return { groups: names(groups), territories: names(territories), defaults: { customer_group: group, territory } };
  }
  if (kind === "suppliers") {
    const [groups, group] = await Promise.all([list(config, "Supplier Group", ["name"], [["is_group", "=", 0]]), single(config, "Buying Settings", "supplier_group")]);
    return { groups: names(groups), defaults: { supplier_group: group } };
  }
  const [groups, uoms, group, uom, priceList] = await Promise.all([
    list(config, "Item Group", ["name"], [["is_group", "=", 0]]),
    list(config, "UOM", ["name"], [], 5000),
    single(config, "Stock Settings", "item_group"),
    single(config, "Stock Settings", "stock_uom"),
    single(config, "Selling Settings", "selling_price_list"),
  ]);
  const g = names(groups);
  const u = names(uoms);
  const item_group = group || g.find((n) => ["Products", "產品", "商品"].includes(n)) || g[0] || "";
  const stock_uom = uom || (u.includes("Nos") ? "Nos" : u[0] ?? "");
  return { groups: g, uoms: u, defaults: { item_group, stock_uom }, priceList: priceList || undefined };
}

const KEY_FIELD: Record<ImportKind, string> = { customers: "customer_name", suppliers: "supplier_name", items: "item_code" };

/** Which of `keys` (names or item codes) and `taxIds` already exist. Compared case-insensitively, like the wizard. */
export async function existing(kind: ImportKind, keys: string[], taxIds: string[], config: LiveConfig) {
  const spec = KINDS[kind];
  const field = KEY_FIELD[kind];
  const found = new Set<string>();
  const taxes: Record<string, string> = {};
  const chunks = <T,>(items: T[], size = 100) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
  for (const chunk of chunks(keys)) {
    const rows = await list(config, spec.doctype, [field], [[field, "in", chunk]], chunk.length * 3);
    for (const r of rows) if (r[field]) found.add(r[field]!.trim().toLowerCase());
  }
  if (kind !== "items") {
    for (const chunk of chunks(taxIds)) {
      const rows = await list(config, spec.doctype, [field, "tax_id"], [["tax_id", "in", chunk]], chunk.length * 3);
      for (const r of rows) if (r.tax_id && r[field] && !taxes[r.tax_id]) taxes[r.tax_id] = r[field]!;
    }
  }
  return { keys: keys.filter((k) => found.has(k.trim().toLowerCase())), taxIds: taxes };
}

export function strings(value: unknown, max: number, length: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string" || v.length > length) return null;
    if (v.trim()) out.push(v.trim());
  }
  return [...new Set(out)];
}
