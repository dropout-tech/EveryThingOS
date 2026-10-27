import type { BookingDecision, BookingRequest } from "./booking";
import { decideBooking } from "./booking";
import type { CourseBom, EvaluatedCourseBom } from "./course-bom";
import type { ClassDemand } from "./schedule";

/**
 * 一筆預約在名額、材料、師資之間留下的紀錄。
 * 練習模式存在瀏覽器 cookie；接上 ERPNext 時，訂單在 ERPNext，這裡仍留「這堂課還沒有老師」。
 */
export type Hold = {
  id: string;
  courseCode: string;
  courseName: string;
  branch: string;
  date: string;
  slot: string;
  seats: number;
  channel: string;
  phone: string;
  parentName: string;
  status: "locked" | "waitlist";
  /** full＝這班額滿；material＝材料不夠；ok＝已鎖 */
  reason: "ok" | "full" | "material";
  bottleneck: string | null;
  /** 主管確認排入的老師。有值就不再出現在待排。 */
  teacher?: string;
};

export const HOLD_COOKIE = "dropout_holds";
const MAX_HOLDS = 40;

export type HoldDecision = BookingDecision & { reason: Hold["reason"] | "duplicate" };

function isHold(value: unknown): value is Hold {
  if (!value || typeof value !== "object") return false;
  const h = value as Hold;
  return typeof h.id === "string" && typeof h.courseCode === "string" && typeof h.date === "string" && typeof h.slot === "string" && typeof h.seats === "number" && (h.status === "locked" || h.status === "waitlist");
}

export function decodeHolds(raw: string | undefined | null): Hold[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isHold).slice(-MAX_HOLDS) : [];
  } catch {
    return [];
  }
}

export function encodeHolds(holds: readonly Hold[]): string {
  return JSON.stringify(holds.slice(-MAX_HOLDS));
}

/** 已鎖定的預約加進課程的已收人數，材料剩餘名額才會跟著變。 */
export function applyLocks(bom: CourseBom, holds: readonly Hold[]): CourseBom {
  const extra = holds.filter((h) => h.status === "locked" && h.courseCode === bom.courseCode).reduce((sum, h) => sum + h.seats, 0);
  return extra ? { ...bom, bookedSeats: (bom.bookedSeats ?? 0) + extra } : bom;
}

/** 這班還能收幾位：額定人數扣掉已收，再跟材料剩餘取較小的。 */
export function openSeats(bom: EvaluatedCourseBom): number {
  const byRoster = Math.max(0, bom.targetSeats - bom.bookedSeats);
  return Math.min(byRoster, bom.remainingSeats);
}

export function openLabel(bom: EvaluatedCourseBom): string {
  if (!bom.lines.length) return "請洽門市";
  const n = openSeats(bom);
  if (n <= 0) return "額滿，可排候補";
  if (n <= 3) return `剩 ${n} 位`;
  return "可預約";
}

function sameBooking(hold: Hold, request: BookingRequest) {
  return hold.courseCode === request.courseCode && hold.branch === request.branch && hold.date === request.date && hold.slot === request.slot && hold.phone.replace(/\D/g, "") === request.phone.replace(/\D/g, "");
}

/**
 * 先擋重複劃位與額滿，材料不夠才落到原本的候補（並指出缺哪一項）。
 * `evaluated` 要先用 applyLocks 把這台瀏覽器已鎖的人數算進去。
 */
export function decideHold(evaluated: EvaluatedCourseBom, request: BookingRequest, holds: readonly Hold[]): HoldDecision {
  const want = request.seats;
  if (holds.some((h) => sameBooking(h, request))) {
    return { status: "waitlist", seats: want, shortBy: want, bottleneck: null, reason: "duplicate", message: "這個手機在這個時段已經有預約，不會再劃一次。" };
  }
  const sessionLeft = Math.max(0, evaluated.targetSeats - evaluated.bookedSeats);
  const materialLeft = evaluated.remainingSeats;
  if (sessionLeft < want && sessionLeft <= materialLeft) {
    return {
      status: "waitlist",
      seats: want,
      shortBy: want - sessionLeft,
      bottleneck: null,
      reason: "full",
      message: sessionLeft > 0 ? `這個時段只剩 ${sessionLeft} 位（這班額定 ${evaluated.targetSeats} 人、已收 ${evaluated.bookedSeats} 人），先排候補，不會重複劃位。` : `這個時段額滿（額定 ${evaluated.targetSeats} 人、已收 ${evaluated.bookedSeats} 人），先排候補，不會重複劃位。`,
    };
  }
  const decision = decideBooking(evaluated, want);
  if (decision.status === "locked") {
    return { ...decision, reason: "ok", message: `已保留 ${want} 位（${request.date} ${request.slot}）。材料包已鎖定，這堂課會出現在人事的待排，主管確認老師才排入。` };
  }
  return { ...decision, reason: "material" };
}

export function pushHold(holds: readonly Hold[], request: BookingRequest, courseName: string, decision: HoldDecision): Hold[] {
  if (decision.reason === "duplicate") return [...holds];
  const next: Hold = {
    id: Math.random().toString(36).slice(2, 10),
    courseCode: request.courseCode,
    courseName,
    branch: request.branch,
    date: request.date,
    slot: request.slot,
    seats: request.seats,
    channel: request.channel,
    phone: request.phone,
    parentName: request.parentName,
    status: decision.status,
    reason: decision.reason,
    bottleneck: decision.status === "waitlist" ? decision.bottleneck : null,
  };
  return [...holds, next].slice(-MAX_HOLDS);
}

export function coverHold(holds: readonly Hold[], id: string, teacher: string): Hold[] {
  return holds.map((h) => (h.id === id ? { ...h, teacher: teacher.slice(0, 40) } : h));
}

function endSlot(slot: string) {
  const [h, m] = slot.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "12:00";
  const total = Math.min(h * 60 + m + 120, 22 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function skillFor(name: string) {
  if (/STEAM|機器人/.test(name)) return "STEAM 機器人";
  if (/美術|畫/.test(name)) return "美術創作";
  if (/黏土/.test(name)) return "黏土雕塑";
  return "親子手作";
}

/** 已鎖定、還沒有老師的預約，變成人事頁的一筆待排。 */
export function demandsFromHolds(holds: readonly Hold[]): ClassDemand[] {
  return holds
    .filter((h) => h.status === "locked" && !h.teacher)
    .map((h) => ({
      id: `HOLD-${h.id}`,
      branch: h.branch,
      date: h.date,
      startTime: h.slot,
      endTime: endSlot(h.slot),
      courseName: h.courseName,
      requiredSkill: skillFor(h.courseName),
      targetAgeGroup: /兒童/.test(h.courseName) ? "兒童 7–12 歲" : "親子共學",
      enrolledCount: h.seats,
      room: "教室 A",
    }));
}

/** 鎖定的材料加到該分店的已鎖數量；材料候補加到近期需求，請購才看得到。 */
export function stockPressure(holds: readonly Hold[], boms: readonly CourseBom[]): { branchName: string; sku: string; locked: number; demand: number }[] {
  const out = new Map<string, { branchName: string; sku: string; locked: number; demand: number }>();
  for (const hold of holds) {
    const bom = boms.find((b) => b.courseCode === hold.courseCode);
    if (!bom) continue;
    for (const line of bom.lines) {
      const key = `${hold.branch}\0${line.sku}`;
      const row = out.get(key) ?? { branchName: hold.branch, sku: line.sku, locked: 0, demand: 0 };
      const qty = line.qtyPerStudent * hold.seats;
      if (hold.status === "locked") row.locked += qty;
      else if (hold.reason === "material") row.demand += qty;
      out.set(key, row);
    }
  }
  return [...out.values()];
}

export function holdLines(holds: readonly Hold[]): string[] {
  return holds.slice(-6).reverse().map((h) => {
    const what = h.status === "locked" ? (h.teacher ? `已排 ${h.teacher}` : "已鎖材料，等人事排老師") : h.reason === "full" ? "額滿候補" : `材料候補${h.bottleneck ? `（${h.bottleneck}）` : ""}`;
    return `${h.date.slice(5)} ${h.slot} ${h.courseName} · ${h.parentName} · ${h.seats} 位 · ${h.channel} · ${what}`;
  });
}
