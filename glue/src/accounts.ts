/** A customer company's contract with EveryThingOS. Dates are YYYY-MM-DD in Taiwan time. */
export type Account = {
  site: string;
  company: string;
  plan: string;
  state: "active" | "suspended" | "cancelled";
  state_reason?: string | null;
  trial_ends?: string | null;
  renews_on?: string | null;
  contact_email?: string | null;
  /** 統編 and invoice address for DropOut's own renewal invoices. */
  tax_id?: string | null;
  billing_address?: string | null;
  /** ShopProfile chosen at onboarding, so every staff member sees the same modules. */
  profile?: unknown;
  usage?: Record<string, unknown> | null;
  usage_at?: string | null;
  hosts: string[];
  /** Set when the state becomes cancelled, cleared when it comes back; starts the export window. */
  cancelled_at?: string | null;
  /** The site and its backups were deleted (`dropout-onboard fleet purge`). The row stays as contract history. */
  purged_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Stage = "trial" | "active" | "due_soon" | "past_due" | "read_only" | "suspended" | "cancelled";

export type Lifecycle = {
  stage: Stage;
  /** Days until the trial or contract ends; negative once it has passed. */
  days: number | null;
  ends: string | null;
  /** The shell may create or change documents. Reading and exporting always stay open. */
  writable: boolean;
  /** Meeting bots and other paid outbound work keep running. */
  bots: boolean;
  message: string;
};

export const NOTICE_DAYS = 60;
export const GRACE_DAYS = 14;
const DAY = 86_400_000;

const endOfDay = (date: string) => new Date(`${date}T23:59:59+08:00`).getTime();

export function taiwanDate(at = new Date()) {
  return new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function addYears(date: string, years: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

/** A renewal adds whole years to the current end date, or to today once it has passed. */
export function renewalEnd(renewsOn: string | null | undefined, today: string, years = 1) {
  return addYears(renewsOn && renewsOn > today ? renewsOn : today, years);
}

export function lifecycle(a: Pick<Account, "state" | "state_reason" | "trial_ends" | "renews_on">, now = new Date()): Lifecycle {
  if (a.state === "cancelled") {
    return { stage: "cancelled", days: null, ends: a.renews_on ?? null, writable: false, bots: false, message: "已解約。資料保留，可以看和匯出；要回來請聯絡我們。" };
  }
  if (a.state === "suspended") {
    return { stage: "suspended", days: null, ends: a.renews_on ?? null, writable: false, bots: false, message: `帳號暫停${a.state_reason ? `：${a.state_reason}` : ""}。資料都在，可以看和匯出。` };
  }
  const paid = Boolean(a.renews_on);
  const ends = a.renews_on ?? a.trial_ends ?? null;
  if (!ends) return { stage: "active", days: null, ends: null, writable: true, bots: true, message: "" };
  const days = Math.floor((endOfDay(ends) - now.getTime()) / DAY);
  if (days >= 0) {
    const left = days === 0 ? "今天到期" : `還有 ${days} 天`;
    if (!paid) return { stage: "trial", days, ends, writable: true, bots: true, message: `試用${left}（到 ${ends}）。` };
    if (days < NOTICE_DAYS) return { stage: "due_soon", days, ends, writable: true, bots: true, message: `年約 ${ends} 到期，${left}。續約後不會中斷。` };
    return { stage: "active", days, ends, writable: true, bots: true, message: "" };
  }
  const late = -days;
  if (late <= GRACE_DAYS) {
    const left = GRACE_DAYS - late + 1;
    return { stage: "past_due", days, ends, writable: true, bots: true, message: `${paid ? "年約" : "試用"}已在 ${ends} 到期。${left} 天後改成只能看；續約後馬上恢復。` };
  }
  return { stage: "read_only", days, ends, writable: false, bots: false, message: `${paid ? "年約" : "試用"}已在 ${ends} 到期。資料都在，可以看和匯出，不能新增或修改；續約後馬上恢復。` };
}

const REMIND_AT: Partial<Record<Stage, number[]>> = {
  trial: [7, 3, 1, 0],
  due_soon: [59, 30, 14, 7, 1, 0],
  past_due: [-1, -7, -GRACE_DAYS],
  read_only: [-(GRACE_DAYS + 1)],
};

/**
 * The reminder due today, if any. `key` names the stage, end date and day, so
 * each reminder goes out once and a renewal (new end date) starts a fresh set.
 */
export function reminderFor(a: Account, now = new Date(), payUrl?: string | null): { key: string; subject: string; text: string } | null {
  const l = lifecycle(a, now);
  if (l.days === null || !REMIND_AT[l.stage]?.includes(l.days)) return null;
  const subject = {
    trial: `EveryThingOS 試用${l.days === 0 ? "今天到期" : `還有 ${l.days} 天`}`,
    due_soon: `EveryThingOS 年約${l.days === 0 ? "今天到期" : `還有 ${l.days} 天到期`}`,
    past_due: "EveryThingOS 已到期，寬限期內仍可正常使用",
    read_only: "EveryThingOS 已改成只能看",
  }[l.stage as "trial" | "due_soon" | "past_due" | "read_only"];
  return {
    key: `remind:${a.site}:${l.stage}:${l.ends}:${l.days}`,
    subject: `${subject}（${a.company}）`,
    text: `${a.company} 您好，\n\n${l.message}\n\n${payUrl ? `線上付款（刷卡或 ATM）：\n${payUrl}\n\n` : ""}要續約或有任何問題，直接回覆這封信即可。\n\nEveryThingOS`,
  };
}

/** New account or partial update from the admin API. Unknown keys are ignored. */
export function mergeAccount(site: string, current: Account | null, patch: Partial<Account>, now = new Date()): Account {
  const stamp = now.toISOString();
  const base: Account = current ?? {
    site,
    company: patch.company ?? site,
    plan: "annual",
    state: "active",
    hosts: [],
    created_at: stamp,
    updated_at: stamp,
  };
  const next: Account = { ...base, updated_at: stamp };
  for (const key of ["company", "plan", "state", "state_reason", "trial_ends", "renews_on", "contact_email", "tax_id", "billing_address", "profile", "hosts"] as const) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
  }
  next.hosts = [...new Set((next.hosts ?? []).map((h) => normalizeHost(h)).filter(Boolean))];
  next.cancelled_at = next.state !== "cancelled" ? null : base.state === "cancelled" && base.cancelled_at ? base.cancelled_at : stamp;
  return next;
}

/** Days after cancellation the company can still sign in and export (web/lib/legal.ts CONTRACT.exportDays). */
export const EXPORT_DAYS = 90;

export type Purge = { due_on: string | null; due: boolean; purged_at: string | null };

/** Cancelled on day 1 means the export window covers days 1–90 and deletion may start on day 91. */
export function purgeStatus(a: Pick<Account, "state" | "cancelled_at" | "purged_at">, now = new Date()): Purge {
  const purged_at = a.purged_at ?? null;
  if (a.state !== "cancelled" || !a.cancelled_at) return { due_on: null, due: false, purged_at };
  const due_on = addDays(taiwanDate(new Date(a.cancelled_at)), EXPORT_DAYS);
  return { due_on, due: !purged_at && taiwanDate(now) >= due_on, purged_at };
}

export function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}

export function validAccount(a: Account): string | null {
  if (!a.company) return "company 不能空白";
  if (!["active", "suspended", "cancelled"].includes(a.state)) return "state 只能是 active、suspended、cancelled";
  for (const d of [a.trial_ends, a.renews_on]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "日期要寫成 YYYY-MM-DD";
  if (a.hosts.some((h) => !/^[a-z0-9.-]+$/.test(h))) return "網址只能有英數、點和連字號";
  if (a.tax_id && !/^\d{8}$/.test(a.tax_id)) return "統編是 8 位數字";
  return null;
}
