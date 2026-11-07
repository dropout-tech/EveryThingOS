/**
 * The two prices EveryThingOS sells (web/lib/commercial.ts shows the same numbers).
 * Amounts already include 5% business tax. AI usage on the AI plan is unlimited for now;
 * a later cap is announced before it starts, so nothing here implies one.
 */
export type PlanId = "monthly" | "ai";

export type Plan = {
  id: PlanId;
  /** Words used in the shell, reminders and payment pages. */
  name: string;
  term: string;
  period: string;
  uom: string;
  months: number;
  amount: number;
  /** Renewal invoice and "due soon" reminders start this many days before the end date. */
  noticeDays: number;
  remindAt: number[];
  /** Meeting bots and AI summaries. */
  ai: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: "monthly", name: "EveryThingOS 月費", term: "月約", period: "一個月", uom: "月", months: 1, amount: 1_000, noticeDays: 7, remindAt: [6, 3, 1, 0], ai: false },
  ai: { id: "ai", name: "EveryThingOS AI 版年約", term: "年約", period: "一年", uom: "年", months: 12, amount: 69_000, noticeDays: 60, remindAt: [59, 30, 14, 7, 1, 0], ai: true },
};

export const DEFAULT_PLAN: PlanId = "monthly";
export const TAX_RATE = 0.05;

export const isPlanId = (plan: unknown): plan is PlanId => plan === "monthly" || plan === "ai";

/** Rows written before the monthly plan existed say "annual"; they are on the monthly plan. */
export function planOf(plan: string | null | undefined): Plan {
  const id = plan?.trim().toLowerCase();
  return PLANS[isPlanId(id) ? id : DEFAULT_PLAN];
}

export const isAiPlan = (plan: string | null | undefined) => planOf(plan).ai;

/** Tax taken out of the tax-included amount, so net + tax equals what the customer pays. */
export function priceOf(plan: string | null | undefined) {
  const { amount } = planOf(plan);
  const tax = Math.round((amount * TAX_RATE) / (1 + TAX_RATE));
  return { net: amount - tax, tax, amount };
}

/** The plan an invoice was opened for, by its amount, so a plan change before payment cannot buy the wrong length. */
export function planForAmount(amount: number, fallback: string | null | undefined): Plan {
  return Object.values(PLANS).find((p) => p.amount === amount) ?? planOf(fallback);
}
