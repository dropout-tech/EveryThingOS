/** 記加班的輸入。倍數與上限由 ERPNext 的 dropout_hr_tw.labor_rules 算，這裡只擋明顯不對的輸入。 */

export const OVERTIME_KINDS = {
  weekday: "平日延長",
  rest: "休息日",
  holiday: "國定假日或特休日出勤",
  disaster: "天災、事變或突發事件（平日）",
  rest_disaster: "天災、事變或突發事件（休息日）",
  regular_off: "例假（僅限天災等）",
} as const;

export type OvertimeKind = keyof typeof OVERTIME_KINDS;

export type OvertimeInput = { employee: string; work_date: string; hours: number; kind: OvertimeKind; reason?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REASON_MAX = 200;

function realDate(value: string) {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 回傳整理好的輸入，或一句給人看的錯誤。 */
export function parseOvertime(body: unknown): { ok: true; value: OvertimeInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "沒有收到加班資料" };
  const b = body as Record<string, unknown>;
  const employee = typeof b.employee === "string" ? b.employee.trim() : "";
  if (!employee || employee.length > 140) return { ok: false, message: "要選員工" };
  const workDate = typeof b.work_date === "string" ? b.work_date : "";
  if (!realDate(workDate)) return { ok: false, message: "日期格式不對" };
  const hours = typeof b.hours === "number" ? b.hours : typeof b.hours === "string" ? Number(b.hours) : Number.NaN;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { ok: false, message: "時數要大於 0、不超過 24" };
  const kind = typeof b.kind === "string" && Object.hasOwn(OVERTIME_KINDS, b.kind) ? (b.kind as OvertimeKind) : null;
  if (!kind) return { ok: false, message: "要選加班種類" };
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, REASON_MAX) : "";
  return { ok: true, value: { employee, work_date: workDate, hours, kind, ...(reason ? { reason } : {}) } };
}
