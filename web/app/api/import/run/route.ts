import type { NextRequest } from "next/server";
import { reply, refuse } from "@/lib/actions";
import { adminConfig, existing, failure, importOptions, readLimited } from "@/lib/import-server";
import { BATCH_SIZE, KINDS, MAX_ROWS, MAX_TEXT, isKind, prepare, toDoc, type SourceRow } from "@/lib/importer";
import { writeBlocked } from "@/lib/sources/config";
import { deskUrl, erpPost, SourceError } from "@/lib/sources/erpnext";

type Result = { row: number; ok: boolean; name?: string; href?: string; message?: string };

const SLUG: Record<string, string> = { Customer: "customer", Supplier: "supplier", Item: "item" };

function rowsFrom(value: unknown, fields: string[]): SourceRow[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > BATCH_SIZE) return null;
  const out: SourceRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { row, values } = item as { row?: unknown; values?: unknown };
    if (typeof row !== "number" || !Number.isInteger(row) || row < 2 || row > MAX_ROWS + 1) return null;
    if (!values || typeof values !== "object") return null;
    const clean: Record<string, string> = {};
    for (const key of fields) {
      const v = (values as Record<string, unknown>)[key];
      if (v !== undefined && typeof v !== "string") return null;
      clean[key] = typeof v === "string" ? v.slice(0, MAX_TEXT + 1) : "";
    }
    out.push({ row, values: clean });
  }
  return out;
}

/**
 * Inserts one batch (at most BATCH_SIZE rows) as the logged-in owner, one
 * `frappe.client.insert` per row so one bad row does not undo the others
 * (`insert_many` is all-or-nothing and capped at 200). Every row is checked
 * again here with the same rules the wizard showed; rows that already exist are skipped.
 */
export async function POST(request: NextRequest) {
  const read = await readLimited<{ kind?: unknown; rows?: unknown }>(request, 96 * 1024);
  if ("error" in read) return read.error;
  const { kind } = read.body;
  if (!isKind(kind)) return refuse("要先選匯入什麼");
  const spec = KINDS[kind];
  const rows = rowsFrom(read.body.rows, spec.fields.map((f) => f.key));
  if (!rows) return refuse(`每批 1 到 ${BATCH_SIZE} 列`);

  const admin = await adminConfig();
  if ("error" in admin) return admin.error;
  const { config } = admin;
  const blocked = writeBlocked(config);
  if (blocked) return refuse(blocked, 423);

  let options: Awaited<ReturnType<typeof importOptions>>;
  let found: Awaited<ReturnType<typeof existing>>;
  try {
    [options, found] = await Promise.all([importOptions(kind, config), existing(kind, rows.map((r) => r.values[spec.key]).filter(Boolean), [], config)]);
  } catch (error) {
    return failure(error);
  }
  if (kind === "items" && (!options.defaults.item_group || !options.defaults.stock_uom)) {
    return refuse("ERPNext 還沒有商品群組或單位，請先在 ERPNext 的庫存設定填好預設值", 409);
  }

  const prepared = prepare(kind, rows, { existingKeys: found.keys, groups: options.groups, territories: options.territories, uoms: options.uoms });
  const results: Result[] = [];
  let stopped: string | null = null;
  for (const p of prepared) {
    if (stopped) {
      results.push({ row: p.row, ok: false, message: stopped });
      continue;
    }
    if (!p.ok) {
      results.push({ row: p.row, ok: false, message: p.issues.filter((i) => i.level === "error").map((i) => i.problem).join("；") });
      continue;
    }
    try {
      const doc = await erpPost<{ name: string; doctype: string }>("frappe.client.insert", { doc: toDoc(kind, p.values, options.defaults) }, config);
      results.push({ row: p.row, ok: true, name: doc.name, href: deskUrl(`/app/${SLUG[spec.doctype]}/${encodeURIComponent(doc.name)}`, config) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Login, permission or connection problems will fail every following row the same way.
      if (error instanceof SourceError && error.kind !== "upstream") stopped = message;
      results.push({ row: p.row, ok: false, message });
    }
  }
  return reply({ ok: true, results, stopped });
}
