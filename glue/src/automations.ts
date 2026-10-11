import { addDays, lifecycle, taiwanDate } from "./accounts";
import { D1AutomationStore, type AutomationStore, type RuleState, type Run } from "./automation-store";
import { ERPNext, UpstreamError, type Fetch } from "./clients";
import type { Deps, ErpEvent } from "./jobs";
import { errorText, log } from "./log";
import { escapeHtml } from "./mail";
import type { Store, Tenant } from "./store";
import { fanOut } from "./webhooks";

/**
 * 自動化: 「當…就…」 rules each company can switch on. The cron reads ERPNext with
 * the company's integration user, and every hit becomes one row in
 * automation_runs (unique per rule + document + trigger day) before a queue job
 * does the work, so a reminder never goes out twice.
 *
 * Keep RULES in step with web/lib/automations.ts (same ids, params and limits).
 */

export const RULE_IDS = ["invoice_overdue", "quote_followup", "lead_idle", "low_stock", "contract_renewal", "big_order"] as const;
export type RuleId = (typeof RULE_IDS)[number];

type IntParam = { kind: "int"; min: number; max: number; default: number };
type BoolParam = { kind: "bool"; default: boolean };
type UserParam = { kind: "user"; default: string };
type ParamSpec = IntParam | BoolParam | UserParam;

export const RULES: Record<RuleId, { label: string; cadence: "daily" | "hourly"; params: Record<string, ParamSpec> }> = {
  invoice_overdue: { label: "發票逾期提醒", cadence: "daily", params: { days: { kind: "int", min: 1, max: 365, default: 7 }, email: { kind: "bool", default: true } } },
  quote_followup: { label: "報價沒回要跟進", cadence: "daily", params: { days: { kind: "int", min: 1, max: 90, default: 5 } } },
  lead_idle: { label: "新客人沒人跟", cadence: "daily", params: { days: { kind: "int", min: 1, max: 90, default: 3 } } },
  low_stock: { label: "低於安全庫存就請購", cadence: "daily", params: { fill_to: { kind: "int", min: 100, max: 500, default: 150 } } },
  contract_renewal: { label: "合約快到期要續約", cadence: "daily", params: { days: { kind: "int", min: 1, max: 180, default: 30 } } },
  big_order: { label: "大訂單通知老闆", cadence: "hourly", params: { amount: { kind: "int", min: 1000, max: 100_000_000, default: 100_000 }, notify: { kind: "user", default: "" } } },
};

/** Most documents one rule acts on per run; the rest wait for the next run. */
export const MAX_HITS = 30;
/** Daily rules start once Taiwan is at work. */
export const DAILY_FROM_HOUR = 8;
const HOURLY_MS = 55 * 60_000;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;
const OPEN_MR = ["Draft", "Pending", "Partially Ordered", "Ordered", "Partially Received"];

export const isRuleId = (v: unknown): v is RuleId => typeof v === "string" && (RULE_IDS as readonly string[]).includes(v);

export function defaultParams(rule: RuleId): Record<string, unknown> {
  return Object.fromEntries(Object.entries(RULES[rule].params).map(([k, p]) => [k, p.default]));
}

/** Unknown keys are dropped; anything out of range is refused with a sentence people can act on. */
export function validateParams(rule: RuleId, raw: unknown, { enabling = false } = {}): { params: Record<string, unknown> } | { error: string } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) return { error: "設定格式不對" };
  const given = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(RULES[rule].params)) {
    const v = given[key] ?? spec.default;
    if (spec.kind === "int") {
      const n = typeof v === "string" && v.trim() ? Number(v) : v;
      if (typeof n !== "number" || !Number.isInteger(n) || n < spec.min || n > spec.max) return { error: `${key} 要是 ${spec.min} 到 ${spec.max} 的整數` };
      out[key] = n;
    } else if (spec.kind === "bool") {
      if (typeof v !== "boolean") return { error: `${key} 只能是開或關` };
      out[key] = v;
    } else {
      const s = typeof v === "string" ? v.trim().toLowerCase() : null;
      if (s === null || s.length > 140 || (s && !EMAIL.test(s))) return { error: "要通知的人請填 ERPNext 使用者的 Email" };
      if (enabling && !s) return { error: "請先填要通知誰（ERPNext 使用者的 Email）" };
      out[key] = s;
    }
  }
  return { params: out };
}

export type Action =
  | { type: "todo"; user: string; doctype: string; name: string; note: string; date: string }
  | { type: "email"; to: string; subject: string; text: string }
  | { type: "material_request"; item_code: string; item_name: string; warehouse: string; qty: number; uom: string };

export type Hit = {
  target: string;
  /** The day the condition first became true; with the target it makes the run unique. */
  day: string;
  title: string;
  detail: string;
  doctype: string;
  name: string;
  party_type?: string;
  party?: string;
  actions: Action[];
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const money = (v: number) => `NT$${Math.round(v).toLocaleString("en-US")}`;
const dayOf = (v: unknown) => s(v).slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const realUser = (u: string) => (u && u !== "Guest" ? u : "");

export type Rows = Record<string, unknown>[];

/** What one rule's ERPNext reads look like; `evaluate` is pure so tests and dry runs share it. */
export type Facts =
  | { rule: "invoice_overdue" | "quote_followup" | "lead_idle" | "contract_renewal" | "big_order"; rows: Rows }
  | { rule: "low_stock"; items: Rows; bins: Rows; open: Rows };

export function evaluate(rule: RuleId, params: Record<string, unknown>, facts: Facts, today: string, company = ""): Hit[] {
  const hits: Hit[] = [];
  if (facts.rule === "low_stock") {
    const levels = new Map<string, { level: number; reorder: number; uom: string; item_name: string }>();
    for (const r of facts.items) levels.set(`${s(r.name)}|${s(r.reorder_warehouse)}`, { level: n(r.reorder_level), reorder: n(r.reorder_qty), uom: s(r.stock_uom), item_name: s(r.item_name) || s(r.name) });
    const covered = new Set(facts.open.map((r) => `${s(r.item_code)}|${s(r.warehouse)}`));
    const fill = n(params.fill_to) / 100;
    for (const b of facts.bins) {
      const key = `${s(b.item_code)}|${s(b.warehouse)}`;
      const lvl = levels.get(key);
      const onHand = n(b.actual_qty);
      if (!lvl || lvl.level <= 0 || onHand >= lvl.level || covered.has(key)) continue;
      const qty = Math.max(Math.ceil(lvl.level * fill - onHand), Math.ceil(lvl.reorder), 1);
      hits.push({
        target: key,
        day: today,
        title: `${lvl.item_name} 剩 ${onHand}，低於安全量 ${lvl.level}`,
        detail: `在 ${s(b.warehouse)}；請購 ${qty} ${lvl.uom}`,
        doctype: "Item",
        name: s(b.item_code),
        actions: [{ type: "material_request", item_code: s(b.item_code), item_name: lvl.item_name, warehouse: s(b.warehouse), qty, uom: lvl.uom }],
      });
    }
    return hits.slice(0, MAX_HITS);
  }

  for (const r of facts.rows) {
    const name = s(r.name);
    const owner = realUser(s(r.owner));
    if (facts.rule === "invoice_overdue") {
      const due = dayOf(r.due_date);
      const late = daysBetween(due, today);
      if (!due || late < n(params.days) || n(r.outstanding_amount) <= 0) continue;
      const party = s(r.customer_name) || s(r.customer);
      const amount = n(r.outstanding_amount);
      const actions: Action[] = [];
      const email = s(r.contact_email).trim().toLowerCase();
      if (params.email && EMAIL.test(email)) {
        actions.push({
          type: "email",
          to: email,
          subject: `付款提醒：發票 ${name}`,
          text: `${party} 您好，\n\n發票 ${name}（到期日 ${due}）還有 ${money(amount)} 尚未收到款項。\n如果已經付款，請忽略這封信；有任何問題，直接回覆這封信就可以。\n\n${company || "謝謝您"}`,
        });
      }
      if (owner) actions.push({ type: "todo", user: owner, doctype: "Sales Invoice", name, note: `跟 ${party} 收款：發票 ${name} 逾期 ${late} 天，未收 ${money(amount)}`, date: today });
      hits.push({ target: name, day: addDays(due, n(params.days)), title: `${party} 的發票 ${name} 逾期 ${late} 天`, detail: `未收 ${money(amount)}，到期日 ${due}${actions.some((a) => a.type === "email") ? "" : params.email ? "（客人沒有 Email，只給待辦）" : ""}`, doctype: "Sales Invoice", name, party_type: "Customer", party: s(r.customer), actions });
    } else if (facts.rule === "quote_followup") {
      const date = dayOf(r.transaction_date);
      const age = daysBetween(date, today);
      if (!date || age < n(params.days)) continue;
      const party = s(r.customer_name) || s(r.party_name);
      hits.push({
        target: name,
        day: addDays(date, n(params.days)),
        title: `${party} 的報價 ${name} ${age} 天沒回`,
        detail: `金額 ${money(n(r.grand_total))}，${date} 報的`,
        doctype: "Quotation",
        name,
        party_type: s(r.quotation_to) || undefined,
        party: s(r.party_name) || undefined,
        actions: owner ? [{ type: "todo", user: owner, doctype: "Quotation", name, note: `跟進 ${party} 的報價 ${name}（${age} 天沒回）`, date: today }] : [],
      });
    } else if (facts.rule === "lead_idle") {
      const last = dayOf(r.modified);
      const idle = daysBetween(last, today);
      if (!last || idle < n(params.days)) continue;
      const who = realUser(s(r.lead_owner)) || owner;
      const party = s(r.lead_name) || s(r.company_name) || name;
      hits.push({
        target: name,
        day: addDays(last, n(params.days)),
        title: `${party} ${idle} 天沒人跟`,
        detail: who ? `負責人 ${who}` : "還沒有負責人",
        doctype: "Lead",
        name,
        party_type: "Lead",
        party: name,
        actions: who ? [{ type: "todo", user: who, doctype: "Lead", name, note: `聯絡新客人 ${party}（${idle} 天沒人跟）`, date: today }] : [],
      });
    } else if (facts.rule === "contract_renewal") {
      const end = dayOf(r.end_date);
      const left = daysBetween(today, end);
      if (!end || left < 0 || left > n(params.days)) continue;
      const party = s(r.party_name);
      hits.push({
        target: name,
        day: end,
        title: `${party} 的合約 ${left} 天後到期`,
        detail: `${end} 到期`,
        doctype: "Contract",
        name,
        party_type: s(r.party_type) || undefined,
        party: party || undefined,
        actions: owner ? [{ type: "todo", user: owner, doctype: "Contract", name, note: `跟 ${party} 談續約（合約 ${end} 到期）`, date: today }] : [],
      });
    } else if (facts.rule === "big_order") {
      const amount = n(r.base_grand_total);
      if (amount < n(params.amount)) continue;
      const party = s(r.customer_name) || s(r.customer);
      const boss = s(params.notify);
      hits.push({
        target: name,
        day: dayOf(r.transaction_date),
        title: `${party} 下了 ${money(amount)} 的訂單`,
        detail: `訂單 ${name}，超過 ${money(n(params.amount))}`,
        doctype: "Sales Order",
        name,
        party_type: "Customer",
        party: s(r.customer),
        actions: boss ? [{ type: "todo", user: boss, doctype: "Sales Order", name, note: `大訂單：${party} ${money(amount)}（${name}）`, date: today }] : [],
      });
    }
  }
  return hits.slice(0, MAX_HITS);
}

const page = { start: 0, limit: MAX_HITS * 2 };

/** Fixed fields and filters per rule; nothing from the request reaches the query except validated numbers. */
export async function readFacts(erp: ERPNext, rule: RuleId, params: Record<string, unknown>, today: string): Promise<Facts> {
  switch (rule) {
    case "invoice_overdue":
      return {
        rule,
        rows: await erp.list("Sales Invoice", {
          fields: ["name", "customer", "customer_name", "due_date", "outstanding_amount", "contact_email", "owner"],
          filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["outstanding_amount", ">", 0], ["due_date", "<=", addDays(today, -n(params.days))]],
          orderBy: "due_date asc",
          ...page,
        }),
      };
    case "quote_followup":
      return {
        rule,
        rows: await erp.list("Quotation", {
          fields: ["name", "quotation_to", "party_name", "customer_name", "transaction_date", "grand_total", "owner"],
          filters: [["docstatus", "=", 1], ["status", "=", "Open"], ["transaction_date", "<=", addDays(today, -n(params.days))]],
          orderBy: "transaction_date asc",
          ...page,
        }),
      };
    case "lead_idle":
      return {
        rule,
        rows: await erp.list("Lead", {
          fields: ["name", "lead_name", "company_name", "lead_owner", "owner", "modified"],
          filters: [["status", "in", ["Lead", "Open"]], ["modified", "<", `${addDays(today, 1 - n(params.days))} 00:00:00`]],
          orderBy: "modified asc",
          ...page,
        }),
      };
    case "contract_renewal":
      return {
        rule,
        rows: await erp.list("Contract", {
          fields: ["name", "party_type", "party_name", "end_date", "owner"],
          filters: [["docstatus", "=", 1], ["status", "!=", "Inactive"], ["end_date", ">=", today], ["end_date", "<=", addDays(today, n(params.days))]],
          orderBy: "end_date asc",
          ...page,
        }),
      };
    case "big_order":
      return {
        rule,
        rows: await erp.list("Sales Order", {
          fields: ["name", "customer", "customer_name", "base_grand_total", "transaction_date", "owner"],
          filters: [["docstatus", "=", 1], ["base_grand_total", ">=", n(params.amount)], ["transaction_date", ">=", addDays(today, -1)]],
          orderBy: "transaction_date desc",
          ...page,
        }),
      };
    case "low_stock": {
      const items = await erp.list("Item", {
        fields: ["name", "item_name", "stock_uom", "`tabItem Reorder`.warehouse as reorder_warehouse", "`tabItem Reorder`.warehouse_reorder_level as reorder_level", "`tabItem Reorder`.warehouse_reorder_qty as reorder_qty"],
        filters: [["Item", "disabled", "=", 0], ["Item", "is_stock_item", "=", 1], ["Item Reorder", "warehouse_reorder_level", ">", 0]],
        orderBy: "`tabItem`.name asc",
        start: 0,
        limit: 500,
      });
      const codes = [...new Set(items.map((r) => s(r.name)))];
      if (!codes.length) return { rule, items, bins: [], open: [] };
      const [bins, open] = await Promise.all([
        erp.list("Bin", { fields: ["item_code", "warehouse", "actual_qty"], filters: [["item_code", "in", codes]], orderBy: "item_code asc", start: 0, limit: 1000 }),
        openRequests(erp, codes),
      ]);
      return { rule, items, bins, open };
    }
  }
}

function openRequests(erp: ERPNext, codes: string[]) {
  return erp.list("Material Request", {
    fields: ["name", "`tabMaterial Request Item`.item_code as item_code", "`tabMaterial Request Item`.warehouse as warehouse"],
    filters: [["Material Request", "docstatus", "<", 2], ["Material Request", "material_request_type", "=", "Purchase"], ["Material Request", "status", "in", OPEN_MR], ["Material Request Item", "item_code", "in", codes]],
    orderBy: "`tabMaterial Request`.modified desc",
    start: 0,
    limit: 500,
  });
}

/** Whether a rule should be looked at in this cron tick. */
export function isDue(r: Pick<RuleState, "rule" | "last_evaluated_at">, now: Date) {
  if (!isRuleId(r.rule)) return false;
  const last = r.last_evaluated_at ? new Date(r.last_evaluated_at) : null;
  if (RULES[r.rule].cadence === "hourly") return !last || now.getTime() - last.getTime() >= HOURLY_MS;
  const hour = new Date(now.getTime() + 8 * 3_600_000).getUTCHours();
  return hour >= DAILY_FROM_HOUR && (!last || taiwanDate(last) !== taiwanDate(now));
}

export type AutomationJob = { kind: "automation"; site: string; run_id: number; rule: RuleId; hit: Hit; company?: string };

type CronDeps = { store: Store; automations: AutomationStore; fetcher: Fetch; queue: { send(job: AutomationJob): Promise<unknown> } };

/** Cron: every due rule of every company; each new hit is recorded, then queued. */
export async function runAutomations(deps: CronDeps, now = new Date()) {
  const today = taiwanDate(now);
  const at = now.toISOString();
  const bySite = new Map<string, RuleState[]>();
  for (const r of await deps.automations.listEnabled()) if (isDue(r, now)) bySite.set(r.site, [...(bySite.get(r.site) ?? []), r]);
  let queued = 0;
  let failed = 0;
  for (const [site, rules] of bySite) {
    const [tenant, account] = await Promise.all([deps.store.getTenant(site), deps.store.getAccount(site)]);
    for (const r of rules) {
      const rule = r.rule as RuleId;
      if (!tenant) {
        await deps.automations.markEvaluated(site, rule, at, "找不到這家公司的 ERPNext 設定");
        continue;
      }
      if (account && !lifecycle(account, now).writable) {
        await deps.automations.markEvaluated(site, rule, at, "合約目前是唯讀，自動化先暫停");
        continue;
      }
      const checked = validateParams(rule, r.params, { enabling: true });
      if ("error" in checked) {
        await deps.automations.markEvaluated(site, rule, at, checked.error);
        continue;
      }
      try {
        const facts = await readFacts(new ERPNext(tenant, deps.fetcher), rule, checked.params, today);
        for (const hit of evaluate(rule, checked.params, facts, today, account?.company)) {
          const run = await deps.automations.insertRun({ site, rule, target: hit.target, day: hit.day, title: hit.title, detail: hit.detail, created_at: at });
          if (!run) continue;
          try {
            await deps.queue.send({ kind: "automation", site, run_id: run.id, rule, hit, company: account?.company });
            queued++;
          } catch (e) {
            await deps.automations.deleteRun(run.id);
            throw e;
          }
        }
        await deps.automations.markEvaluated(site, rule, at, null);
      } catch (e) {
        failed++;
        log("warn", "automation.evaluate_failed", { site, rule, error: errorText(e) });
        await deps.automations.markEvaluated(site, rule, at, readable(e));
      }
    }
  }
  return { queued, failed };
}

function readable(e: unknown) {
  if (e instanceof UpstreamError) {
    if (e.status === 0) return "連不到 ERPNext";
    if (e.status === 403) return "ERPNext 不讓整合帳號讀這些單據";
    if (e.status === 404 || e.status === 417) return "這家 ERPNext 沒有這個模組或欄位";
    return `ERPNext 回應 ${e.status}`;
  }
  return errorText(e).slice(0, 200);
}

/**
 * Queue job: do what one hit asks. Assignments are idempotent in Frappe itself
 * (an open ToDo for the same user and document is not added twice); the email
 * and the material request are claimed first and released if they fail, so a
 * retry never sends or opens a second one.
 */
export async function performAutomation(job: AutomationJob, tenant: Tenant, erp: ERPNext, deps: Deps) {
  const auto = deps.automations;
  if (!auto) throw new Error("automation store not configured");
  const run = await auto.getRun(job.run_id);
  if (!run || run.site !== job.site) return { skipped: "run missing" };
  if (run.status !== "queued") return { skipped: run.status };
  const notes: string[] = [];
  for (const action of job.hit.actions) {
    const key = `auto:${job.site}:${run.id}:${action.type}`;
    if (action.type === "todo") {
      await erp.method("frappe.desk.form.assign_to.add", { args: { assign_to: [action.user], doctype: action.doctype, name: action.name, description: `[自動化] ${action.note}`, date: action.date, priority: "Medium" } });
      notes.push(`給 ${action.user} 一個待辦`);
    } else if (action.type === "email") {
      if (!deps.email || !tenant.mail_from) {
        notes.push("沒有設定寄件信箱，沒寄信");
        continue;
      }
      if (!(await deps.store.claim(key))) {
        notes.push("信先前已寄出");
        continue;
      }
      try {
        await deps.email.send({ from: tenant.mail_from, to: action.to, subject: action.subject, text: action.text, html: `<p>${escapeHtml(action.text).replace(/\n/g, "<br>")}</p>` });
      } catch (e) {
        await deps.store.release(key);
        throw e;
      }
      notes.push(`寄提醒給 ${action.to}`);
    } else {
      const existing = await openRequests(erp, [action.item_code]);
      const same = existing.find((r) => s(r.warehouse) === action.warehouse);
      if (same) {
        notes.push(`已經有請購單 ${s(same.name)}，沒有再開`);
        continue;
      }
      if (!(await deps.store.claim(key))) {
        notes.push("請購單先前已開");
        continue;
      }
      try {
        const warehouse = await erp.get<{ company?: string }>("Warehouse", action.warehouse);
        const today = taiwanDate();
        const schedule = addDays(today, 7);
        const mr = await erp.insert<{ name: string }>("Material Request", {
          material_request_type: "Purchase",
          company: warehouse.company,
          transaction_date: today,
          schedule_date: schedule,
          set_warehouse: action.warehouse,
          items: [{ item_code: action.item_code, qty: action.qty, uom: action.uom, stock_uom: action.uom, conversion_factor: 1, warehouse: action.warehouse, schedule_date: schedule }],
        });
        notes.push(`開了請購單草稿 ${mr.name}`);
      } catch (e) {
        await deps.store.release(key);
        throw e;
      }
    }
  }
  const result = notes.join("；") || "沒有可以做的動作（沒有負責人）";
  await auto.finishRun(run.id, "done", result, null, new Date().toISOString());
  const event: ErpEvent = {
    name: `auto_${job.site}_${run.id}`,
    event_type: "automation_fired",
    idempotency_key: `automation:${job.site}:${run.rule}:${run.target}:${run.day}`,
    party_type: job.hit.party_type ?? null,
    party: job.hit.party ?? null,
    reference_doctype: job.hit.doctype,
    reference_name: job.hit.name,
    payload: { rule: run.rule, title: run.title },
  };
  await fanOut(job.site, event, deps).catch((e) => log("warn", "automation.webhook_failed", { site: job.site, error: errorText(e) }));
  return { done: result };
}

export async function giveUpAutomation(job: AutomationJob, error: string, automations?: AutomationStore) {
  await automations?.finishRun(job.run_id, "failed", null, error, new Date().toISOString());
}

export type RuleView = { rule: RuleId; label: string; enabled: boolean; params: Record<string, unknown>; updated_by: string | null; updated_at: string | null; last_evaluated_at: string | null; last_error: string | null };

export function ruleViews(stored: RuleState[]): RuleView[] {
  return RULE_IDS.map((rule) => {
    const r = stored.find((x) => x.rule === rule);
    const params = { ...defaultParams(rule), ...(r?.params ?? {}) };
    return { rule, label: RULES[rule].label, enabled: Boolean(r?.enabled), params, updated_by: r?.updated_by ?? null, updated_at: r?.updated_at ?? null, last_evaluated_at: r?.last_evaluated_at ?? null, last_error: r?.last_error ?? null };
  });
}

export const automationStoreFor = (env: { DB?: D1Database }, app: { automations?: (env: never) => AutomationStore }): AutomationStore | undefined =>
  app.automations ? app.automations(env as never) : env.DB ? new D1AutomationStore(env.DB) : undefined;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ error: message }, status);

/** `/admin/tenants/:site/automations…`, for ADMIN_TOKEN or the shell acting for that one company. */
export async function manageAutomations(req: Request, parts: string[], ctx: { site: string; actor: string; automations: AutomationStore; store: Store; fetcher: Fetch; mail: boolean; now?: Date }) {
  const { site, automations } = ctx;
  const rule = parts[4];
  if (!rule && req.method === "GET") {
    const runs = await automations.listRuns(site);
    return json({ rules: ruleViews(await automations.listRules(site)), runs, mail: ctx.mail });
  }
  if (!isRuleId(rule)) return fail("沒有這條規則", 404);
  const body = (await req.json().catch(() => null)) as { enabled?: unknown; params?: unknown } | null;
  if (!body || typeof body !== "object") return fail("設定格式不對");
  const current = (await automations.listRules(site)).find((r) => r.rule === rule);

  if (parts[5] === "dry-run" && req.method === "POST") {
    const checked = validateParams(rule, body.params ?? current?.params);
    if ("error" in checked) return fail(checked.error);
    const tenant = await ctx.store.getTenant(site);
    if (!tenant) return fail("找不到這家公司", 404);
    const now = ctx.now ?? new Date();
    const today = taiwanDate(now);
    let hits: Hit[];
    try {
      hits = evaluate(rule, checked.params, await readFacts(new ERPNext(tenant, ctx.fetcher), rule, checked.params, today), today, (await ctx.store.getAccount(site))?.company);
    } catch (e) {
      return fail(readable(e), 502);
    }
    const out = [];
    for (const h of hits) out.push({ ...h, done_before: await automations.hasRun(site, rule, h.target, h.day) });
    return json({ today, hits: out });
  }

  if (!parts[5] && req.method === "PUT") {
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return fail("enabled 只能是 true 或 false");
    const enabled = body.enabled ?? current?.enabled ?? false;
    const checked = validateParams(rule, body.params ?? current?.params, { enabling: enabled });
    if ("error" in checked) return fail(checked.error);
    const next: RuleState = {
      site,
      rule,
      enabled,
      params: checked.params,
      updated_by: ctx.actor,
      updated_at: new Date().toISOString(),
      last_evaluated_at: current?.last_evaluated_at ?? null,
      last_error: current?.last_error ?? null,
    };
    await automations.putRule(next);
    const action = current?.enabled === enabled ? "調整自動化" : enabled ? "開啟自動化" : "關閉自動化";
    await ctx.store.addAccountEvent(site, ctx.actor, action, `${RULES[rule].label}：${JSON.stringify(checked.params)}`);
    return json({ ok: true, rule: ruleViews([next])[RULE_IDS.indexOf(rule)] });
  }
  return fail("not found", 404);
}

export type { Run };
