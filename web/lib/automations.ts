import type { Books } from "./erp";
import { formatTwd } from "./format";

/**
 * 自動化: rule templates written as 「當…就…」. Pure, so the page can show
 * today's hits from demo Books and from what the glue's dry run returns.
 * Ids, parameters and limits match glue/src/automations.ts, which runs them.
 */

export const RULE_IDS = ["invoice_overdue", "quote_followup", "lead_idle", "low_stock", "contract_renewal", "big_order"] as const;
export type RuleId = (typeof RULE_IDS)[number];

export type ParamDef =
  | { key: string; kind: "int"; label: string; unit: string; min: number; max: number; default: number; step?: number }
  | { key: string; kind: "bool"; label: string; default: boolean }
  | { key: string; kind: "user"; label: string; hint: string; default: string };

export type Params = Record<string, number | boolean | string>;

/** One thing a rule would do today. */
export type Hit = { target: string; day: string; title: string; detail: string; actions: string[]; doneBefore?: boolean };

export type Template = {
  id: RuleId;
  title: string;
  when: (p: Params) => string;
  then: (p: Params) => string;
  /** What it creates or sends, in ERPNext words people can look up. */
  touches: string;
  cadence: string;
  params: ParamDef[];
  needsStock?: boolean;
};

export const TEMPLATES: Template[] = [
  {
    id: "invoice_overdue",
    title: "發票逾期提醒",
    when: (p) => `發票過了到期日 ${p.days} 天還沒收到錢`,
    then: (p) => (p.email ? "寄提醒信給客人，並給開單的業務一個待辦" : "給開單的業務一個待辦"),
    touches: "寄 Email 給客人；在 ERPNext 指派待辦（ToDo）給這張銷貨發票的建立者",
    cadence: "每天早上看一次",
    params: [
      { key: "days", kind: "int", label: "逾期幾天", unit: "天", min: 1, max: 365, default: 7 },
      { key: "email", kind: "bool", label: "也寄信給客人", default: true },
    ],
  },
  {
    id: "quote_followup",
    title: "報價沒回要跟進",
    when: (p) => `報價送出 ${p.days} 天，客人還沒回`,
    then: () => "提醒報價的業務打電話跟進",
    touches: "在 ERPNext 指派待辦（ToDo）給報價單的建立者",
    cadence: "每天早上看一次",
    params: [{ key: "days", kind: "int", label: "幾天沒回", unit: "天", min: 1, max: 90, default: 5 }],
  },
  {
    id: "lead_idle",
    title: "新客人沒人跟",
    when: (p) => `新客人 ${p.days} 天沒有任何進度`,
    then: () => "提醒負責的人聯絡",
    touches: "在 ERPNext 指派待辦（ToDo）給潛在客人（Lead）的負責人",
    cadence: "每天早上看一次",
    params: [{ key: "days", kind: "int", label: "幾天沒人跟", unit: "天", min: 1, max: 90, default: 3 }],
  },
  {
    id: "low_stock",
    title: "低於安全庫存就請購",
    when: () => "商品數量低於安全庫存",
    then: (p) => `開一張請購單草稿，補到安全量的 ${p.fill_to}%`,
    touches: "在 ERPNext 開請購單（Material Request）草稿，採購確認後才送出；已經有請購單在跑就不再開",
    cadence: "每天早上看一次",
    needsStock: true,
    params: [{ key: "fill_to", kind: "int", label: "補到安全量的", unit: "%", min: 100, max: 500, default: 150, step: 10 }],
  },
  {
    id: "contract_renewal",
    title: "合約快到期要續約",
    when: (p) => `年約／合約 ${p.days} 天內到期`,
    then: () => "給負責的業務一個續約待辦",
    touches: "在 ERPNext 指派待辦（ToDo）給合約（Contract）的建立者",
    cadence: "每天早上看一次",
    params: [{ key: "days", kind: "int", label: "到期前幾天", unit: "天", min: 1, max: 180, default: 30 }],
  },
  {
    id: "big_order",
    title: "大訂單通知老闆",
    when: (p) => `一筆訂單超過 ${formatTwd(Number(p.amount))}`,
    then: (p) => (p.notify ? `通知 ${p.notify}` : "通知老闆"),
    touches: "在 ERPNext 指派待辦（ToDo）給你指定的人，對方的通知鈴會響",
    cadence: "每小時看一次",
    params: [
      { key: "amount", kind: "int", label: "金額超過", unit: "元", min: 1000, max: 100_000_000, default: 100_000, step: 1000 },
      { key: "notify", kind: "user", label: "通知誰", hint: "填對方登入 ERPNext 用的 Email", default: "" },
    ],
  },
];

export const templateFor = (id: RuleId) => TEMPLATES.find((t) => t.id === id)!;
export const isRuleId = (v: unknown): v is RuleId => typeof v === "string" && (RULE_IDS as readonly string[]).includes(v);

export function defaultParams(id: RuleId): Params {
  return Object.fromEntries(templateFor(id).params.map((p) => [p.key, p.default]));
}

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;

/** Same checks the glue makes; the API route runs this before forwarding anything. */
export function validateParams(id: RuleId, raw: unknown, { enabling = false } = {}): { params: Params } | { error: string } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) return { error: "設定格式不對" };
  const given = (raw ?? {}) as Record<string, unknown>;
  const out: Params = {};
  for (const def of templateFor(id).params) {
    const v = given[def.key] ?? def.default;
    if (def.kind === "int") {
      const n = typeof v === "string" && v.trim() ? Number(v) : v;
      if (typeof n !== "number" || !Number.isInteger(n) || n < def.min || n > def.max) return { error: `「${def.label}」要是 ${def.min.toLocaleString("en-US")} 到 ${def.max.toLocaleString("en-US")} 的整數` };
      out[def.key] = n;
    } else if (def.kind === "bool") {
      if (typeof v !== "boolean") return { error: `「${def.label}」只能開或關` };
      out[def.key] = v;
    } else {
      const s = typeof v === "string" ? v.trim().toLowerCase() : null;
      if (s === null || s.length > 140 || (s && !EMAIL.test(s))) return { error: `「${def.label}」請填 ERPNext 使用者的 Email` };
      if (enabling && !s) return { error: `打開前請先填「${def.label}」` };
      out[def.key] = s;
    }
  }
  return { params: out };
}

export type RuleState = { rule: RuleId; enabled: boolean; params: Params; updatedBy: string | null; updatedAt: string | null; lastEvaluatedAt: string | null; lastError: string | null };

export type RunRow = { id: number; rule: RuleId; target: string; day: string; title: string; detail: string; status: "queued" | "done" | "failed"; result: string | null; error: string | null; createdAt: string; finishedAt: string | null };

export type Automations = { rules: RuleState[]; runs: RunRow[]; mail: boolean };

export function initialRules(): RuleState[] {
  return RULE_IDS.map((rule) => ({ rule, enabled: false, params: defaultParams(rule), updatedBy: null, updatedAt: null, lastEvaluatedAt: null, lastError: null }));
}

/** What demo previews read. Live previews come from the glue's dry run instead. */
export type AutomationFacts = {
  today: string;
  company: string;
  invoices: { no: string; party: string; amount: number; dueDate: string; email: string | null; owner: string }[];
  quotes: { no: string; party: string; amount: number; date: string; owner: string }[];
  leads: { name: string; lastActivity: string; owner: string | null }[];
  stock: { sku: string; name: string; warehouse: string; onHand: number; safety: number; open: boolean }[];
  contracts: { name: string; party: string; endDate: string; owner: string }[];
  orders: { no: string; party: string; amount: number; date: string }[];
};

const DAY = 86_400_000;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const between = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(now);
}

/** Demo facts from the industry pack's Books, with a few made-up quotes, leads and contracts. */
export function demoFacts(books: Books, leads: { name: string }[], company: string, today = taipeiToday()): AutomationFacts {
  const sales = (step: string) => books.sales.filter((d) => d.step === step);
  const owners = ["業務 林小美", "業務 陳大文"];
  const invoices = sales("invoice").map((d, i) => ({ no: d.invoiceNo ?? d.no, party: d.party, amount: d.amount + d.tax, dueDate: addDays(today, -(d.overdueDays ?? 0)), email: i % 2 === 0 ? "billing@example.tw" : null, owner: owners[i % 2] }));
  const worst = books.arAging.find((r) => r.d60 + r.d90 > 0);
  if (worst) invoices.push({ no: "AB-11199870", party: worst.party, amount: worst.d60 + worst.d90, dueDate: addDays(today, -64), email: null, owner: owners[1] });
  const quotes = [
    ...sales("quote").map((d) => ({ no: d.no, party: d.party, amount: d.amount + d.tax, date: addDays(today, -8), owner: owners[0] })),
    { no: "SAL-QTN-0042", party: books.arAging[2]?.party ?? "老客人", amount: 18_900, date: addDays(today, -2), owner: owners[1] },
  ];
  const big = books.sales.find((d) => d.step === "order");
  return {
    today,
    company,
    invoices,
    quotes,
    leads: leads.slice(0, 3).map((l, i) => ({ name: l.name, lastActivity: addDays(today, -[6, 1, 4][i]), owner: i === 2 ? null : owners[i % 2] })),
    stock: books.stock.map((r) => ({ sku: r.sku, name: r.name, warehouse: r.warehouse, onHand: r.onHand, safety: r.safety, open: false })),
    contracts: [
      { name: "CT-2025-0007", party: books.arAging[0]?.party ?? "年約客人", endDate: addDays(today, 18), owner: owners[0] },
      { name: "CT-2025-0011", party: books.arAging[1]?.party ?? "年約客人", endDate: addDays(today, 75), owner: owners[1] },
    ],
    orders: big ? [{ no: "SO-10433", party: big.party, amount: 168_000, date: today }] : [],
  };
}

/** Today's hits for one rule; the same conditions the glue evaluates. */
export function preview(id: RuleId, facts: AutomationFacts, p: Params): Hit[] {
  const today = facts.today;
  const n = (k: string) => Number(p[k]);
  switch (id) {
    case "invoice_overdue":
      return facts.invoices
        .map((r) => ({ r, late: between(r.dueDate, today) }))
        .filter(({ r, late }) => late >= n("days") && r.amount > 0)
        .map(({ r, late }) => ({
          target: r.no,
          day: addDays(r.dueDate, n("days")),
          title: `${r.party} 的發票 ${r.no} 逾期 ${late} 天`,
          detail: `未收 ${formatTwd(r.amount)}，到期日 ${r.dueDate}${p.email && !r.email ? "（客人沒有 Email，只給待辦）" : ""}`,
          actions: [...(p.email && r.email ? [`寄提醒給 ${r.email}`] : []), `給 ${r.owner} 一個待辦`],
        }));
    case "quote_followup":
      return facts.quotes
        .map((r) => ({ r, age: between(r.date, today) }))
        .filter(({ age }) => age >= n("days"))
        .map(({ r, age }) => ({ target: r.no, day: addDays(r.date, n("days")), title: `${r.party} 的報價 ${r.no} ${age} 天沒回`, detail: `金額 ${formatTwd(r.amount)}，${r.date} 報的`, actions: [`給 ${r.owner} 一個待辦`] }));
    case "lead_idle":
      return facts.leads
        .map((r) => ({ r, idle: between(r.lastActivity, today) }))
        .filter(({ idle }) => idle >= n("days"))
        .map(({ r, idle }) => ({ target: r.name, day: addDays(r.lastActivity, n("days")), title: `${r.name} ${idle} 天沒人跟`, detail: r.owner ? `負責人 ${r.owner}` : "還沒有負責人", actions: r.owner ? [`給 ${r.owner} 一個待辦`] : [] }));
    case "low_stock":
      return facts.stock
        .filter((r) => r.safety > 0 && r.onHand < r.safety && !r.open)
        .map((r) => {
          const qty = Math.max(Math.ceil((r.safety * n("fill_to")) / 100 - r.onHand), 1);
          return { target: `${r.sku}|${r.warehouse}`, day: today, title: `${r.name} 剩 ${r.onHand}，低於安全量 ${r.safety}`, detail: `在 ${r.warehouse}；請購 ${qty}`, actions: [`開請購單草稿（${qty}）`] };
        });
    case "contract_renewal":
      return facts.contracts
        .map((r) => ({ r, left: between(today, r.endDate) }))
        .filter(({ left }) => left >= 0 && left <= n("days"))
        .map(({ r, left }) => ({ target: r.name, day: r.endDate, title: `${r.party} 的合約 ${left} 天後到期`, detail: `${r.endDate} 到期`, actions: [`給 ${r.owner} 一個續約待辦`] }));
    case "big_order":
      return facts.orders
        .filter((r) => r.amount >= n("amount"))
        .map((r) => ({ target: r.no, day: r.date, title: `${r.party} 下了 ${formatTwd(r.amount)} 的訂單`, detail: `訂單 ${r.no}，超過 ${formatTwd(n("amount"))}`, actions: [p.notify ? `通知 ${p.notify}` : "通知老闆"] }));
  }
}

/**
 * Demo run: every switched-on rule fires for hits it has not fired for yet
 * (same rule + target + day key as the glue), newest first.
 */
export function simulateRun(rules: RuleState[], facts: AutomationFacts, runs: RunRow[], now = new Date()): RunRow[] {
  const seen = new Set(runs.map((r) => `${r.rule}|${r.target}|${r.day}`));
  let id = runs.reduce((max, r) => Math.max(max, r.id), 0);
  const fresh: RunRow[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const hit of preview(rule.rule, facts, rule.params)) {
      const key = `${rule.rule}|${hit.target}|${hit.day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = now.toISOString();
      fresh.push({ id: ++id, rule: rule.rule, target: hit.target, day: hit.day, title: hit.title, detail: hit.detail, status: "done", result: hit.actions.join("；") || "沒有可以做的動作（沒有負責人）", error: null, createdAt: at, finishedAt: at });
    }
  }
  return [...fresh.reverse(), ...runs].slice(0, 100);
}

export const RUN_STATUS: Record<RunRow["status"], { label: string; tone: "ok" | "warn" | "danger" }> = {
  queued: { label: "排隊中", tone: "warn" },
  done: { label: "做完了", tone: "ok" },
  failed: { label: "沒做成", tone: "danger" },
};

type GlueRule = { rule: string; enabled: boolean; params: Params; updated_by: string | null; updated_at: string | null; last_evaluated_at: string | null; last_error: string | null };
type GlueRun = { id: number; rule: string; target: string; day: string; title: string; detail: string; status: RunRow["status"]; result: string | null; error: string | null; created_at: string; finished_at: string | null };
type GlueHit = { target: string; day: string; title: string; detail: string; actions: ({ type: "todo"; user: string } | { type: "email"; to: string } | { type: "material_request"; qty: number })[]; done_before?: boolean };

export function fromGlue(body: { rules: GlueRule[]; runs: GlueRun[]; mail?: boolean }): Automations {
  return {
    rules: body.rules.filter((r) => isRuleId(r.rule)).map((r) => ({ rule: r.rule as RuleId, enabled: r.enabled, params: r.params, updatedBy: r.updated_by, updatedAt: r.updated_at, lastEvaluatedAt: r.last_evaluated_at, lastError: r.last_error })),
    runs: body.runs.filter((r) => isRuleId(r.rule)).map((r) => ({ id: r.id, rule: r.rule as RuleId, target: r.target, day: r.day, title: r.title, detail: r.detail, status: r.status, result: r.result, error: r.error, createdAt: r.created_at, finishedAt: r.finished_at })),
    mail: Boolean(body.mail),
  };
}

export function hitFromGlue(h: GlueHit): Hit {
  const actions = h.actions.map((a) => (a.type === "todo" ? `給 ${a.user} 一個待辦` : a.type === "email" ? `寄提醒給 ${a.to}` : `開請購單草稿（${a.qty}）`));
  return { target: h.target, day: h.day, title: h.title, detail: h.detail, actions, doneBefore: h.done_before };
}
