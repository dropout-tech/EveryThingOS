import "server-only";
import { formatTwd, nextLabel, type Books, type SalesStep } from "../erp";
import type { IndustryPack } from "../types";
import { liveConfig } from "./config";
import { deskUrl, erpMethod } from "./erpnext";
import type { AuditRow, Catalog, DeadLetter, HrToday, HygieneRow, LetterOverview, Me, MeetingSummary, Person, SetupStatus, Team, UpcomingMeeting, WebsiteOverview } from "./types";

type RawBooks = {
  month_sales: number;
  month_cost: number;
  ar: number;
  ap: number;
  cash: number;
  inventory_value: number;
  overdue_ar: number;
  vat_payable: number;
  sales: { no: string; party: string; qty: number; amount: number; tax: number; step: SalesStep; overdue_days?: number | null; invoice_no?: string | null; href: string; doctype: string }[];
  purchases: { no: string; vendor: string; item: string; amount: number; status: string; next: string; href: string; doctype: string }[];
  stock: { sku: string; name: string; warehouse: string; on_hand: number; safety: number; href: string }[];
  ar_aging: { party: string; current: number; d30: number; d60: number; d90: number; href: string }[];
  journals: { no: string; date: string; memo: string; debit: string; credit: string; amount: number; href: string }[];
  pnl: { label: string; amount: number }[];
  einvoices: { no: string; status: string; amount: number; related: string; error?: string; href: string }[];
  denied: string[];
};

export async function liveBooks(pack: IndustryPack, setup?: SetupStatus | null, deadLetters?: DeadLetter[] | null): Promise<Books & { denied: string[] }> {
  const config = await liveConfig();
  const raw = await erpMethod<RawBooks>("dropout_core.shell.books", {}, config);
  const link = (path: string) => deskUrl(path, config);
  const stock = raw.stock.map((r) => ({ sku: r.sku, name: r.name, warehouse: r.warehouse, onHand: r.on_hand, safety: r.safety, href: link(r.href) }));
  const books: Books = {
    monthSales: raw.month_sales,
    monthCost: raw.month_cost,
    ar: raw.ar,
    ap: raw.ap,
    cash: raw.cash,
    inventoryValue: raw.inventory_value,
    overdueAr: raw.overdue_ar,
    vatPayable: raw.vat_payable,
    today: [],
    sales: raw.sales.map((d) => ({
      no: d.no,
      party: d.party,
      item: pack.itemType,
      qty: d.qty,
      amount: d.amount,
      tax: d.tax,
      step: d.step,
      next: nextLabel(d.step, pack),
      overdueDays: d.overdue_days ?? undefined,
      invoiceNo: d.invoice_no ?? undefined,
      href: link(d.href),
      doctype: d.doctype,
    })),
    purchases: raw.purchases.map((p) => ({ ...p, item: p.item || pack.itemType, href: link(p.href) })),
    stock,
    arAging: raw.ar_aging.map((r) => ({ ...r, href: link(r.href) })),
    journals: raw.journals.map((j) => ({ ...j, href: link(j.href) })),
    pnl: raw.pnl,
    einvoices: raw.einvoices.map((e) => ({ ...e, href: link(e.href) })),
  };
  books.today = todayFromLive(books, setup, deadLetters);
  return { ...books, denied: raw.denied };
}

export function todayFromLive(books: Books, setup?: SetupStatus | null, deadLetters?: DeadLetter[] | null): Books["today"] {
  const jobs: Books["today"] = [];
  if (deadLetters?.length) {
    jobs.push({ title: `${deadLetters.length} 件同步沒送到`, detail: "系統之間有資料卡住了，看原因後重送。", href: "/workspace/settings#sync", tone: "urgent" });
  }
  const failed = books.einvoices.filter((e) => e.status === "失敗");
  if (failed.length) {
    jobs.push({ title: `${failed.length} 張電子發票沒開成`, detail: failed[0].error || "打開發票看原因。", href: "/workspace/erp/finance", tone: "urgent" });
  }
  const worst = [...books.arAging].sort((a, b) => b.d90 + b.d60 + b.d30 - (a.d90 + a.d60 + a.d30))[0];
  if (books.overdueAr > 0 && worst) {
    jobs.push({ title: `跟 ${worst.party} 收款`, detail: `逾期合計 ${formatTwd(books.overdueAr)}`, href: "/workspace/erp/finance", tone: "warn" });
  }
  const low = books.stock.filter((r) => r.safety > 0 && r.onHand < r.safety);
  if (low.length) {
    jobs.push({ title: `${low[0].name} 快不夠了`, detail: `剩 ${low[0].onHand}，安全量 ${low[0].safety}${low.length > 1 ? `；還有 ${low.length - 1} 項` : ""}`, href: "/workspace/erp/stock", tone: "warn" });
  }
  const quotes = books.sales.filter((d) => d.step === "quote");
  if (quotes.length) {
    jobs.push({ title: `${quotes.length} 張報價等回覆`, detail: `最近一張：${quotes[0].party}`, href: "/workspace/erp/sales", tone: "ok" });
  }
  const nextStep = setup?.steps.find((s) => !s.done);
  if (nextStep) {
    jobs.push({ title: `導入：${nextStep.label}`, detail: `導入進度 ${setup!.done}／${setup!.total}`, href: "/workspace/settings#setup", tone: jobs.length ? "ok" : "warn" });
  }
  if (!jobs.length) jobs.push({ title: "今天沒有卡住的事", detail: "收款、庫存、發票、同步都正常。", href: "/workspace/erp/sales", tone: "ok" });
  return jobs;
}

export async function livePeople(): Promise<Person[]> {
  const config = await liveConfig();
  const rows = await erpMethod<{ name: string; stage: string; channel: string; href: string }[]>("dropout_core.shell.people", {}, config);
  const channelLabel: Record<string, string> = { line: "LINE", ig: "IG", fb: "FB", web_chat: "官網對話", email: "Email", phone: "電話" };
  return rows.map((r) => ({ name: r.name, stage: r.stage, score: 0, channel: channelLabel[r.channel] ?? r.channel, href: deskUrl(r.href, config) }));
}

export async function liveLetter(): Promise<LetterOverview> {
  const config = await liveConfig();
  const raw = await erpMethod<Omit<LetterOverview, "last30Days"> & { last_30_days: LetterOverview["last30Days"] }>("dropout_core.shell.letter", {}, config);
  return {
    groups: raw.groups.map((g) => ({ ...g, href: deskUrl(g.href, config) })),
    consent: raw.consent,
    newsletters: raw.newsletters.map((n) => ({ ...n, href: deskUrl(n.href, config) })),
    last30Days: raw.last_30_days,
    denied: raw.denied,
  };
}

export function liveSetup() {
  return erpMethod<SetupStatus>("dropout_core.api.setup_status");
}

export async function liveMe(): Promise<Me> {
  const raw = await erpMethod<{ user: string; full_name: string; company: string; roles: string[]; profile?: string | null; chatwoot_user_id?: string }>("dropout_core.shell.whoami");
  return { user: raw.user, fullName: raw.full_name, company: raw.company, roles: raw.roles, profile: raw.profile ?? undefined, chatwootUserId: raw.chatwoot_user_id || undefined };
}

export async function liveDeadLetters(): Promise<DeadLetter[]> {
  const glue = (await liveConfig()).glue;
  if (!glue) return [];
  const res = await fetch(`${glue.url}/admin/tenants/${encodeURIComponent(glue.site)}/dead-letters`, {
    headers: { authorization: `Bearer ${glue.adminToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`膠水回應 ${res.status}`);
  const body = (await res.json()) as { dead_letters: DeadLetter[] };
  return body.dead_letters;
}

export function liveCatalog() {
  return erpMethod<Catalog>("dropout_core.shell.catalog");
}

export async function liveWebsite(): Promise<WebsiteOverview> {
  const config = await liveConfig();
  const raw = await erpMethod<Omit<WebsiteOverview, "formLeads" | "shopUrl"> & { form_leads: number; shop_path: string }>("dropout_core.shell.website", {}, config);
  const site = config.erpnext!.url;
  return {
    items: raw.items.map((i) => ({ ...i, route: i.route ? `${site}${i.route}` : null, href: deskUrl(i.href, config) })),
    published: raw.published,
    orders: raw.orders.map((o) => ({ ...o, href: deskUrl(o.href, config) })),
    formLeads: raw.form_leads,
    shopUrl: `${site}${raw.shop_path}`,
    denied: raw.denied,
  };
}

export async function liveMeetingSummaries(): Promise<MeetingSummary[]> {
  const config = await liveConfig();
  const rows = await erpMethod<MeetingSummary[]>("dropout_core.shell.meetings", {}, config);
  return rows.map((r) => ({ ...r, href: deskUrl(r.href, config) }));
}

export async function liveUpcomingMeetings(hours = 72): Promise<{ bot: boolean; failed: number; meetings: UpcomingMeeting[] }> {
  const glue = (await liveConfig()).glue;
  if (!glue) return { bot: false, failed: 0, meetings: [] };
  const res = await fetch(`${glue.url}/admin/tenants/${encodeURIComponent(glue.site)}/meetings?hours=${hours}`, {
    headers: { authorization: `Bearer ${glue.adminToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`會議紀錄系統回應 ${res.status}`);
  const body = (await res.json()) as { bot: boolean; failed_calendars: number; meetings: UpcomingMeeting[] };
  return { bot: body.bot, failed: body.failed_calendars, meetings: body.meetings };
}

export async function liveHygiene(): Promise<{ rows: HygieneRow[]; denied: string[] }> {
  const config = await liveConfig();
  const raw = await erpMethod<{ rows: (HygieneRow & { href?: string | null })[]; denied: string[] }>("dropout_core.shell.hygiene", {}, config);
  return { rows: raw.rows.map((r) => ({ ...r, href: deskUrl(r.href ?? undefined, config) })), denied: raw.denied };
}

export async function liveTeam(): Promise<Team> {
  const config = await liveConfig();
  const raw = await erpMethod<Team>("dropout_core.team.team", {}, config);
  return { ...raw, users: raw.users.map((u) => ({ ...u, href: deskUrl(u.href, config) })) };
}

export async function liveAudit(): Promise<AuditRow[]> {
  const config = await liveConfig();
  const raw = await erpMethod<{ rows: AuditRow[] }>("dropout_core.team.audit", { limit: 40 }, config);
  return raw.rows.map((r) => ({ ...r, href: r.href ? deskUrl(r.href, config) : null }));
}

type RawHr = {
  date: string;
  me: HrToday["me"];
  on_leave: { name: string; leave_type: string; from_date: string; to_date: string; half_day: boolean; href: string }[];
  approvals: { name: string; employee: string; leave_type: string; from_date: string; to_date: string; days: number; reason: string; href: string }[];
  payroll: (Omit<NonNullable<HrToday["payroll"]>, "netPay"> & { net_pay: number }) | null;
  rates: HrToday["rates"];
  can: HrToday["can"];
  denied: string[];
};

export async function liveHr(): Promise<HrToday> {
  const config = await liveConfig();
  const raw = await erpMethod<RawHr>("dropout_hr_tw.shell.today", {}, config);
  const link = (path?: string) => deskUrl(path, config);
  return {
    date: raw.date,
    me: raw.me,
    onLeave: raw.on_leave.map((r) => ({ name: r.name, leaveType: r.leave_type, fromDate: r.from_date, toDate: r.to_date, halfDay: r.half_day, href: link(r.href) })),
    approvals: raw.approvals.map((r) => ({ name: r.name, employee: r.employee, leaveType: r.leave_type, fromDate: r.from_date, toDate: r.to_date, days: r.days, reason: r.reason, href: link(r.href) })),
    payroll: raw.payroll
      ? { month: raw.payroll.month, state: raw.payroll.state, employees: raw.payroll.employees, draft: raw.payroll.draft, submitted: raw.payroll.submitted, netPay: raw.payroll.net_pay, entries: raw.payroll.entries.map((e) => ({ ...e, href: link(e.href) })) }
      : null,
    rates: raw.rates ? { ...raw.rates, href: link(raw.rates.href) } : null,
    can: raw.can,
    denied: raw.denied,
  };
}

export type BackupStatus = {
  checked_at: string;
  local: { taken_at: string; bytes: number; files: number; encrypted: boolean } | null;
  offsite: { enabled: boolean; taken_at?: string | null; bytes?: number; sets?: number; error?: string };
  encrypted: boolean;
};

/** System Manager only (`dropout_core.backups.status`). */
export function liveBackup() {
  return erpMethod<BackupStatus>("dropout_core.backups.status");
}
