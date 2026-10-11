import type { SalesDoc } from "./erp";
import { practiceCast } from "./practice";

/**
 * 專案與工時. Shared by the page, the demo state and the API routes: demo data,
 * the margin and health math, time-entry rules and invoice lines. No I/O here.
 */

export type TaskStatus = "todo" | "doing" | "done";
export type ProjectStatus = "active" | "hold" | "done";
export type Health = "ok" | "watch" | "over";

export type ProjectTask = { id: string; project: string; subject: string; status: TaskStatus; due?: string | null; href?: string };

export type TimeLog = {
  /** Timesheet Detail name in ERPNext. */
  id: string;
  /** Timesheet name. */
  sheet: string;
  project: string;
  task?: string | null;
  person: string;
  date: string;
  hours: number;
  activity: string;
  note?: string;
  billable: boolean;
  billAmount: number;
  costAmount: number;
  invoice?: string | null;
  /** Only submitted timesheets can go on an invoice. */
  submitted: boolean;
  href?: string;
};

export type Project = {
  id: string;
  name: string;
  customer: string | null;
  status: ProjectStatus;
  /** 合約金額; 0 when nobody filled it in. */
  contract: number;
  /** 預估成本; 0 when nobody filled it in. */
  costBudget: number;
  /** Purchases, materials and other costs that are not hours. */
  otherCost: number;
  billed: number;
  start?: string | null;
  due: string | null;
  /** ERPNext's own percent complete, used when a project has no tasks. */
  percent?: number;
  href?: string;
};

export type Activity = { name: string; billRate: number; costRate: number };

export type ProjectsData = {
  today: string;
  projects: Project[];
  tasks: ProjectTask[];
  logs: TimeLog[];
  activities: Activity[];
  /** Non-stock sales items an invoice can be written on (live only). */
  services: { code: string; name: string }[];
  me: string;
  can: { log: boolean; invoice: boolean; tasks: boolean };
  denied?: string[];
  /** More time logs exist than were read; totals may be low. */
  truncated?: boolean;
  /** Link to create a project in ERPNext (live only). */
  newProjectHref?: string;
};

export const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "待辦" },
  { id: "doing", label: "進行中" },
  { id: "done", label: "完成" },
];

export const HEALTH_LABEL: Record<Health, string> = { ok: "順", watch: "要注意", over: "超支" };
export const STATUS_LABEL: Record<ProjectStatus, string> = { active: "進行中", hold: "暫停", done: "結案" };

export const HOURS_STEP = 0.25;
export const MAX_ENTRY_HOURS = 12;
export const MAX_DAY_HOURS = 16;
export const BACKDATE_DAYS = 60;
export const TAX_RATE = 0.05;

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(now);
}

const round = (n: number) => Math.round(n);

// ---------- Metrics ----------

export type ProjectMetrics = {
  hours: number;
  monthHours: number;
  labor: number;
  cost: number;
  billed: number;
  unbilledHours: number;
  unbilledAmount: number;
  /** Logged but still in a draft timesheet, so not invoiceable yet. */
  draftHours: number;
  revenue: number;
  margin: number;
  marginPct: number | null;
  progress: { done: number; total: number; pct: number };
  burnPct: number | null;
  overdueDays: number;
  health: Health;
  reasons: string[];
};

export function isInvoiceable(log: TimeLog) {
  return log.billable && log.submitted && !log.invoice && log.hours > 0;
}

export function projectMetrics(project: Project, tasks: ProjectTask[], logs: TimeLog[], today: string): ProjectMetrics {
  const mine = logs.filter((l) => l.project === project.id);
  const month = today.slice(0, 7);
  const hours = sum(mine.map((l) => l.hours));
  const monthHours = sum(mine.filter((l) => l.date.startsWith(month)).map((l) => l.hours));
  const labor = sum(mine.map((l) => l.costAmount));
  const cost = labor + project.otherCost;
  const open = mine.filter(isInvoiceable);
  const unbilledHours = sum(open.map((l) => l.hours));
  const unbilledAmount = sum(open.map((l) => l.billAmount));
  const draftHours = sum(mine.filter((l) => l.billable && !l.submitted && !l.invoice).map((l) => l.hours));
  const revenue = project.contract > 0 ? project.contract : project.billed + unbilledAmount;
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : null;

  const own = tasks.filter((t) => t.project === project.id);
  const done = own.filter((t) => t.status === "done").length;
  const pct = own.length ? Math.round((done / own.length) * 100) : project.status === "done" ? 100 : Math.round(project.percent ?? 0);
  const budget = project.costBudget > 0 ? project.costBudget : project.contract;
  const burnPct = budget > 0 ? Math.round((cost / budget) * 100) : null;
  const overdueDays = project.due && project.status !== "done" && pct < 100 ? Math.max(0, daysBetween(project.due, today)) : 0;

  const reasons: string[] = [];
  let health: Health = "ok";
  if (burnPct !== null && burnPct > 100) {
    health = "over";
    reasons.push(project.costBudget > 0 ? `成本已經超過預算 ${burnPct - 100}%` : "成本已經超過合約金額");
  }
  if (revenue > 0 && margin < 0) {
    health = "over";
    reasons.push("照現在的成本，這案在賠錢");
  }
  if (health !== "over") {
    if (overdueDays > 0) reasons.push(`已經過了截止日 ${overdueDays} 天`);
    if (burnPct !== null && project.status !== "done" && burnPct - pct > 15) reasons.push(`預算花了 ${burnPct}%，進度才 ${pct}%`);
    if (marginPct !== null && marginPct < 15) reasons.push(`毛利只剩 ${marginPct}%`);
    if (reasons.length) health = "watch";
  }
  return { hours, monthHours, labor, cost, billed: project.billed, unbilledHours, unbilledAmount, draftHours, revenue, margin, marginPct, progress: { done, total: own.length, pct }, burnPct, overdueDays, health, reasons };
}

export function sum(values: number[]) {
  return values.reduce((total, v) => total + (Number.isFinite(v) ? v : 0), 0);
}

export type ProjectsSummary = { active: number; monthHours: number; unbilled: number; avgMargin: number | null; watch: number; over: number };

export function summarize(data: Pick<ProjectsData, "projects" | "tasks" | "logs" | "today">): ProjectsSummary {
  const month = data.today.slice(0, 7);
  const active = data.projects.filter((p) => p.status === "active");
  const metrics = active.map((p) => projectMetrics(p, data.tasks, data.logs, data.today));
  const margins = metrics.map((m) => m.marginPct).filter((m): m is number => m !== null);
  return {
    active: active.length,
    monthHours: sum(data.logs.filter((l) => l.date.startsWith(month)).map((l) => l.hours)),
    unbilled: sum(data.projects.map((p) => projectMetrics(p, data.tasks, data.logs, data.today).unbilledAmount)),
    avgMargin: margins.length ? Math.round(sum(margins) / margins.length) : null,
    watch: metrics.filter((m) => m.health === "watch").length,
    over: metrics.filter((m) => m.health === "over").length,
  };
}

export function teamHours(logs: TimeLog[]) {
  const by = new Map<string, { person: string; hours: number; billable: number; cost: number }>();
  for (const l of logs) {
    const row = by.get(l.person) ?? { person: l.person, hours: 0, billable: 0, cost: 0 };
    row.hours += l.hours;
    if (l.billable) row.billable += l.hours;
    row.cost += l.costAmount;
    by.set(l.person, row);
  }
  return [...by.values()].sort((a, b) => b.hours - a.hours);
}

/** 10/08 this year, 2027/08/08 otherwise. */
export function shortDate(day: string, today: string) {
  return day.slice(0, 4) === today.slice(0, 4) ? day.slice(5).replace("-", "/") : day.replace(/-/g, "/");
}

export function formatHours(hours: number) {
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, "")} 小時`;
}

// ---------- Invoice ----------

export type InvoiceLine = { activity: string; hours: number; rate: number; amount: number };

/** One line per kind of work, the way ERPNext's timesheet invoice adds them up. Tax is the Taiwan 5% on top. */
export function invoiceLines(logs: TimeLog[]) {
  const by = new Map<string, InvoiceLine>();
  for (const l of logs) {
    const key = l.activity || "工時";
    const row = by.get(key) ?? { activity: key, hours: 0, rate: 0, amount: 0 };
    row.hours += l.hours;
    row.amount += l.billAmount;
    by.set(key, row);
  }
  const lines = [...by.values()].map((row) => ({ ...row, amount: round(row.amount), rate: row.hours > 0 ? round(row.amount / row.hours) : 0 }));
  const net = sum(lines.map((l) => l.amount));
  const tax = round(net * TAX_RATE);
  return { lines, hours: sum(lines.map((l) => l.hours)), net, tax, total: net + tax };
}

// ---------- Time entry ----------

export type TimeEntry = { project: string; task: string | null; hours: number; date: string; note: string; activity: string | null; billable: boolean };
export type TimeEntryErrors = Partial<Record<"project" | "task" | "hours" | "date" | "note" | "activity", string>>;

const ID = /^[^\u0000-\u001f<>]{1,140}$/;

/** The same rules run in the form and again in the API route. `dayHours` is what this person already logged that day. */
export function checkTimeEntry(input: Record<string, unknown> | null | undefined, today: string, dayHours = 0): { ok: true; value: TimeEntry } | { ok: false; errors: TimeEntryErrors } {
  const errors: TimeEntryErrors = {};
  const raw = input ?? {};
  const project = typeof raw.project === "string" ? raw.project.trim() : "";
  if (!project || !ID.test(project)) errors.project = "請選專案。";
  const task = typeof raw.task === "string" && raw.task.trim() ? raw.task.trim() : null;
  if (task && !ID.test(task)) errors.task = "工作項目不對，請重新選。";
  const activity = typeof raw.activity === "string" && raw.activity.trim() ? raw.activity.trim() : null;
  if (activity && !ID.test(activity)) errors.activity = "工作類型不對，請重新選。";
  const hours = typeof raw.hours === "number" ? raw.hours : typeof raw.hours === "string" && raw.hours.trim() ? Number(raw.hours) : NaN;
  if (!Number.isFinite(hours) || hours <= 0) errors.hours = "請填時數，例如 1.5。";
  else if (hours > MAX_ENTRY_HOURS) errors.hours = `一筆最多 ${MAX_ENTRY_HOURS} 小時；做更久請分兩筆記。`;
  else if (Math.abs(hours / HOURS_STEP - Math.round(hours / HOURS_STEP)) > 1e-9) errors.hours = "以 15 分鐘為單位：0.25、0.5、0.75⋯";
  else if (dayHours + hours > MAX_DAY_HOURS) errors.hours = `這天已經記了 ${formatHours(dayHours)}，一天最多 ${MAX_DAY_HOURS} 小時。`;
  const date = typeof raw.date === "string" ? raw.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) errors.date = "請選日期。";
  else if (date > today) errors.date = "不能記明天以後的工時。";
  else if (daysBetween(date, today) > BACKDATE_DAYS) errors.date = `超過 ${BACKDATE_DAYS} 天前的工時，請到 ERPNext 補登。`;
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > 280) errors.note = "備註最多 280 個字。";
  const billable = raw.billable === undefined ? true : raw.billable === true;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { project, task, hours, date, note, activity, billable } };
}

export function dayHoursFor(logs: TimeLog[], person: string, date: string) {
  return sum(logs.filter((l) => l.person === person && l.date === date).map((l) => l.hours));
}

// ---------- Demo edits (kept in the browser) ----------

export type DemoInvoice = { no: string; project: string; customer: string; hours: number; net: number; tax: number; date: string };
export type ProjectsDemoState = { projects: Project[]; tasks: ProjectTask[]; logs: TimeLog[]; invoices: DemoInvoice[] };

export function addDemoLog(state: ProjectsDemoState, entry: TimeEntry, person: string, activities: Activity[]): ProjectsDemoState {
  const activity = activities.find((a) => a.name === entry.activity) ?? activities[0] ?? { name: "工時", billRate: 0, costRate: 0 };
  const serial = Date.now().toString(36);
  const log: TimeLog = {
    id: `demo-${serial}`,
    sheet: `TS-DEMO-${serial.slice(-5).toUpperCase()}`,
    project: entry.project,
    task: entry.task,
    person,
    date: entry.date,
    hours: entry.hours,
    activity: activity.name,
    note: entry.note || undefined,
    billable: entry.billable,
    billAmount: entry.billable ? round(entry.hours * activity.billRate) : 0,
    costAmount: round(entry.hours * activity.costRate),
    submitted: true,
  };
  return { ...state, logs: [log, ...state.logs] };
}

export function moveDemoTask(state: ProjectsDemoState, id: string, status: TaskStatus): ProjectsDemoState {
  return { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)) };
}

export function addDemoTask(state: ProjectsDemoState, project: string, subject: string): ProjectsDemoState {
  const task: ProjectTask = { id: `TASK-DEMO-${Date.now().toString(36).toUpperCase()}`, project, subject: subject.trim().slice(0, 140), status: "todo" };
  return { ...state, tasks: [...state.tasks, task] };
}

export function billDemoLogs(state: ProjectsDemoState, projectId: string, ids: string[], today: string): { state: ProjectsDemoState; invoice: DemoInvoice } | null {
  const project = state.projects.find((p) => p.id === projectId);
  const chosen = new Set(ids);
  const logs = state.logs.filter((l) => chosen.has(l.id) && l.project === projectId && isInvoiceable(l));
  if (!project || !logs.length) return null;
  const { hours, net, tax } = invoiceLines(logs);
  const no = `SINV-${today.slice(2, 4)}${String(state.invoices.length + 1 + (hash(projectId) % 80)).padStart(3, "0")}`;
  const invoice: DemoInvoice = { no, project: projectId, customer: project.customer ?? project.name, hours, net, tax, date: today };
  return {
    invoice,
    state: {
      ...state,
      logs: state.logs.map((l) => (logs.includes(l) ? { ...l, invoice: no } : l)),
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, billed: p.billed + net } : p)),
      invoices: [invoice, ...state.invoices],
    },
  };
}

/** The demo invoice as a card in 銷售's 「請他付錢」 column (picked up from the demo sales inbox). */
export function demoSalesDoc(invoice: DemoInvoice, projectName: string): SalesDoc {
  return {
    no: invoice.no,
    party: invoice.customer,
    item: `${projectName} 工時`,
    qty: invoice.hours,
    amount: invoice.net,
    tax: invoice.tax,
    step: "invoice",
    next: "記入已收",
    overdueDays: 0,
    invoiceNo: `AB-${11200000 + (hash(invoice.no + invoice.project) % 8000)}`,
  };
}

// ---------- Demo data ----------

type Plan = {
  name: string;
  customer: string;
  status?: ProjectStatus;
  /** Days from today; negative is in the past. */
  start: number;
  due: number;
  tasks: [string, TaskStatus][];
  logs: number;
  contract: number;
  /** 預估成本 as a share of the contract. */
  budget: number;
  /** Purchases and materials so far. */
  other: number;
  /** Already invoiced up front (訂金), as a share of the contract. */
  deposit: number;
  /** Logs older than this many days were already invoiced. */
  billedBefore: number;
};

type Scene = { team: string[]; activities: Activity[]; plans: Plan[] };

const SERVICE: Scene = {
  team: ["王美玲", "陳冠宇", "林安安", "黃志明"],
  activities: [
    { name: "顧問", billRate: 2400, costRate: 1000 },
    { name: "設計", billRate: 1800, costRate: 750 },
    { name: "開發", billRate: 2000, costRate: 850 },
    { name: "專案管理", billRate: 1500, costRate: 650 },
  ],
  plans: [
    {
      name: "品牌顧問案",
      customer: "山嵐咖啡",
      start: -40,
      due: 35,
      tasks: [["老闆與門市訪談", "done"], ["品牌定位提案", "done"], ["識別系統設計", "doing"], ["包裝與菜單延伸", "todo"], ["品牌規範手冊", "todo"]],
      logs: 16,
      contract: 360_000,
      budget: 0.55,
      other: 12_000,
      deposit: 0.3,
      billedBefore: 99,
    },
    {
      name: "官網改版",
      customer: "青田牙醫診所",
      start: -55,
      due: -4,
      tasks: [["需求訪談", "done"], ["線框稿", "done"], ["視覺設計", "done"], ["前端切版", "doing"], ["線上預約串接", "doing"], ["上線測試", "todo"]],
      logs: 30,
      contract: 180_000,
      budget: 0.55,
      other: 6_000,
      deposit: 0,
      billedBefore: 30,
    },
    {
      name: "年度維運",
      customer: "北辰物流",
      start: -58,
      due: 300,
      tasks: [["主機每月更新", "doing"], ["備份還原演練", "done"], ["客服工單處理", "doing"], ["年度資安檢查", "todo"]],
      logs: 24,
      contract: 80_000,
      budget: 0.6,
      other: 8_000,
      deposit: 0.25,
      billedBefore: 99,
    },
    {
      name: "季度社群代操",
      customer: "暖暖親子餐廳",
      start: -20,
      due: 70,
      tasks: [["內容排程", "doing"], ["拍攝一日", "done"], ["月報", "todo"]],
      logs: 9,
      contract: 120_000,
      budget: 0.55,
      other: 8_000,
      deposit: 0,
      billedBefore: 99,
    },
  ],
};

const BUILD: Scene = {
  team: ["劉建宏", "張雅婷", "吳佳蓉", "蔡承恩"],
  activities: [
    { name: "監工", billRate: 1200, costRate: 600 },
    { name: "木作", billRate: 1000, costRate: 550 },
    { name: "水電", billRate: 1100, costRate: 600 },
    { name: "泥作", billRate: 950, costRate: 520 },
  ],
  plans: [
    {
      name: "大安林宅 全室裝修",
      customer: "林先生",
      start: -45,
      due: 40,
      tasks: [["拆除清運", "done"], ["水電配管", "done"], ["泥作防水", "doing"], ["木作天花板", "doing"], ["系統櫃安裝", "todo"], ["油漆", "todo"], ["清潔驗收", "todo"]],
      logs: 28,
      contract: 1_860_000,
      budget: 0.72,
      other: 760_000,
      deposit: 0.3,
      billedBefore: 99,
    },
    {
      name: "永和早餐店 店面翻修",
      customer: "晨光早餐",
      start: -30,
      due: 6,
      tasks: [["拆除", "done"], ["水電與排水", "done"], ["地坪", "done"], ["吧台木作", "doing"], ["招牌與燈具", "todo"]],
      logs: 20,
      contract: 480_000,
      budget: 0.7,
      other: 352_000,
      deposit: 0.5,
      billedBefore: 99,
    },
    {
      name: "中和陳宅 浴室防水",
      customer: "陳小姐",
      start: -12,
      due: 10,
      tasks: [["打除與試水", "done"], ["防水層", "done"], ["貼磚", "doing"], ["衛浴安裝", "todo"]],
      logs: 10,
      contract: 98_000,
      budget: 0.65,
      other: 21_000,
      deposit: 0.3,
      billedBefore: 99,
    },
  ],
};

function genericScene(packId: string): Scene {
  const cast = practiceCast(packId);
  const base = { deposit: 0, billedBefore: 99, budget: 0.6 };
  return {
    team: cast.slice(4, 7),
    activities: [
      { name: "服務", billRate: 1500, costRate: 600 },
      { name: "專案管理", billRate: 1200, costRate: 500 },
    ],
    plans: [
      { ...base, name: "年度合作案", customer: `${cast[0]}（公司）`, start: -50, due: 120, tasks: [["啟動會議", "done"], ["第一季交付", "done"], ["第二季交付", "doing"], ["年度檢討", "todo"]], logs: 14, contract: 240_000, other: 10_000, deposit: 0.25 },
      { ...base, name: "客製委託", customer: `${cast[1]}（公司）`, start: -35, due: -2, tasks: [["需求確認", "done"], ["製作", "doing"], ["交付與驗收", "todo"]], logs: 18, contract: 80_000, other: 6_000, billedBefore: 25 },
      { ...base, name: "小型急件", customer: `${cast[2]}（公司）`, start: -6, due: 8, tasks: [["接件確認", "done"], ["處理", "doing"], ["回報", "todo"]], logs: 4, contract: 45_000, other: 0 },
    ],
  };
}

const HOURS = [1, 1.5, 2, 2.5, 3, 4, 0.75, 6];

/** Demo projects for the scene: 接案／專業 and 工地／裝潢 get their own, everything else a generic set. Same input, same output. */
export function demoProjects(packId: string, scene: string, today: string): ProjectsData {
  const pack = scene === "service" ? SERVICE : scene === "build" ? BUILD : genericScene(packId);
  const seed = hash(scene === "service" || scene === "build" ? scene : packId);
  const projects: Project[] = [];
  const tasks: ProjectTask[] = [];
  const logs: TimeLog[] = [];
  const year = today.slice(0, 4);

  pack.plans.forEach((plan, p) => {
    const id = `PROJ-${String(p + 1).padStart(4, "0")}`;
    const planTasks = plan.tasks.map(([subject, status], t) => ({ id: `TASK-${year}-${String(p * 10 + t + 1).padStart(5, "0")}`, project: id, subject, status, due: addDays(today, plan.start + Math.round(((plan.due - plan.start) * (t + 1)) / plan.tasks.length)) }));
    tasks.push(...planTasks);
    const worked = planTasks.filter((t) => t.status !== "todo");
    const span = Math.max(1, Math.min(-plan.start, 58));
    const mine: TimeLog[] = [];
    for (let i = 0; i < plan.logs; i += 1) {
      const s = hash(`${seed}:${p}:${i}`);
      const ago = Math.round((i / plan.logs) * span) + (s % 2);
      const date = addDays(today, -Math.min(ago, span));
      const person = pack.team[(p + i + (s % 3)) % pack.team.length];
      const activity = pack.activities[(s >>> 3) % pack.activities.length];
      const hours = HOURS[(s >>> 5) % HOURS.length];
      const task = worked.length ? worked[(s >>> 7) % worked.length].id : null;
      const billable = (s >>> 9) % 7 !== 0;
      mine.push({
        id: `TSD-${id}-${i}`,
        sheet: `TS-${year}-${String(p * 100 + i + 1).padStart(5, "0")}`,
        project: id,
        task,
        person,
        date,
        hours,
        activity: activity.name,
        billable,
        billAmount: billable ? hours * activity.billRate : 0,
        costAmount: hours * activity.costRate,
        invoice: billable && daysBetween(date, today) > plan.billedBefore ? `SINV-${year.slice(2)}${String(p + 1).padStart(3, "0")}` : null,
        submitted: daysBetween(date, today) > 0 || i % 2 === 0,
        note: i === 0 ? "開工" : undefined,
      });
    }
    logs.push(...mine);

    const billedLogs = sum(mine.filter((l) => l.invoice).map((l) => l.billAmount));
    projects.push({
      id,
      name: plan.name,
      customer: plan.customer,
      status: plan.status ?? "active",
      contract: plan.contract,
      costBudget: Math.round((plan.contract * plan.budget) / 1000) * 1000,
      otherCost: plan.other,
      billed: Math.round((plan.contract * plan.deposit) / 1000) * 1000 + billedLogs,
      start: addDays(today, plan.start),
      due: addDays(today, plan.due),
    });
  });

  return {
    today,
    projects,
    tasks,
    logs: logs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    activities: pack.activities,
    services: [],
    me: pack.team[0],
    can: { log: true, invoice: true, tasks: true },
  };
}
