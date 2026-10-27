import type { EvaluatedCourseBom } from "./course-bom";

/**
 * 預約綁定課程 BOM：客人從官網、LINE 圖文選單、IG／FB 個人頁連結或門市現場預約，
 * 名額與材料包在同一個判斷裡決定——材料夠才算「已鎖定」，不夠就進候補並告訴店家缺哪一項。
 */

export const BOOKING_CHANNELS = ["官網", "LINE", "Instagram", "Facebook", "電話", "門市現場"] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

export type BookingRequest = {
  courseCode: string;
  branch: string;
  date: string;
  slot: string;
  seats: number;
  parentName: string;
  phone: string;
  lineId?: string;
  channel: BookingChannel;
  note?: string;
};

export type BookingLock = { sku: string; name: string; qty: number; uom: string };

export type BookingDecision =
  | { status: "locked"; seats: number; locks: BookingLock[]; remainingAfter: number; message: string }
  | { status: "waitlist"; seats: number; shortBy: number; bottleneck: string | null; message: string };

const PHONE = /^[0-9+\-\s()]{8,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBooking(raw: unknown, today = new Date()): { ok: true; value: BookingRequest } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "沒有收到預約內容" };
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const courseCode = s(r.courseCode, 60);
  const branch = s(r.branch, 60);
  const date = s(r.date, 10);
  const slot = s(r.slot, 20);
  const parentName = s(r.parentName, 60);
  const phone = s(r.phone, 20);
  const seats = Math.round(Number(r.seats ?? 1));
  const channel = (BOOKING_CHANNELS as readonly string[]).includes(String(r.channel)) ? (r.channel as BookingChannel) : "官網";

  if (!courseCode) return { ok: false, message: "請選課程" };
  if (!branch) return { ok: false, message: "請選分店" };
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) return { ok: false, message: "日期格式不對" };
  const todayTw = new Date(today.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  if (date < todayTw) return { ok: false, message: "不能預約已經過去的日期" };
  if (!slot) return { ok: false, message: "請選時段" };
  if (!Number.isFinite(seats) || seats < 1 || seats > 10) return { ok: false, message: "一次可預約 1–10 位" };
  if (!parentName) return { ok: false, message: "請留家長稱呼" };
  if (!PHONE.test(phone)) return { ok: false, message: "請留可以聯絡的手機" };

  return {
    ok: true,
    value: {
      courseCode,
      branch,
      date,
      slot,
      seats,
      parentName,
      phone,
      lineId: s(r.lineId, 40) || undefined,
      channel,
      note: s(r.note, 300) || undefined,
    },
  };
}

/** 依課程 BOM 的剩餘可收名額決定這筆預約是直接鎖料，還是進候補。 */
export function decideBooking(bom: EvaluatedCourseBom, seats: number): BookingDecision {
  const want = Math.max(1, Math.round(seats));
  if (bom.lines.length && bom.remainingSeats >= want) {
    return {
      status: "locked",
      seats: want,
      locks: bom.lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.qtyPerStudent * want, uom: l.uom })),
      remainingAfter: bom.remainingSeats - want,
      message: `已保留 ${want} 位，材料包同步鎖定`,
    };
  }
  const shortBy = want - bom.remainingSeats;
  const bottleneck = bom.bottleneck?.name ?? null;
  return {
    status: "waitlist",
    seats: want,
    shortBy,
    bottleneck,
    message: bottleneck ? `材料只夠再收 ${bom.remainingSeats} 位（卡在「${bottleneck}」），先排候補，補到料會通知` : "這堂課還沒設定材料，先排候補由店家確認",
  };
}

/** 客人頁上顯示的名額字樣：不把庫存數字給外人看。 */
export function seatsLabel(bom: EvaluatedCourseBom): string {
  if (!bom.lines.length) return "請洽門市";
  if (bom.remainingSeats <= 0) return "額滿，可排候補";
  if (bom.remainingSeats <= 3) return `剩 ${bom.remainingSeats} 位`;
  return "可預約";
}
