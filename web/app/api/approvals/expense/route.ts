import type { NextRequest } from "next/server";
import { refuse, reply, sameOrigin } from "@/lib/actions";
import { expenseErrors, MAX_RECEIPT_BYTES, parseAmount, sniffImage, taipeiDay } from "@/lib/approvals";
import { liveConfig, writeBlocked } from "@/lib/sources/config";
import { deskUrl, erpPost, erpUpload, SourceError } from "@/lib/sources/erpnext";

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
const MAX_BODY = MAX_RECEIPT_BYTES + 64 * 1024;

/**
 * Files one expense claim for the logged-in employee, then attaches the receipt
 * as a private File through Frappe's `upload_file`. Multipart, same origin only.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request, { json: false }) || !(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return refuse("這個請求不是從 DropOut OS 送出的", 403);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return refuse("收據照片太大了，請重拍一張", 413);

  const config = await liveConfig();
  if (!config.erpnext) return refuse("ERPNext 還沒接上，現在是練習模式", 409);
  const blocked = writeBlocked(config);
  if (blocked) return refuse(blocked, 423);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse("看不懂這張報帳單");
  }
  const field = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  const receipt = form.get("receipt");
  const file = receipt instanceof File && receipt.size > 0 ? receipt : null;
  const input = { amount: field("amount"), date: field("date"), category: field("category"), note: field("note").trim(), hasReceipt: Boolean(file) };
  const errors = expenseErrors(input, taipeiDay());
  const first = Object.values(errors)[0];
  if (first) return reply({ ok: false, message: first, errors }, 400);

  let bytes: Uint8Array | null = null;
  let type: keyof typeof EXT | null = null;
  if (file) {
    if (file.size > MAX_RECEIPT_BYTES) return refuse("收據照片太大了，請重拍一張", 413);
    bytes = new Uint8Array(await file.arrayBuffer());
    type = sniffImage(bytes);
    if (!type) return refuse("收據要是照片（JPG、PNG、WebP）", 415);
  }

  let created: { doctype: string; name: string; href?: string };
  let message: string;
  try {
    const result = await erpPost<{ ok: boolean; message?: string; created?: typeof created }>(
      "dropout_core.approvals.new_expense",
      { amount: parseAmount(input.amount), expense_date: input.date, category: input.category, note: input.note || undefined },
      config,
    );
    if (!result.ok || !result.created) return refuse(result.message ?? "ERPNext 沒有建立報帳單", 422);
    created = { ...result.created, href: deskUrl(result.created.href, config) };
    message = result.message ?? `報帳送出了：${created.name}`;
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }

  if (bytes && type) {
    const upload = new FormData();
    upload.set("file", new Blob([bytes as BlobPart], { type }), `收據-${input.date}.${EXT[type]}`);
    upload.set("is_private", "1");
    upload.set("doctype", "Expense Claim");
    upload.set("docname", created.name);
    upload.set("folder", "Home/Attachments");
    try {
      await erpUpload(upload, config);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return reply({ ok: true, created, message: `${message}。但收據沒有傳上去（${why}），請打開報帳單補上。`, receipt: false });
    }
  }
  return reply({ ok: true, created, message, receipt: Boolean(bytes) });
}
