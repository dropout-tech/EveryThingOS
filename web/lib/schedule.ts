/**
 * 師資排班與衝堂／請假撞課檢查（對應 Frappe HRMS Shift Assignment + Leave Application）。
 * 1. 同一位老師、同一天、時間重疊 → 衝堂
 * 2. 同一間教室、同一天、時間重疊 → 教室衝突
 * 3. 該位老師當天請假 → 請假撞課（需改派代課老師）
 */

export type ShiftSlot = {
  id: string;
  employee: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  courseName: string;
  room?: string;
  href?: string;
};

export type LeaveSpan = {
  employee?: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
};

export type NewShiftInput = {
  employee: string;
  employeeName?: string;
  date: string;
  startTime: string;
  endTime: string;
  courseName: string;
  room?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function minutesOfDay(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = minutesOfDay(startA);
  const a1 = minutesOfDay(endA);
  const b0 = minutesOfDay(startB);
  const b1 = minutesOfDay(endB);
  if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
  return a0 < b1 && b0 < a1;
}

/** 驗證排班表單輸入。 */
export function parseShiftInput(body: unknown): { ok: true; value: NewShiftInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "沒有收到排班資料" };
  const b = body as Record<string, unknown>;
  const employee = typeof b.employee === "string" ? b.employee.trim() : "";
  if (!employee || employee.length > 140) return { ok: false, message: "要選老師／員工" };
  const employeeName = typeof b.employeeName === "string" && b.employeeName.trim() ? b.employeeName.trim().slice(0, 80) : undefined;
  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!validDate(date)) return { ok: false, message: "排班日期格式不對" };
  const startTime = typeof b.startTime === "string" ? b.startTime.trim() : "";
  const endTime = typeof b.endTime === "string" ? b.endTime.trim() : "";
  const sMin = minutesOfDay(startTime);
  const eMin = minutesOfDay(endTime);
  if (sMin === null || eMin === null) return { ok: false, message: "時間要用 HH:MM（例如 09:00）" };
  if (eMin <= sMin) return { ok: false, message: "下課時間要晚於上課時間" };
  const courseName = typeof b.courseName === "string" ? b.courseName.trim().slice(0, 80) : "";
  if (!courseName) return { ok: false, message: "要填課程或班級名稱" };
  const room = typeof b.room === "string" && b.room.trim() ? b.room.trim().slice(0, 40) : undefined;
  return {
    ok: true,
    value: {
      employee,
      ...(employeeName ? { employeeName } : {}),
      date,
      startTime,
      endTime,
      courseName,
      ...(room ? { room } : {}),
    },
  };
}

/**
 * 檢查新增排班是否與既有排班或已核准／待核准假單衝突。
 * 沒有衝突回傳 null；有衝突回傳給人看的中文說明。
 */
export function scheduleConflict(
  candidate: NewShiftInput,
  existing: readonly ShiftSlot[],
  leaves: readonly LeaveSpan[] = [],
): string | null {
  const teacherLabel = candidate.employeeName || candidate.employee;
  for (const leave of leaves) {
    const samePerson =
      (leave.employee && leave.employee === candidate.employee) ||
      leave.employeeName === candidate.employeeName ||
      leave.employeeName === candidate.employee;
    if (samePerson && leave.fromDate <= candidate.date && candidate.date <= leave.toDate) {
      return `請假衝突：${teacherLabel} 在 ${candidate.date} 請${leave.leaveType}，請改派代課老師。`;
    }
  }

  for (const slot of existing) {
    if (slot.date !== candidate.date) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, slot.startTime, slot.endTime)) continue;
    if (slot.employee === candidate.employee || (candidate.employeeName && slot.employeeName === candidate.employeeName)) {
      return `師資衝堂：${slot.employeeName} 在 ${slot.date} ${slot.startTime}–${slot.endTime} 已經排了「${slot.courseName}」。`;
    }
    if (candidate.room && slot.room && candidate.room === slot.room) {
      return `教室衝突：「${candidate.room}」在 ${slot.date} ${slot.startTime}–${slot.endTime} 已排給 ${slot.employeeName} 的「${slot.courseName}」。`;
    }
  }

  return null;
}

/** 找出既有班表裡，因為老師請假而需要找人代課的班次。 */
export function shiftsNeedingSubstitute(
  shifts: readonly ShiftSlot[],
  leaves: readonly LeaveSpan[],
): (ShiftSlot & { leaveType: string })[] {
  const out: (ShiftSlot & { leaveType: string })[] = [];
  for (const slot of shifts) {
    const hit = leaves.find(
      (l) =>
        ((l.employee && l.employee === slot.employee) || l.employeeName === slot.employeeName) &&
        l.fromDate <= slot.date &&
        slot.date <= l.toDate,
    );
    if (hit) {
      out.push({ ...slot, leaveType: hit.leaveType });
    }
  }
  return out;
}
