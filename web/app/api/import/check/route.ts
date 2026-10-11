import type { NextRequest } from "next/server";
import { reply, refuse } from "@/lib/actions";
import { adminConfig, existing, failure, importOptions, readLimited, strings } from "@/lib/import-server";
import { MAX_CELL, MAX_ROWS, isKind } from "@/lib/importer";

/**
 * 匯入精靈的「檢查」：告訴瀏覽器檔案裡哪些名稱／料號、統編在 ERPNext 已經有了，
 * 以及群組、地區、單位可以填哪些。只回比對到的那幾筆，不回整份客人名單。
 */
export async function POST(request: NextRequest) {
  const read = await readLimited<{ kind?: unknown; keys?: unknown; taxIds?: unknown }>(request, 512 * 1024);
  if ("error" in read) return read.error;
  const { kind } = read.body;
  if (!isKind(kind)) return refuse("要先選匯入什麼");
  const keys = strings(read.body.keys, MAX_ROWS, MAX_CELL);
  const taxIds = strings(read.body.taxIds ?? [], MAX_ROWS, 8);
  if (!keys || !taxIds || taxIds.some((t) => !/^\d{8}$/.test(t))) return refuse(`一次最多 ${MAX_ROWS} 列`);
  const admin = await adminConfig();
  if ("error" in admin) return admin.error;
  try {
    const [found, options] = await Promise.all([existing(kind, keys, taxIds, admin.config), importOptions(kind, admin.config)]);
    return reply({ ok: true, existing: found, options });
  } catch (error) {
    return failure(error);
  }
}
