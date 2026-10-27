import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { parseBooking, type BookingRequest } from "@/lib/booking";
import { evaluateCourseBom } from "@/lib/course-bom";
import { applyLocks, decodeHolds, decideHold, encodeHolds, HOLD_COOKIE, pushHold, type HoldDecision } from "@/lib/holds";
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

function withHolds(body: { ok: boolean; status?: string; message?: string; demo?: boolean }, holds: ReturnType<typeof pushHold>, request: NextRequest) {
  const res = reply(body);
  res.cookies.set(HOLD_COOKIE, encodeHolds(holds), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 3600,
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
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
  const books = await getBooks(await currentIndustry());
  const bom = books.origin !== "error" ? books.data.courseBoms?.find((c) => c.courseCode === b.courseCode) : undefined;

  if (config.erpnext) {
    try {
      const result = await erpPost<Record<string, unknown>>(
        "dropout_core.actions.book_course",
        { course_code: b.courseCode, branch: b.branch, date: b.date, slot: b.slot, seats: b.seats, parent_name: b.parentName, phone: b.phone, channel: b.channel, line_id: b.lineId, note: b.note, target_seats: bom?.targetSeats },
        config,
      );
      const status = String(result.status ?? "");
      const prior = decodeHolds(request.cookies.get(HOLD_COOKIE)?.value);
      const decision: HoldDecision =
        status === "locked"
          ? { status: "locked", seats: b.seats, locks: [], remainingAfter: 0, reason: "ok", message: String(result.message ?? "") }
          : { status: "waitlist", seats: b.seats, shortBy: 0, bottleneck: null, reason: status === "duplicate" ? "duplicate" : status === "full" ? "full" : "material", message: String(result.message ?? "") };
      const holds = status && status !== "duplicate" ? pushHold(prior, b, bom?.courseName ?? b.courseCode, decision) : prior;
      return withHolds({ ok: Boolean(result.ok), status: status || undefined, message: result.message as string | undefined }, holds, request);
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

  if (!bom || books.origin === "error") return refuse("找不到這堂課");
  const prior = decodeHolds(request.cookies.get(HOLD_COOKIE)?.value);
  const decision = decideHold(evaluateCourseBom(applyLocks(bom, prior), books.data.stock), b, prior);
  const holds = pushHold(prior, b, bom.courseName, decision);
  const status = decision.reason === "duplicate" ? "duplicate" : decision.reason === "full" ? "full" : decision.status;
  return withHolds(
    { ok: true, demo: true, status, message: `${decision.message}（練習模式：倉庫的鎖定和人事的待排已更新，沒有送到店外的系統）` },
    holds,
    request,
  );
}
