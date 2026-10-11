import type { Stage } from "./sources/config";

export type HealthLevel = "high" | "watch" | "ok" | "gone";
export type Tone = "ok" | "warn" | "bad" | "muted";

export const HEALTH_LABEL: Record<HealthLevel, string> = { high: "高風險", watch: "注意", ok: "健康", gone: "已解約" };
export const HEALTH_TONE: Record<HealthLevel, Tone> = { high: "bad", watch: "warn", ok: "ok", gone: "muted" };

export const STAGE_LABEL: Record<Stage, string> = {
  trial: "試用",
  active: "使用中",
  due_soon: "快到期",
  past_due: "已到期（寬限中）",
  read_only: "只能看",
  suspended: "暫停",
  cancelled: "已解約",
};

export const STAGE_TONE: Record<Stage, Tone> = {
  trial: "muted",
  active: "ok",
  due_soon: "warn",
  past_due: "bad",
  read_only: "bad",
  suspended: "bad",
  cancelled: "muted",
};

/** Most urgent first. */
export const STAGE_ORDER: Stage[] = ["read_only", "past_due", "suspended", "due_soon", "trial", "active", "cancelled"];

export { formatTwd as ntd } from "./format";
