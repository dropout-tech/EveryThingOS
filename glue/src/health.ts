import { lifecycle, type Account } from "./accounts";
import type { Invoice } from "./store";

export type HealthLevel = "high" | "watch" | "ok" | "gone";

export type Health = { score: number; level: HealthLevel; reasons: string[] };

const DAY = 86_400_000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function daysSince(at: unknown, now: Date) {
  if (typeof at !== "string" || !at) return null;
  const t = new Date(at.includes("T") || at.includes("+") ? at : `${at.replace(" ", "T")}+08:00`).getTime();
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY);
}

/**
 * 0–100, start at 100 and subtract (see docs/BILLING.md):
 * - usage: nobody active in 7 days −30, under 30% of seats active −15, usage unreadable −10
 * - last activity: over 14 days ago −20, over 7 days −10
 * - documents: none in 60 days −10, last 30 days under half of the 30 before −15
 * - contract: read-only or suspended −30, past due −20, due within 30 days −10, trial ending within 7 days −10
 * - unpaid: an open invoice older than 30 days −15
 * Under 50 is 高風險, under 75 is 注意. Cancelled companies are not scored.
 */
export function healthScore(a: Account, openInvoices: Pick<Invoice, "created_at">[] = [], now = new Date()): Health {
  const l = lifecycle(a, now);
  if (l.stage === "cancelled") return { score: 0, level: "gone", reasons: ["已解約"] };
  const reasons: string[] = [];
  let score = 100;
  const hit = (points: number, why: string) => {
    score -= points;
    reasons.push(why);
  };

  const u = a.usage ?? {};
  if (typeof u.error === "string") hit(10, "讀不到用量（ERPNext 沒回應）");
  else if (a.usage) {
    const users = num(u.users) ?? 0;
    const week = num(u.active_users_7d);
    const active = week ?? num(u.active_users_30d);
    const span = week === null ? "30" : "7";
    if (active !== null) {
      if (!users || !active) hit(30, `${span} 天沒有人用`);
      else if (active / users < 0.3) hit(15, `${span} 天只有 ${active}／${users} 人在用`);
    }
    const idle = daysSince(u.last_active, now);
    if (idle !== null && idle > 14) hit(20, `最近一次有人用是 ${idle} 天前`);
    else if (idle !== null && idle > 7) hit(10, `${idle} 天沒人登入`);
    const recent = num(u.invoices_30d);
    const before = num(u.invoices_prev_30d);
    if (recent !== null && before !== null) {
      if (!recent && !before) hit(10, "60 天沒有開單");
      else if (before >= 5 && recent < before / 2) hit(15, `單據變少：近 30 天 ${recent} 張，前 30 天 ${before} 張`);
    }
  }

  if (l.stage === "read_only") hit(30, "已到期，只能看");
  else if (l.stage === "suspended") hit(30, "暫停中");
  else if (l.stage === "past_due") hit(20, "已到期，寬限中");
  else if (l.stage === "due_soon" && l.days !== null && l.days <= 30) hit(10, `${l.days} 天後到期`);
  else if (l.stage === "trial" && l.days !== null && l.days <= 7) hit(10, `試用剩 ${l.days} 天`);

  const oldest = Math.max(0, ...openInvoices.map((i) => daysSince(i.created_at, now) ?? 0));
  if (openInvoices.length && oldest > 30) hit(15, `帳單 ${oldest} 天未付`);
  else if (openInvoices.length) reasons.push(`帳單開了 ${oldest} 天，還沒付`);

  score = Math.max(0, Math.min(100, score));
  return { score, level: score < 50 ? "high" : score < 75 ? "watch" : "ok", reasons };
}
