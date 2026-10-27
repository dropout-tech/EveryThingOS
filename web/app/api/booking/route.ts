import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { decideBooking, parseBooking, type BookingRequest } from "@/lib/booking";
import { evaluateCourseBom } from "@/lib/course-bom";
import { getBooks } from "@/lib/sources";
import { liveConfig } from "@/lib/sources/config";
import { erpPost, SourceError } from "@/lib/sources/erpnext";
import { currentIndustry } from "@/lib/workspace";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function limited(key: string, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.delete(hits.keys().next().value!);
  return recent.length > MAX_PER_WINDOW;
}

function bookingMessage(b: BookingRequest) {
  return [`課程預約：${b.courseCode} × ${b.seats} 位`, `分店：${b.branch}`, `時間：${b.date} ${b.slot}`, `來源：${b.channel}`, b.lineId ? `LINE：${b.lineId}` : "", b.note ?? ""].filter(Boolean).join("\n");
}

/**
 * 客人預約課程。ERPNext 接上時開一張課程訂單：材料夠就送出（ERPNext 隨單保留材料包），不夠就留草稿當候補。
 * ERPNext 只能用員工登入讀寫時，預約改走系統同步的公開表單成為一筆待確認名單；兩者都沒接就是練習模式。
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("請從預約頁送出", 403);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return refuse("送出太多次了，請 10 分鐘後再試，或直接傳 LINE 給門市", 429);

  const raw = await readJson<Record<string, unknown>>(request);
  if (raw && String(raw.website ?? "").trim()) return reply({ ok: true, status: "pending" });
  const parsed = parseBooking(raw);
  if (!parsed.ok) return refuse(parsed.message);
  const b = parsed.value;
  const config = await liveConfig();

  if (config.erpnext) {
    try {
      const result = await erpPost<Record<string, unknown>>(
        "dropout_core.actions.book_course",
        { course_code: b.courseCode, branch: b.branch, date: b.date, slot: b.slot, seats: b.seats, parent_name: b.parentName, phone: b.phone, channel: b.channel, line_id: b.lineId, note: b.note },
        config,
      );
      return reply({ ok: Boolean(result.ok), status: result.status as string | undefined, message: result.message as string | undefined });
    } catch (error) {
      if (!(error instanceof SourceError) || error.kind !== "login" || !config.glue) {
        return refuse("現在送不出去，請直接傳 LINE 或打電話給門市", 502);
      }
    }
  }

  if (config.glue) {
    try {
      const res = await fetch(`${config.glue.url}/forms/${encodeURIComponent(config.glue.site)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ form_id: crypto.randomUUID(), name: b.parentName, phone: b.phone, source: `${request.nextUrl.origin}/book`, message: bookingMessage(b) }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      return reply({ ok: true, status: "pending", message: "已收到預約，門市確認名額與材料後會用 LINE 或電話回覆" });
    } catch {
      return refuse("現在送不出去，請直接傳 LINE 或打電話給門市", 502);
    }
  }

  const books = await getBooks(await currentIndustry());
  const bom = books.origin !== "error" ? books.data.courseBoms?.find((c) => c.courseCode === b.courseCode) : undefined;
  if (!bom || books.origin === "error") return refuse("找不到這堂課");
  const decision = decideBooking(evaluateCourseBom(bom, books.data.stock), b.seats);
  return reply({ ok: true, demo: true, status: decision.status, message: `${decision.message}（練習模式，沒有真的送出）` });
}
