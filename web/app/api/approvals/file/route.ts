import type { NextRequest } from "next/server";
import { sniffImage } from "@/lib/approvals";
import { liveConfig } from "@/lib/sources/config";
import { erpFile, SourceError } from "@/lib/sources/erpnext";

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 404 };
const MAX_BYTES = 10 * 1024 * 1024;

function fail(message: string, status: number) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Shows one receipt photo from ERPNext as the logged-in person. ERPNext decides
 * who may see it (`dropout_core.approvals.receipt`); only images are passed on.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{1,140}$/.test(id)) return fail("沒有這個檔案", 400);
  const config = await liveConfig();
  if (!config.erpnext) return fail("練習模式沒有收據檔案", 404);
  let res: Response;
  try {
    res = await erpFile("dropout_core.approvals.receipt", { file: id }, config);
  } catch (error) {
    if (error instanceof SourceError) return fail(error.message, STATUS[error.kind]);
    return fail("拿不到這個檔案", 502);
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return fail("檔案太大，請在 ERPNext 打開", 413);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return fail("檔案太大，請在 ERPNext 打開", 413);
  const type = sniffImage(bytes);
  if (!type) return fail("這不是照片，請在 ERPNext 打開", 415);
  return new Response(bytes, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=300",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
