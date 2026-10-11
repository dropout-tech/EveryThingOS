import type { AgingRow, PurchaseDoc, SalesDoc, StockRow } from "./erp";
import { formatTwd } from "./format";
import type { OwnerReport } from "./reports";
import type { HrToday, Person } from "./sources/types";

/**
 * 問助理. A deterministic reader over the data the shell already loads for this
 * person: it picks a question type from the words, then answers only with
 * numbers that are in `AssistantFacts`. Nothing here guesses a figure; when the
 * data is missing the answer says so and links to where to fix it.
 */

export type Fix = { href: string; label: string };
export type Gap = { reason: "off" | "role" | "error" | "missing"; message: string; fix?: Fix };
export type Slot<T> = { ok: true; data: T } | ({ ok: false } & Gap);

export type TodayJob = { title: string; detail: string; href: string; tone: "urgent" | "warn" | "ok" };

export type MoneyFacts = {
  /** null: this person's ERPNext role cannot read that figure. */
  monthSales: number | null;
  monthCost: number | null;
  /** Only the practice books compute a real 毛利; live 毛利 comes from the report. */
  grossProfit: number | null;
  cash: number | null;
  ar: number | null;
  ap: number | null;
  vatPayable: number | null;
  einvoices: { no: string; status: string; amount: number; related: string; error?: string; href?: string }[] | null;
};

export type SalesFacts = { docs: SalesDoc[]; hidden: string[] };
export type PurchaseFacts = { docs: PurchaseDoc[]; hidden: string[] };

export type AssistantFacts = {
  mode: "demo" | "live";
  /** YYYY-MM-DD in Asia/Taipei. */
  today: string;
  company?: string;
  me?: string;
  /** Word for finishing an order in this trade, e.g. 出貨, 上課. */
  fulfillment: string;
  money: Slot<MoneyFacts>;
  aging: Slot<AgingRow[]>;
  sales: Slot<SalesFacts>;
  stock: Slot<StockRow[]>;
  purchases: Slot<PurchaseFacts>;
  people: Slot<Person[]>;
  hr: Slot<HrToday>;
  report: Slot<OwnerReport>;
  todo: Slot<TodayJob[]>;
  /** Where 「在對話打開」 goes; null when the 對話 module is off for this person. */
  chatHref: string | null;
};

/** Keep in step with `INTENTS` in glue/src/assist.ts; the glue only accepts these ids from the model. */
export const INTENTS = [
  "receivables",
  "overdue",
  "revenue",
  "revenue_compare",
  "margin",
  "low_stock",
  "quotes",
  "orders",
  "leave",
  "approvals",
  "payroll",
  "agenda",
  "customer",
  "top_customers",
  "payables",
  "cash",
  "purchases",
  "leads",
  "vat",
  "einvoice",
  "draft_reminder",
  "draft_quote",
  "draft_reply",
  "capabilities",
] as const;
export type IntentId = (typeof INTENTS)[number];

export const PERIODS = ["today", "tomorrow", "this_week", "next_week", "this_month", "last_month"] as const;
export type Period = (typeof PERIODS)[number];

export type DraftKind = "reminder" | "quote" | "reply";

export type Parsed = { intent: IntentId | null; name: string | null; period: Period | null };

export type Figure = { label: string; amount?: number; value?: string; tone?: "ok" | "warn" | "danger" };
export type Row = { label: string; detail?: string; amount?: number; href?: string; tone?: "ok" | "warn" | "danger" };
export type Draft = { kind: DraftKind; title: string; to: string; text: string; facts: Record<string, string> };

export type Answer = {
  intent: IntentId | null;
  understood: boolean;
  text: string;
  figures: Figure[];
  rows: Row[];
  /** Where every number in this answer came from. */
  source: string | null;
  link: Fix | null;
  follow: string[];
  drafts: Draft[];
  gap: Gap | null;
  name: string | null;
};

const fmt = formatTwd;
export const MAX_QUESTION = 200;

// ---------------------------------------------------------------------------
// Text

const SIMPLIFIED: Record<string, string> = {
  钱: "錢", 货: "貨", 库: "庫", 报: "報", 价: "價", 这: "這", 个: "個", 谁: "誰", 请: "請", 们: "們", 营: "營", 么: "麼", 卖: "賣", 单: "單",
  发: "發", 账: "帳", 帐: "帳", 应: "應", 现: "現", 够: "夠", 厂: "廠", 礼: "禮", 过: "過", 销: "銷", 进: "進", 采: "採", 购: "購", 资: "資",
  润: "潤", 赚: "賺", 头: "頭", 户: "戶", 状: "狀", 况: "況", 样: "樣", 写: "寫", 帮: "幫", 给: "給", 复: "覆", 讯: "訊", 订: "訂", 审: "審",
  签: "簽", 税: "稅", 败: "敗", 补: "補", 来: "來", 问: "問", 额: "額", 业: "業", 绩: "績", 没: "沒", 还: "還", 临: "臨", 务: "務", 员: "員",
  银: "銀", 转: "轉", 周: "週", 臺: "台",
};

const PUNCT = /[\s、，。！？?!.,:：;；~～「」『』()（）"'`＂＇\-—_/\\|*#@]+/g;

export function normalize(text: string) {
  let out = "";
  for (const ch of text.normalize("NFKC").toLowerCase().replace(PUNCT, "")) out += SIMPLIFIED[ch] ?? ch;
  return out;
}

// ---------------------------------------------------------------------------
// Dates (plain YYYY-MM-DD strings, no time zones)

function toDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

function md(day: string) {
  const [, m, d] = day.split("-").map(Number);
  return `${m}/${d}`;
}

function monthName(key: string) {
  return `${Number(key.slice(5, 7))} 月`;
}

export function periodRange(period: Period, today: string): [string, string] {
  const weekday = (toDate(today).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const first = `${today.slice(0, 7)}-01`;
  switch (period) {
    case "today":
      return [today, today];
    case "tomorrow":
      return [addDays(today, 1), addDays(today, 1)];
    case "this_week":
      return [today, addDays(monday, 6)];
    case "next_week":
      return [addDays(monday, 7), addDays(monday, 13)];
    case "this_month": {
      const next = toDate(first);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return [first, addDays(iso(next), -1)];
    }
    case "last_month": {
      const prev = toDate(first);
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      return [iso(prev), addDays(first, -1)];
    }
  }
}

const PERIOD_LABEL: Record<Period, string> = { today: "今天", tomorrow: "明天", this_week: "這週", next_week: "下週", this_month: "這個月", last_month: "上個月" };

const PERIOD_WORDS: [Period, RegExp][] = [
  ["last_month", /上個月|上月|lastmonth|前一個月/],
  ["this_month", /這個月|本月|這月|當月|thismonth/],
  ["next_week", /下週|下禮拜|下個禮拜|下星期|下個星期|nextweek/],
  ["this_week", /這週|本週|這禮拜|這個禮拜|這星期|這個星期|本星期|thisweek|這幾天|一週內/],
  ["tomorrow", /明天|明日|tomorrow/],
  ["today", /今天|今日|today/],
];

function findPeriod(q: string): Period | null {
  return PERIOD_WORDS.find(([, re]) => re.test(q))?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Intent words

const WORDS: Record<Exclude<IntentId, "draft_reminder" | "draft_quote" | "draft_reply" | "revenue_compare">, string[]> = {
  receivables: ["誰欠", "欠我們", "欠錢", "欠款", "欠多少", "應收", "帳款", "帳齡", "沒付錢", "還沒付", "未收", "還沒收", "收款", "催款", "催收", "要錢", "收錢"],
  overdue: ["逾期", "過期", "拖欠", "遲付", "拖款", "超過期限", "呆帳", "拖很久"],
  revenue: ["營收", "營業額", "業績", "收入", "賣了多少", "賣多少", "銷售額", "銷貨", "進帳", "做了多少生意", "生意怎樣", "生意好不好", "賺進"],
  margin: ["毛利", "利潤", "獲利", "賺多少", "賺了多少", "有沒有賺", "賺錢", "損益", "淨利", "毛利率"],
  low_stock: ["快沒", "缺貨", "庫存", "補貨", "不夠的貨", "貨夠", "安全庫存", "安全量", "快賣完", "沒貨", "存貨", "斷貨", "什麼貨"],
  quotes: ["報價", "估價", "卡住", "沒回", "等回覆", "最久", "還沒回"],
  orders: ["出貨", "待出貨", "還沒出", "交貨", "訂單", "要送", "派送", "交期"],
  leave: ["請假", "休假", "特休", "病假", "誰沒來", "誰不在", "誰休", "放假", "事假"],
  approvals: ["假單", "核准", "簽核", "待審", "等我核", "等我批", "批准"],
  payroll: ["薪水", "薪資", "發薪", "工資"],
  agenda: ["要做什麼", "待辦", "該做", "做什麼", "行程", "有什麼事", "先做", "要處理", "忙什麼", "todo", "該處理", "要注意", "排了什麼"],
  customer: ["狀況", "怎麼樣", "怎樣", "最近", "情況", "近況", "如何", "資料"],
  top_customers: ["最大的客", "大客戶", "最大客", "前十大", "買最多", "最多錢的客", "主要客人", "客人排行", "誰買最多", "最好的客", "大戶", "最大的客戶"],
  payables: ["付廠商", "應付", "待付", "要付", "欠廠商", "付款給", "廠商錢", "該付", "付多少", "廠商帳"],
  cash: ["現金", "夠不夠", "撐", "週轉", "銀行", "存款", "錢夠", "頭寸", "戶頭", "還有多少錢", "帳上有多少錢"],
  purchases: ["進貨", "採購", "到貨", "請購", "叫貨"],
  leads: ["新客人", "名單", "潛在", "詢問", "誰在問", "跟進", "新的客", "有人問", "線索", "lead", "在跟的"],
  vat: ["營業稅", "稅金", "繳稅", "稅額", "401"],
  einvoice: ["電子發票", "發票失敗", "沒開成", "發票上傳", "開發票"],
  capabilities: ["你會什麼", "可以問什麼", "能問什麼", "怎麼用", "你能做什麼", "help", "會回答什麼", "問什麼"],
};

const COMPARE = ["比上個月", "跟上個月比", "和上個月比", "跟上月比", "比較", "成長", "衰退", "差多少", "變多", "變少", "趨勢", "掉了", "多還是少", "比一比", "比呢", "對比"];
const DRAFT = ["幫我寫", "幫我回", "寫一", "擬", "草稿", "訊息", "簡訊", "寫信", "回信", "範本", "怎麼跟", "怎麼回", "怎麼說", "寫給", "發給", "傳給", "寫段", "寫個"];
const DRAFT_REMINDER = ["催", "付款", "匯款", "收款", "欠", "逾期", "尾款", "請款"];
const DRAFT_QUOTE = ["報價", "估價", "追", "跟進"];
const DRAFT_REPLY = ["回覆", "回答", "回客人", "回他", "回她", "問題", "問說", "詢問", "回一"];

function score(q: string, words: string[]) {
  return words.reduce((n, w) => (q.includes(w) ? n + w.length : n), 0);
}

// ---------------------------------------------------------------------------
// Names

type Known = { name: string; norm: string; cores: string[] };

const SUFFIXES = ["股份有限公司", "有限公司", "企業社", "工作室", "公司", "商行", "企業", "先生", "小姐", "老師", "醫師"];
const NOT_A_NAME = new Set(["客人", "客戶", "廠商", "公司", "我們", "這個", "今天", "明天", "最近", "狀況", "多少", "報價", "訂單"]);

function knownNames(f: AssistantFacts): Known[] {
  const names = new Set<string>();
  if (f.people.ok) f.people.data.forEach((p) => names.add(p.name));
  if (f.aging.ok) f.aging.data.forEach((r) => names.add(r.party));
  if (f.sales.ok) f.sales.data.docs.forEach((d) => names.add(d.party));
  if (f.purchases.ok) f.purchases.data.docs.forEach((d) => names.add(d.vendor));
  if (f.report.ok) f.report.data.topCustomers?.forEach((c) => names.add(c.name));
  return [...names]
    .filter((n) => n && n.trim().length >= 2)
    .map((name) => {
      const norm = normalize(name);
      const cores = new Set<string>();
      for (const s of SUFFIXES) if (norm.endsWith(s) && norm.length - s.length >= 2) cores.add(norm.slice(0, -s.length));
      // 王美玲 is often just 美玲.
      if (/^[\u4e00-\u9fff]{3}$/.test(norm)) cores.add(norm.slice(1));
      return { name, norm, cores: [...cores].filter((c) => !NOT_A_NAME.has(c)) };
    });
}

export function findName(q: string, f: AssistantFacts): string | null {
  let best: { name: string; score: number } | null = null;
  for (const k of knownNames(f)) {
    const s = q.includes(k.norm) ? k.norm.length + 10 : Math.max(0, ...k.cores.filter((c) => q.includes(c)).map((c) => c.length));
    if (s > 0 && (!best || s > best.score)) best = { name: k.name, score: s };
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// Parsing

export function parseQuestion(text: string, f: AssistantFacts): Parsed {
  const q = normalize(text.slice(0, MAX_QUESTION));
  // 「跟上個月比」 names what to compare against, not the month being asked about.
  const period = findPeriod(q.replace(/(跟|和|比|與)上個?月比?/g, ""));
  const name = findName(q, f);
  if (!q) return { intent: null, name: null, period: null };

  if (score(q, DRAFT) > 0) {
    const r = score(q, DRAFT_REMINDER);
    const quote = score(q, DRAFT_QUOTE);
    const reply = score(q, DRAFT_REPLY);
    const intent: IntentId = r > 0 && r >= quote && r >= reply ? "draft_reminder" : quote > 0 && quote >= reply ? "draft_quote" : "draft_reply";
    return { intent, name, period };
  }

  const scores = (Object.keys(WORDS) as (keyof typeof WORDS)[]).map((id) => ({ id: id as IntentId, s: score(q, WORDS[id]) }));
  const get = (id: IntentId) => scores.find((x) => x.id === id)?.s ?? 0;
  const compare = score(q, COMPARE) > 0;
  if (compare && get("margin") === 0 && (get("revenue") > 0 || scores.every((x) => x.s === 0 || x.id === "customer"))) {
    return { intent: "revenue_compare", name, period };
  }
  // A name with only generic words ("王美玲最近怎樣") is a question about that person.
  const top = scores.filter((x) => x.id !== "customer").sort((a, b) => b.s - a.s)[0];
  if (name && (!top || top.s === 0 || (get("customer") > 0 && top.s <= get("customer")))) return { intent: "customer", name, period };
  if (name && ["receivables", "quotes", "orders"].includes(top.id) && !q.includes("誰")) return { intent: "customer", name, period };
  if (top && top.s > 0) return { intent: top.id, name, period };
  if (period && /做|事|忙|排/.test(q)) return { intent: "agenda", name, period };
  return { intent: null, name, period };
}

// ---------------------------------------------------------------------------
// Availability

const NEEDS: Record<IntentId, (f: AssistantFacts) => boolean> = {
  receivables: (f) => f.aging.ok,
  overdue: (f) => f.aging.ok,
  revenue: (f) => (f.money.ok && f.money.data.monthSales !== null) || f.report.ok,
  revenue_compare: (f) => f.report.ok,
  margin: (f) => f.report.ok || (f.money.ok && f.money.data.grossProfit !== null),
  low_stock: (f) => f.stock.ok || f.report.ok,
  quotes: (f) => f.sales.ok,
  orders: (f) => f.sales.ok,
  leave: (f) => f.hr.ok,
  approvals: (f) => f.hr.ok,
  payroll: (f) => f.hr.ok && f.hr.data.payroll !== null,
  agenda: (f) => f.todo.ok || f.hr.ok || f.sales.ok,
  customer: (f) => f.people.ok || f.aging.ok || f.sales.ok,
  top_customers: (f) => f.report.ok || f.sales.ok,
  payables: (f) => f.purchases.ok || (f.money.ok && f.money.data.ap !== null),
  cash: (f) => f.money.ok && f.money.data.cash !== null,
  purchases: (f) => f.purchases.ok,
  leads: (f) => f.people.ok,
  vat: (f) => f.money.ok && f.money.data.vatPayable !== null,
  einvoice: (f) => f.money.ok && f.money.data.einvoices !== null,
  draft_reminder: (f) => f.aging.ok,
  draft_quote: (f) => f.sales.ok,
  draft_reply: () => true,
  capabilities: () => true,
};

export function canAnswer(intent: IntentId, f: AssistantFacts) {
  return NEEDS[intent](f);
}

function keep(questions: string[], f: AssistantFacts) {
  return [...new Set(questions)].filter((q) => {
    const p = parseQuestion(q, f);
    return p.intent !== null && canAnswer(p.intent, f);
  });
}

/** First-use chips, only for questions this person's data can answer. */
export function starterQuestions(f: AssistantFacts): string[] {
  const someone = f.aging.ok ? [...f.aging.data].sort((a, b) => owed(b) - owed(a))[0]?.party : f.people.ok ? f.people.data[0]?.name : undefined;
  return keep(
    [
      "誰欠我們最多？",
      "這個月營收多少？跟上個月比呢？",
      "什麼貨快沒了？",
      "哪張報價卡住最久？",
      "今天誰請假？",
      "今天要做什麼？",
      "現金夠不夠撐？",
      "最大的客人是誰？",
      ...(someone ? [`${someone} 最近怎樣？`] : []),
      "幫我寫催款訊息",
      "待付廠商多少？",
    ],
    f,
  ).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Answers

type Ctx = { f: AssistantFacts; p: Parsed; text: string };

function base(intent: IntentId | null, extra: Partial<Answer>): Answer {
  return { intent, understood: intent !== null, text: "", figures: [], rows: [], source: null, link: null, follow: [], drafts: [], gap: null, name: null, ...extra };
}

function from(f: AssistantFacts, live: string, demo = live) {
  return f.mode === "demo" ? `示範資料（照你的產業產生，不是真的帳）：${demo}` : `來自 ERPNext：${live}`;
}

function missing(intent: IntentId, slot: { ok: false } & Gap, follow: string[] = []): Answer {
  const gap: Gap = { reason: slot.reason, message: slot.message, fix: slot.fix };
  return base(intent, { text: slot.message, gap, link: slot.fix ?? null, follow });
}

function owed(r: AgingRow) {
  return r.current + r.d30 + r.d60 + r.d90;
}
function late(r: AgingRow) {
  return r.d30 + r.d60 + r.d90;
}
function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((n, r) => n + pick(r), 0);
}

const AGING_SOURCE_LIVE = "銷項發票還沒收的金額，依付款到期日算逾期天數";
const AGING_SOURCE_DEMO = "練習帳本的帳齡，和「收錢」頁同一份";

function receivables({ f }: Ctx): Answer {
  if (!f.aging.ok) return missing("receivables", f.aging);
  const rows = f.aging.data.filter((r) => owed(r) > 0).sort((a, b) => owed(b) - owed(a));
  const total = sum(rows, owed);
  const overdue = sum(rows, late);
  const old = sum(rows, (r) => r.d60 + r.d90);
  const link = { href: "/workspace/erp/finance#aging", label: "到收錢看帳齡" };
  if (!rows.length) return base("receivables", { text: "現在沒有客人欠款，帳都收齊了。", source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO), link, follow: keep(["待付廠商多少？", "這個月營收多少？"], f) });
  const top = rows[0];
  return base("receivables", {
    text: `${top.party} 欠最多，共 ${fmt(owed(top))}${late(top) ? `，其中 ${fmt(late(top))} 已經逾期` : "，都還沒到期"}。全部還沒收的錢 ${fmt(total)}，${rows.length} 位客人。`,
    figures: [
      { label: "還沒收的錢", amount: total },
      { label: "已經逾期", amount: overdue, tone: overdue ? "warn" : "ok" },
      { label: "超過 30 天", amount: old, tone: old ? "danger" : "ok" },
    ],
    rows: rows.slice(0, 5).map((r) => ({ label: r.party, amount: owed(r), detail: late(r) ? `逾期 ${fmt(late(r))}` : "還沒到期", tone: r.d60 + r.d90 ? "danger" : late(r) ? "warn" : undefined, href: r.href })),
    source: from(f, AGING_SOURCE_LIVE + (f.aging.data.length >= 30 ? "（列出欠最多的 30 位）" : ""), AGING_SOURCE_DEMO),
    link,
    follow: keep([late(top) ? `幫我寫催款訊息給${top.party}` : "", "逾期多少？", "現金夠不夠撐？"], f),
  });
}

function overdue({ f }: Ctx): Answer {
  if (!f.aging.ok) return missing("overdue", f.aging);
  const rows = f.aging.data.filter((r) => late(r) > 0).sort((a, b) => b.d90 - a.d90 || b.d60 - a.d60 || late(b) - late(a));
  const total = sum(rows, late);
  const link = { href: "/workspace/erp/finance#aging", label: "到收錢看帳齡" };
  if (!rows.length) return base("overdue", { text: "沒有逾期的帳，客人都在期限內。", source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO), link, follow: keep(["誰欠我們最多？", "這個月營收多少？"], f) });
  const worst = rows[0];
  const worstLabel = worst.d90 ? `超過 60 天的 ${fmt(worst.d90)}` : worst.d60 ? `31–60 天的 ${fmt(worst.d60)}` : `逾期 ${fmt(worst.d30)}`;
  return base("overdue", {
    text: `逾期還沒收的有 ${fmt(total)}，${rows.length} 位客人。拖最久的是 ${worst.party}（${worstLabel}）。`,
    figures: [
      { label: "逾期 1–30 天", amount: sum(rows, (r) => r.d30), tone: "warn" },
      { label: "31–60 天", amount: sum(rows, (r) => r.d60), tone: "warn" },
      { label: "超過 60 天", amount: sum(rows, (r) => r.d90), tone: "danger" },
    ],
    rows: rows.slice(0, 5).map((r) => ({ label: r.party, amount: late(r), detail: r.d90 ? `超過 60 天 ${fmt(r.d90)}` : r.d60 ? `31–60 天 ${fmt(r.d60)}` : "1–30 天", tone: r.d90 || r.d60 ? "danger" : "warn", href: r.href })),
    source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO),
    link,
    follow: keep([`幫我寫催款訊息給${worst.party}`, "誰欠我們最多？", "現金夠不夠撐？"], f),
  });
}

const REPORT_SOURCE = "報表的每月營收（送出的銷項發票，未稅、退貨已扣）";

function revenue({ f, p }: Ctx): Answer {
  const r = f.report.ok ? f.report.data.revenue : null;
  const link = f.report.ok ? { href: "/workspace/reports", label: "到報表看每月營收" } : { href: "/workspace/erp/finance", label: "到收錢看損益" };
  if (p.period === "last_month") {
    if (!f.report.ok) return missing("revenue", { ...f.report, message: `上個月的營收要看報表。${f.report.message}` });
    if (!r || r.length < 2) return base("revenue", { text: "報表裡沒有上個月的營收。", gap: { reason: "missing", message: "報表裡沒有上個月的營收。" }, link });
    const prev = r[r.length - 2];
    return base("revenue", {
      text: `上個月（${monthName(prev.month)}）營收是 ${fmt(prev.amount)}，未稅。`,
      figures: [{ label: `${monthName(prev.month)}營收`, amount: prev.amount }],
      source: from(f, REPORT_SOURCE),
      link,
      follow: keep(["跟上上個月比呢？", "上個月毛利多少？", "最大的客人是誰？"], f),
    });
  }
  const cur = f.money.ok && f.money.data.monthSales !== null ? f.money.data.monthSales : r?.length ? r[r.length - 1].amount : null;
  if (cur === null) {
    const gap = !f.money.ok ? f.money : !f.report.ok ? f.report : null;
    if (gap) return missing("revenue", gap);
    return base("revenue", { text: "看不到這個月的營收：你的 ERPNext 角色不能看銷項發票。", gap: { reason: "role", message: "你的 ERPNext 角色不能看銷項發票。", fix: { href: "/help/roles", label: "看職務與權限" } } });
  }
  const prev = r && r.length >= 2 ? r[r.length - 2] : null;
  const fromMoney = f.money.ok && f.money.data.monthSales !== null;
  const daily = p.period === "today" || p.period === "tomorrow" || p.period === "this_week" || p.period === "next_week";
  return base("revenue", {
    text: `${daily ? "我只算得出整個月的營收。" : ""}這個月到今天（${md(f.today)}）的營收是 ${fmt(cur)}，未稅。${prev ? `上個月整個月是 ${fmt(prev.amount)}。` : ""}`,
    figures: [{ label: "這個月營收", amount: cur }, ...(prev ? [{ label: `上個月（${monthName(prev.month)}）`, amount: prev.amount }] : [])],
    source: from(f, fromMoney ? `這個月送出的銷項發票，未稅${prev ? "；上個月來自報表" : ""}` : REPORT_SOURCE, "練習帳本的本月銷貨，和「收錢」頁同一份"),
    link,
    follow: keep(["跟上個月比呢？", "毛利多少？", "最大的客人是誰？"], f),
  });
}

function revenueCompare({ f, p }: Ctx): Answer {
  if (!f.report.ok) return missing("revenue_compare", { ...f.report, message: `要跟上個月比得看報表。${f.report.message}` }, keep(["這個月營收多少？"], f));
  const r = f.report.data.revenue;
  const shift = p.period === "last_month" ? 1 : 0;
  if (!r || r.length < 2 + shift) return base("revenue_compare", { text: "報表裡的月份不夠，沒辦法比。", gap: { reason: "missing", message: "報表裡的月份不夠。" } });
  const cur = r[r.length - 1 - shift];
  const prev = r[r.length - 2 - shift];
  const diff = cur.amount - prev.amount;
  const pct = prev.amount ? Math.round((cur.amount / prev.amount) * 100) : null;
  const running = shift === 0;
  const daysLeft = running ? daysBetween(f.today, periodRange("this_month", f.today)[1]) : 0;
  const text = running
    ? `這個月到今天 ${fmt(cur.amount)}，上個月整月 ${fmt(prev.amount)}${pct !== null ? `，已經做到上個月的 ${pct}%` : ""}${daysLeft ? `，這個月還有 ${daysLeft} 天` : ""}。`
    : `${monthName(cur.month)} ${fmt(cur.amount)}，比 ${monthName(prev.month)} ${diff >= 0 ? "多" : "少"} ${fmt(Math.abs(diff))}${pct !== null ? `（${pct}%）` : ""}。`;
  return base("revenue_compare", {
    text,
    figures: [
      { label: running ? "這個月到今天" : monthName(cur.month), amount: cur.amount },
      { label: monthName(prev.month), amount: prev.amount },
      { label: "差額", amount: diff, tone: diff < 0 ? "warn" : "ok" },
    ],
    rows: r.slice(-6).reverse().map((m) => ({ label: monthName(m.month), amount: m.amount })),
    source: from(f, REPORT_SOURCE),
    link: { href: "/workspace/reports", label: "到報表看趨勢" },
    follow: keep(["毛利多少？", "最大的客人是誰？", "誰欠我們最多？"], f),
  });
}

function margin({ f, p }: Ctx): Answer {
  const rows = f.report.ok ? f.report.data.margin : null;
  if (rows && rows.length) {
    const shift = p.period === "last_month" ? 1 : 0;
    const cur = rows[rows.length - 1 - shift];
    const prev = rows[rows.length - 2 - shift];
    if (!cur) return base("margin", { text: "報表裡沒有那個月的毛利。", gap: { reason: "missing", message: "報表裡沒有那個月的毛利。" } });
    return base("margin", {
      text: `${shift ? `上個月（${monthName(cur.month)}）` : "這個月到今天"}毛利 ${fmt(cur.profit)}${cur.percent !== null ? `，毛利率 ${cur.percent}%` : ""}。${prev ? `${monthName(prev.month)}是 ${fmt(prev.profit)}${prev.percent !== null ? `（${prev.percent}%）` : ""}。` : ""}`,
      figures: [
        { label: "營收", amount: cur.revenue },
        { label: "毛利", amount: cur.profit, tone: cur.profit < 0 ? "danger" : undefined },
        { label: "毛利率", value: cur.percent !== null ? `${cur.percent}%` : "—" },
      ],
      source: from(f, "報表的毛利（ERPNext Gross Profit：營收減出貨當下的庫存成本）"),
      link: { href: "/workspace/reports", label: "到報表看毛利" },
      follow: keep(["跟上個月比呢？", "最大的客人是誰？", "什麼貨快沒了？"], f),
    });
  }
  if (f.money.ok && f.money.data.grossProfit !== null && f.money.data.monthSales !== null) {
    const gp = f.money.data.grossProfit;
    const pct = f.money.data.monthSales ? Math.round((gp / f.money.data.monthSales) * 1000) / 10 : null;
    return base("margin", {
      text: `這個月毛利 ${fmt(gp)}${pct !== null ? `，毛利率 ${pct}%` : ""}。`,
      figures: [
        { label: "本月銷貨", amount: f.money.data.monthSales },
        { label: "毛利", amount: gp },
      ],
      source: from(f, "本月損益", "練習帳本的本月損益，和「收錢」頁同一份"),
      link: { href: "/workspace/erp/finance", label: "到收錢看損益" },
      follow: keep(["這個月營收多少？", "現金夠不夠撐？"], f),
    });
  }
  const gap = !f.report.ok ? f.report : null;
  const msg = `毛利要從報表算（用出貨成本）。${gap ? gap.message : "報表裡沒有毛利。"}`;
  const m = f.money.ok ? f.money.data : null;
  return base("margin", {
    text: msg,
    gap: { reason: gap?.reason ?? "missing", message: msg, fix: gap?.fix },
    link: gap?.fix ?? null,
    figures:
      m && m.monthSales !== null && m.monthCost !== null
        ? [
            { label: "本月銷貨（未稅）", amount: m.monthSales },
            { label: "本月進貨與費用（未稅）", amount: m.monthCost },
          ]
        : [],
    source: m && m.monthSales !== null ? from(f, "這個月的銷項與進項發票；兩者相減不是毛利，只能當參考") : null,
    follow: keep(["這個月營收多少？"], f),
  });
}

function lowStock({ f }: Ctx): Answer {
  const link = { href: "/workspace/erp/stock", label: "到庫存請購" };
  const fromReport = f.report.ok ? f.report.data.lowStock : null;
  if (fromReport) {
    const rows = [...fromReport].sort((a, b) => a.projected - a.reorderLevel - (b.projected - b.reorderLevel));
    if (!rows.length) return base("low_stock", { text: "目前沒有低於補貨點的貨。", source: from(f, "報表的「快不夠的貨」（預計庫存低於補貨點）", "練習帳本的庫存"), link, follow: keep(["待付廠商多少？", "有哪些進貨還沒到？"], f) });
    const w = rows[0];
    return base("low_stock", {
      text: `${rows.length} 項貨快不夠了，最缺的是 ${w.name}：預計剩 ${w.projected}，補貨點 ${w.reorderLevel}。`,
      figures: [{ label: "快不夠的品項", value: String(rows.length), tone: "warn" }],
      rows: rows.slice(0, 6).map((r) => ({ label: r.name, detail: `預計剩 ${r.projected}／補貨點 ${r.reorderLevel} · ${r.warehouse}${r.reorderQty ? ` · 建議補 ${r.reorderQty}` : ""}`, tone: r.projected <= 0 ? "danger" : "warn", href: r.href })),
      source: from(f, "報表的「快不夠的貨」（預計庫存＝現有＋在途－已答應，低於補貨點）", "練習帳本的庫存，和「庫存」頁同一份"),
      link,
      follow: keep(["有哪些進貨還沒到？", "待付廠商多少？", "現金夠不夠撐？"], f),
    });
  }
  if (!f.stock.ok) return missing("low_stock", f.stock);
  const rows = f.stock.data.filter((r) => r.safety > 0 && r.onHand < r.safety).sort((a, b) => a.onHand / a.safety - b.onHand / b.safety);
  const src = from(f, "每個倉庫的現有數量對照補貨點（數量是 0 的品項不在這份清單）", "練習帳本的庫存，和「庫存」頁同一份");
  if (!rows.length) return base("low_stock", { text: "目前沒有低於安全量的貨。", source: src, link, follow: keep(["待付廠商多少？", "有哪些進貨還沒到？"], f) });
  const w = rows[0];
  return base("low_stock", {
    text: `${rows.length} 項貨低於安全量，最缺的是 ${w.name}：剩 ${w.onHand}，安全量 ${w.safety}。`,
    figures: [{ label: "低於安全量", value: `${rows.length} 項`, tone: "warn" }],
    rows: rows.slice(0, 6).map((r) => ({ label: r.name, detail: `剩 ${r.onHand}／安全量 ${r.safety} · ${r.warehouse}`, tone: r.onHand <= 0 ? "danger" : "warn", href: r.href })),
    source: src,
    link,
    follow: keep(["有哪些進貨還沒到？", "待付廠商多少？", "現金夠不夠撐？"], f),
  });
}

function hiddenGap(intent: IntentId, what: string): Answer {
  const message = `你的 ERPNext 角色看不到${what}。`;
  return base(intent, { text: message, gap: { reason: "role", message, fix: { href: "/help/roles", label: "看職務與權限" } }, link: { href: "/help/roles", label: "看職務與權限" } });
}

function quoteAge(d: SalesDoc, today: string) {
  return d.date ? daysBetween(d.date, today) : null;
}

function quotes({ f }: Ctx): Answer {
  if (!f.sales.ok) return missing("quotes", f.sales);
  if (f.sales.data.hidden.includes("Quotation")) return hiddenGap("quotes", "報價");
  const list = f.sales.data.docs.filter((d) => d.step === "quote").sort((a, b) => (quoteAge(b, f.today) ?? -1) - (quoteAge(a, f.today) ?? -1));
  const link = { href: "/workspace/erp/sales", label: "到銷售看報價" };
  const src = from(f, "送出、還沒成交的報價單（開單日期起算）", "練習帳本的報價，和「銷售」頁同一份");
  if (!list.length) return base("quotes", { text: "現在沒有等回覆的報價。", source: src, link, follow: keep(["有哪些訂單還沒出貨？", "這個月營收多少？"], f) });
  const total = sum(list, (d) => d.amount);
  const o = list[0];
  const age = quoteAge(o, f.today);
  return base("quotes", {
    text: `${age !== null ? `${o.party} 的報價 ${o.no} 卡最久，開出 ${age} 天了（${fmt(o.amount)}，未稅）。` : `最近一張是 ${o.party} 的 ${o.no}（${fmt(o.amount)}，未稅）。`}一共 ${list.length} 張報價等回覆，合計 ${fmt(total)}。`,
    figures: [
      { label: "等回覆的報價", value: `${list.length} 張` },
      { label: "合計（未稅）", amount: total },
    ],
    rows: list.slice(0, 6).map((d) => {
      const a = quoteAge(d, f.today);
      const expired = d.due && d.due < f.today;
      return { label: d.party, amount: d.amount, detail: [d.no, a !== null ? `開出 ${a} 天` : null, d.due ? (expired ? `${md(d.due)} 已過期` : `有效到 ${md(d.due)}`) : null].filter(Boolean).join(" · "), tone: expired || (a ?? 0) > 14 ? "warn" : undefined, href: d.href };
    }),
    source: src,
    link,
    follow: keep([`幫我寫報價追蹤給${o.party}`, "有哪些訂單還沒出貨？", "這個月營收多少？"], f),
  });
}

function orders({ f, p }: Ctx): Answer {
  if (!f.sales.ok) return missing("orders", f.sales);
  if (f.sales.data.hidden.includes("Sales Order")) return hiddenGap("orders", "訂單");
  let open = f.sales.data.docs.filter((d) => d.step === "order");
  const done = f.sales.data.docs.filter((d) => d.step === "fulfill");
  const range = p.period ? periodRange(p.period, f.today) : null;
  if (range) open = open.filter((d) => d.due && d.due <= range[1]);
  open.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const word = f.fulfillment;
  const link = { href: "/workspace/erp/sales", label: "到銷售看訂單" };
  const src = from(f, "送出、還沒交貨或還沒開發票的訂單（交期是訂單上的交貨日）", "練習帳本的訂單，和「銷售」頁同一份");
  if (!open.length && !done.length) return base("orders", { text: range ? `${PERIOD_LABEL[p.period!]}沒有要${word}的訂單。` : `沒有等著${word}的訂單。`, source: src, link, follow: keep(["哪張報價卡住最久？", "誰欠我們最多？"], f) });
  const lateOnes = open.filter((d) => d.due && d.due < f.today);
  const first = open[0];
  return base("orders", {
    text: `${open.length} 張訂單還沒${word}${first?.due ? `，最早要在 ${md(first.due)} 交（${first.party}）` : ""}${lateOnes.length ? `，其中 ${lateOnes.length} 張已經過了交期` : ""}。${done.length ? `另外 ${done.length} 張${word}完了還沒開發票。` : ""}`,
    figures: [
      { label: `還沒${word}`, value: `${open.length} 張`, tone: lateOnes.length ? "warn" : undefined },
      { label: "還沒開發票", value: `${done.length} 張` },
    ],
    rows: [...open, ...done].slice(0, 6).map((d) => ({ label: d.party, amount: d.amount, detail: [d.no, d.step === "order" ? `還沒${word}` : "待開發票", d.due ? `交期 ${md(d.due)}` : null].filter(Boolean).join(" · "), tone: d.due && d.due < f.today && d.step === "order" ? "warn" : undefined, href: d.href })),
    source: src,
    link,
    follow: keep(["哪張報價卡住最久？", "什麼貨快沒了？", "誰欠我們最多？"], f),
  });
}

function overlaps(from: string, to: string, range: [string, string]) {
  return from <= range[1] && to >= range[0];
}

function leave({ f, p }: Ctx): Answer {
  if (!f.hr.ok) return missing("leave", f.hr);
  const hr = f.hr.data;
  if (hr.denied?.includes("on_leave")) return hiddenGap("leave", "誰請假");
  const period = p.period && p.period !== "this_month" && p.period !== "last_month" ? p.period : "today";
  const range = periodRange(period, f.today);
  const onLeave = hr.onLeave.filter((l) => overlaps(l.fromDate, l.toDate, range));
  const pending = hr.approvals.filter((a) => overlaps(a.fromDate, a.toDate, range));
  const label = PERIOD_LABEL[period];
  const names = onLeave.map((l) => `${l.name}（${l.leaveType}${l.halfDay ? "半天" : ""}）`).join("、");
  const link = { href: "/workspace/hr#leave", label: "到人事看假單" };
  const future = period !== "today";
  const src = from(f, `ERPNext 人事：今天在休的人${hr.can.approve ? "、還沒核准的假單" : ""}${future ? "；明天以後才開始、已經核准的假單要到人事看" : ""}`, "練習的人事資料，和「人事」頁同一份");
  const text = onLeave.length ? `${label}有 ${onLeave.length} 人請假：${names}。` : `${label}沒有人請假${future ? "（看得到的範圍內）" : ""}。`;
  return base("leave", {
    text: text + (pending.length ? `另外 ${pending.length} 張假單等核准。` : ""),
    rows: [
      ...onLeave.map((l) => ({ label: l.name, detail: `${l.leaveType} · ${dayRange(l.fromDate, l.toDate)}${l.halfDay ? " · 半天" : ""}`, href: l.href })),
      ...pending.map((a) => ({ label: a.employee, detail: `等核准 · ${a.leaveType} · ${dayRange(a.fromDate, a.toDate)}`, tone: "warn" as const, href: a.href })),
    ],
    source: src,
    link,
    follow: keep([hr.can.approve ? "有假單等我核准嗎？" : "", period === "today" ? "這週誰請假？" : "今天誰請假？", "今天要做什麼？"], f),
  });
}

function dayRange(from: string, to: string) {
  return from === to ? md(from) : `${md(from)}–${md(to)}`;
}

function approvals({ f }: Ctx): Answer {
  if (!f.hr.ok) return missing("approvals", f.hr);
  const hr = f.hr.data;
  const link = { href: "/workspace/hr#leave", label: "到人事核准" };
  if (!hr.can.approve) return base("approvals", { text: "你不是核准假單的人，沒有等你核准的假單。自己的假單請到 ERPNext 看進度。", link, follow: keep(["今天誰請假？"], f) });
  const list = [...hr.approvals].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const src = from(f, "ERPNext 人事：等你核准的假單", "練習的人事資料，和「人事」頁同一份");
  if (!list.length) return base("approvals", { text: "沒有等你核准的假單。", source: src, link, follow: keep(["今天誰請假？", "今天要做什麼？"], f) });
  const first = list[0];
  return base("approvals", {
    text: `${list.length} 張假單等你核准，最早的是 ${first.employee} ${dayRange(first.fromDate, first.toDate)} 的${first.leaveType}（${first.days} 天）。`,
    rows: list.slice(0, 6).map((a) => ({ label: a.employee, detail: `${a.leaveType} · ${dayRange(a.fromDate, a.toDate)} · ${a.days} 天${a.reason ? ` · ${a.reason}` : ""}`, href: a.href })),
    source: src,
    link,
    follow: keep(["今天誰請假？", "這週誰請假？", "今天要做什麼？"], f),
  });
}

const PAYROLL_STATE: Record<NonNullable<HrToday["payroll"]>["state"], string> = {
  not_started: "還沒開始",
  started: "已經開了薪資發放，還沒產生薪資單",
  slips: "薪資單在跑",
  paid: "薪資單都確認了",
};

function payroll({ f }: Ctx): Answer {
  if (!f.hr.ok) return missing("payroll", f.hr);
  const pay = f.hr.data.payroll;
  const link = { href: "/workspace/hr", label: "到人事看薪資" };
  if (!pay) return hiddenGap("payroll", "薪資");
  const warn = f.hr.data.rates && (!f.hr.data.rates.verified || !f.hr.data.rates.current) ? `提醒：${f.hr.data.rates.year} 年的勞健保費率還沒核對。` : "";
  return base("payroll", {
    text: `${Number(pay.month.slice(5, 7))} 月薪資${PAYROLL_STATE[pay.state]}：${pay.employees} 人${pay.netPay ? `，實發合計 ${fmt(pay.netPay)}` : ""}。${warn}`,
    figures: [
      { label: "人數", value: `${pay.employees} 人` },
      ...(pay.netPay ? [{ label: "實發合計", amount: pay.netPay }] : []),
      { label: "草稿／已確認", value: `${pay.draft}／${pay.submitted}` },
    ],
    source: from(f, "ERPNext 人事：這個月的薪資發放與薪資單", "練習的人事資料，和「人事」頁同一份"),
    link,
    follow: keep(["現金夠不夠撐？", "今天誰請假？"], f),
  });
}

type AgendaItem = Row & { when: string };

function agenda({ f, p }: Ctx): Answer {
  const period = p.period && p.period !== "last_month" ? p.period : "today";
  const range = periodRange(period, f.today);
  const label = PERIOD_LABEL[period];
  const items: AgendaItem[] = [];
  const parts: string[] = [];
  const inRange = (d?: string) => Boolean(d && d >= range[0] && d <= range[1]);

  if (f.sales.ok) {
    parts.push("有日期的報價、訂單、發票");
    for (const d of f.sales.data.docs) {
      if (d.step === "quote" && inRange(d.due)) items.push({ when: d.due!, label: `${d.party} 的報價到期`, detail: `${d.no} · ${md(d.due!)}`, amount: d.amount, href: d.href });
      if (d.step === "order" && inRange(d.due)) items.push({ when: d.due!, label: `${f.fulfillment}給 ${d.party}`, detail: `${d.no} · 交期 ${md(d.due!)}`, amount: d.amount, href: d.href });
      if (d.step === "invoice" && inRange(d.due)) items.push({ when: d.due!, label: `${d.party} 該付款`, detail: `${d.no} · ${md(d.due!)} 到期`, amount: d.amount + d.tax, href: d.href });
    }
  }
  if (f.purchases.ok) {
    parts.push("要付的進項發票");
    for (const d of f.purchases.data.docs) if (d.status === "待付款" && inRange(d.due)) items.push({ when: d.due!, label: `付款給 ${d.vendor}`, detail: `${d.no} · ${md(d.due!)} 到期`, amount: d.amount, href: d.href });
  }
  if (f.hr.ok) {
    parts.push("假單");
    for (const l of f.hr.data.onLeave) if (overlaps(l.fromDate, l.toDate, range)) items.push({ when: l.fromDate < range[0] ? range[0] : l.fromDate, label: `${l.name} 請假`, detail: `${l.leaveType} · ${dayRange(l.fromDate, l.toDate)}`, href: l.href });
    if (f.hr.data.can.approve) for (const a of f.hr.data.approvals) if (a.fromDate <= range[1]) items.push({ when: a.fromDate < f.today ? f.today : a.fromDate, label: `核准 ${a.employee} 的假單`, detail: `${a.leaveType} · ${dayRange(a.fromDate, a.toDate)}`, tone: "warn", href: "/workspace/hr#leave" });
  }
  items.sort((a, b) => a.when.localeCompare(b.when));
  const now = period === "today" || period === "this_week";
  // Collections come from the aging table itself so the amount matches 「誰欠我們」.
  const jobs = now && f.todo.ok ? f.todo.data.filter((j) => j.title !== "今天沒有卡住的事" && !(f.aging.ok && j.href.startsWith("/workspace/erp/finance") && !j.title.includes("發票"))) : [];
  if (now && f.aging.ok) {
    const worst = [...f.aging.data].sort((a, b) => late(b) - late(a))[0];
    if (worst && late(worst) > 0) jobs.unshift({ title: `跟 ${worst.party} 收款`, detail: `逾期 ${fmt(late(worst))}`, href: "/workspace/erp/finance#aging", tone: "warn" });
  }
  if (now && f.todo.ok) parts.unshift("「今天」頁的待辦");
  if (!parts.length) {
    const gap = [f.todo, f.sales, f.hr].find((s): s is { ok: false } & Gap => !s.ok);
    return missing("agenda", gap ?? { ok: false, reason: "missing", message: "看不到任何待辦資料。" });
  }
  const rows: Row[] = [...jobs.map((j) => ({ label: j.title, detail: j.detail, href: j.href, tone: j.tone === "urgent" ? ("danger" as const) : j.tone === "warn" ? ("warn" as const) : undefined })), ...items];
  const n = rows.length;
  const text = n
    ? `${label}有 ${n} 件事${rows[0] ? `，先做「${rows[0].label}」` : ""}${n > 1 ? `，再來是「${rows[1].label}」` : ""}。`
    : `${label}沒有排到日期的事${now ? "，也沒有卡住的待辦" : ""}。`;
  return base("agenda", {
    text,
    rows: rows.slice(0, 8),
    source: from(f, parts.join("、")),
    link: { href: "/workspace", label: "回今天" },
    follow: keep([period === "today" ? "明天要做什麼？" : "今天要做什麼？", period === "this_week" ? "下週要做什麼？" : "這週要做什麼？", "誰欠我們最多？"], f),
  });
}

function customerFacts(f: AssistantFacts, name: string) {
  const person = f.people.ok ? f.people.data.find((x) => x.name === name) : undefined;
  const aging = f.aging.ok ? f.aging.data.find((r) => r.party === name) : undefined;
  const docs = f.sales.ok ? f.sales.data.docs.filter((d) => d.party === name) : [];
  const top = f.report.ok ? f.report.data.topCustomers : null;
  const rank = top ? top.findIndex((c) => c.name === name) : -1;
  const bills = f.purchases.ok ? f.purchases.data.docs.filter((d) => d.vendor === name) : [];
  return { person, aging, docs, rank, topRow: rank >= 0 && top ? top[rank] : undefined, bills };
}

/** Same words as the 客人 page uses for ERPNext Lead statuses. */
const LEAD_STAGE: Record<string, string> = { Lead: "新名單", Open: "跟進中", Replied: "已回覆", Interested: "有興趣", Opportunity: "有機會", Quotation: "已報價", "Lost Quotation": "報價沒成" };
const stageName = (stage: string) => LEAD_STAGE[stage] ?? stage;

const STEP_LABEL: Record<SalesDoc["step"], string> = { quote: "報價等回覆", order: "訂單還沒交", fulfill: "做完待開發票", invoice: "待收款", paid: "已收款" };

function customer(ctx: Ctx): Answer {
  const { f, p } = ctx;
  if (!p.name) {
    const names = knownNames(f).slice(0, 3).map((k) => `${k.name} 最近怎樣？`);
    return base("customer", { text: "要問哪一位客人？把名字打進來，例如「王美玲最近怎樣」。", follow: names });
  }
  const name = p.name;
  const c = customerFacts(f, name);
  const parts: string[] = [];
  const figures: Figure[] = [];
  const unseen: string[] = [];
  if (c.person) parts.push(`在「${stageName(c.person.stage)}」${c.person.channel ? `，從 ${c.person.channel} 來` : ""}`);
  if (c.aging && owed(c.aging) > 0) {
    parts.push(`欠我們 ${fmt(owed(c.aging))}${late(c.aging) ? `，逾期 ${fmt(late(c.aging))}` : "，還沒到期"}`);
    figures.push({ label: "欠我們", amount: owed(c.aging) }, { label: "已經逾期", amount: late(c.aging), tone: late(c.aging) ? "warn" : "ok" });
  } else if (f.aging.ok && c.aging) parts.push("沒有欠款");
  const open = c.docs.filter((d) => d.step !== "paid");
  const counts = (["quote", "order", "fulfill", "invoice"] as const).map((s) => ({ s, n: open.filter((d) => d.step === s).length })).filter((x) => x.n);
  if (counts.length) parts.push(counts.map((x) => `${x.n} 張${STEP_LABEL[x.s]}`).join("、"));
  if (c.topRow) {
    parts.push(`近 ${f.report.ok ? f.report.data.months : 12} 個月買了 ${fmt(c.topRow.amount)}，第 ${c.rank + 1} 大`);
    figures.push({ label: "近一年買了", amount: c.topRow.amount });
  }
  const billOpen = c.bills.filter((b) => b.status !== "已付款");
  if (billOpen.length) parts.push(`我們還要付他 ${fmt(sum(billOpen, (b) => b.amount))}（${billOpen.length} 筆）`);
  if (!f.aging.ok) unseen.push("帳款");
  if (!f.sales.ok) unseen.push("單據");
  if (!f.people.ok) unseen.push("客人資料");
  const sources = [c.person ? "客人資料" : "", c.aging ? "帳齡" : "", c.docs.length ? "銷售單據" : "", c.topRow ? "報表前十大" : "", c.bills.length ? "採購單據" : ""].filter(Boolean);
  const drafts: Draft[] = [];
  if (c.aging && late(c.aging) > 0) drafts.push(reminderDraft(f, c.aging));
  const q = open.find((d) => d.step === "quote");
  if (q) drafts.push(quoteDraft(f, q));
  const text = parts.length ? `${name}：${parts.join("；")}。` : `找到 ${name}，但你看得到的資料裡沒有進行中的單或欠款。`;
  return base("customer", {
    name,
    text: text + (unseen.length ? `（你看不到${unseen.join("、")}，所以沒算進來）` : ""),
    figures,
    rows: [...open, ...billOpen.map((b) => ({ ...b, party: b.vendor }))].slice(0, 6).map((d) =>
      "step" in d ? { label: d.no, detail: `${STEP_LABEL[d.step]}${d.overdueDays ? ` · 逾期 ${d.overdueDays} 天` : ""}${d.due ? ` · ${md(d.due)}` : ""}`, amount: d.amount, href: d.href, tone: d.overdueDays ? ("warn" as const) : undefined } : { label: d.no, detail: `要付廠商 · ${d.status}`, amount: d.amount, href: d.href },
    ),
    source: sources.length ? from(f, sources.join("、"), sources.join("、")) : null,
    link: c.person?.href ? { href: c.person.href, label: "在 ERPNext 打開這位客人" } : f.people.ok ? { href: "/workspace/crm#find", label: "到客人頁找他" } : null,
    drafts,
    follow: keep([c.aging && late(c.aging) ? `幫我寫催款訊息給${name}` : "", q ? `幫我寫報價追蹤給${name}` : "", `幫我回${name}的問題`, "最大的客人是誰？"], f).slice(0, 3),
  });
}

function topCustomers({ f }: Ctx): Answer {
  const top = f.report.ok ? f.report.data.topCustomers : null;
  if (top && top.length) {
    const months = f.report.ok ? f.report.data.months : 12;
    const total = sum(top, (c) => c.amount);
    return base("top_customers", {
      text: `近 ${months} 個月買最多的是 ${top[0].name}，${fmt(top[0].amount)}（未稅）${top[1] ? `；第二是 ${top[1].name}，${fmt(top[1].amount)}` : ""}。`,
      figures: [{ label: `前 ${top.length} 大合計`, amount: total }],
      rows: top.slice(0, 6).map((c, i) => ({ label: `${i + 1}. ${c.name}`, amount: c.amount, href: c.href })),
      source: from(f, `報表的前十大客人（近 ${months} 個月送出的銷項發票，未稅）`),
      link: { href: "/workspace/reports", label: "到報表看前十大" },
      follow: keep([`${top[0].name} 最近怎樣？`, "誰欠我們最多？", "跟上個月比呢？"], f),
    });
  }
  if (!f.sales.ok) return missing("top_customers", f.report.ok ? f.sales : f.report);
  const by = new Map<string, number>();
  for (const d of f.sales.data.docs) if (d.step === "invoice" || d.step === "paid") by.set(d.party, (by.get(d.party) ?? 0) + d.amount);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const why = f.report.ok ? "報表裡沒有前十大。" : `完整排名要看報表（${f.report.message.replace(/。$/, "")}）。`;
  if (!rows.length) return base("top_customers", { text: `${why}最近開過的發票裡也沒有資料。`, gap: { reason: "missing", message: why } });
  return base("top_customers", {
    text: `${why}只看最近開過的發票，金額最大的是 ${rows[0][0]}，${fmt(rows[0][1])}（未稅）。`,
    rows: rows.slice(0, 5).map(([party, amount], i) => ({ label: `${i + 1}. ${party}`, amount })),
    source: from(f, "最近三個月的銷項發票（最多 30 張），不是完整排名", "練習帳本的發票，不是完整排名"),
    link: { href: "/workspace/erp/sales", label: "到銷售看單據" },
    follow: keep([`${rows[0][0]} 最近怎樣？`, "誰欠我們最多？"], f),
  });
}

function unpaidBills(f: AssistantFacts) {
  return f.purchases.ok ? f.purchases.data.docs.filter((d) => d.status === "待付款" || d.status === "已進貨待付款") : [];
}

function payables({ f }: Ctx): Answer {
  const ap = f.money.ok ? f.money.data.ap : null;
  const bills = unpaidBills(f).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  if (!f.purchases.ok && ap === null) return missing("payables", f.purchases);
  const listed = sum(bills, (b) => b.amount);
  const total = ap ?? listed;
  const link = { href: "/workspace/erp/purchase", label: "到採購付款" };
  if (!total && !bills.length) return base("payables", { text: "沒有要付廠商的錢。", source: from(f, "進項發票還沒付的金額", "練習帳本的採購"), link, follow: keep(["誰欠我們最多？", "現金夠不夠撐？"], f) });
  const lateBills = bills.filter((b) => b.due && b.due < f.today);
  const soon = bills.find((b) => b.due && b.due >= f.today);
  const biggest = [...bills].sort((a, b) => b.amount - a.amount)[0];
  const partial = ap !== null && bills.length > 0 && Math.round(ap) !== Math.round(listed);
  return base("payables", {
    text: `${partial ? `要付廠商的總共 ${fmt(total)}；下面列出的 ${bills.length} 筆合計 ${fmt(listed)}。` : `要付廠商的還有 ${fmt(total)}${bills.length ? `，${bills.length} 筆` : ""}。`}${lateBills.length ? `${lateBills.length} 筆已經過了付款日。` : ""}${soon?.due ? `下一筆是 ${md(soon.due)} 付 ${soon.vendor} ${fmt(soon.amount)}。` : biggest ? `最大的一筆是 ${biggest.vendor} ${fmt(biggest.amount)}。` : ""}`,
    figures: [{ label: "要付廠商", amount: total }, ...(lateBills.length ? [{ label: "過了付款日", amount: sum(lateBills, (b) => b.amount), tone: "danger" as const }] : [])],
    rows: bills.slice(0, 6).map((b) => ({ label: b.vendor, amount: b.amount, detail: [b.no, b.due ? `${md(b.due)} 到期` : b.status].join(" · "), tone: b.due && b.due < f.today ? ("danger" as const) : undefined, href: b.href })),
    source: from(f, ap !== null ? "應付帳款（進項發票還沒付的金額）" : "進項發票還沒付的金額", "練習帳本的採購，和「採購」頁同一份"),
    link,
    follow: keep(["現金夠不夠撐？", "誰欠我們最多？", "什麼貨快沒了？"], f),
  });
}

function cash({ f }: Ctx): Answer {
  if (!f.money.ok) return missing("cash", f.money);
  const m = f.money.data;
  if (m.cash === null) return hiddenGap("cash", "現金與銀行餘額");
  const bills = unpaidBills(f);
  const dated = bills.filter((b) => b.due);
  const horizon = addDays(f.today, 30);
  const due30 = dated.length ? sum(dated.filter((b) => b.due! <= horizon), (b) => b.amount) : null;
  const pay = due30 ?? m.ap;
  const overdueIn = f.aging.ok ? sum(f.aging.data, late) : null;
  if (pay === null) {
    return base("cash", {
      text: `帳上現金與銀行 ${fmt(m.cash)}。你看不到應付帳款，所以沒辦法算夠不夠。`,
      figures: [{ label: "現金與銀行", amount: m.cash }],
      source: from(f, "現金與銀行科目的餘額"),
      link: { href: "/workspace/erp/finance", label: "到收錢看" },
    });
  }
  const left = m.cash - pay;
  const payLabel = due30 !== null ? "30 天內要付廠商" : "要付廠商（全部）";
  const text =
    left >= 0
      ? `夠。帳上現金與銀行 ${fmt(m.cash)}，${payLabel} ${fmt(pay)}，付完還剩 ${fmt(left)}。`
      : `不太夠。帳上現金與銀行 ${fmt(m.cash)}，${payLabel} ${fmt(pay)}，差 ${fmt(-left)}。${overdueIn ? `先把逾期的 ${fmt(overdueIn)} 收回來${overdueIn >= -left ? "就補得上" : "也還不夠"}。` : ""}`;
  return base("cash", {
    text: text + "薪水、房租這類還沒入帳的支出沒算進去。",
    figures: [
      { label: "現金與銀行", amount: m.cash },
      { label: payLabel, amount: pay },
      { label: "付完剩", amount: left, tone: left < 0 ? "danger" : "ok" },
      ...(m.ar !== null ? [{ label: "客人還欠我們", amount: m.ar }] : []),
    ],
    source: from(f, `現金與銀行科目的餘額、${due30 !== null ? "30 天內到期的進項發票" : "應付帳款"}${m.ar !== null ? "、應收帳款" : ""}`, "練習帳本的現金、應付與應收，和「收錢」頁同一份"),
    link: { href: "/workspace/erp/finance", label: "到收錢看" },
    follow: keep(["誰欠我們最多？", "待付廠商多少？", "這個月營收多少？"], f),
  });
}

function purchases({ f }: Ctx): Answer {
  if (!f.purchases.ok) return missing("purchases", f.purchases);
  if (f.purchases.data.hidden.includes("Purchase Order")) return hiddenGap("purchases", "採購單");
  const open = f.purchases.data.docs.filter((d) => d.status !== "已付款" && d.status !== "待付款" && d.status !== "已進貨待付款");
  const link = { href: "/workspace/erp/purchase", label: "到採購看" };
  const src = from(f, "送出、還沒到貨或還沒請款的採購單", "練習帳本的採購，和「採購」頁同一份");
  if (!open.length) return base("purchases", { text: "沒有還在路上的進貨。", source: src, link, follow: keep(["什麼貨快沒了？", "待付廠商多少？"], f) });
  return base("purchases", {
    text: `${open.length} 筆進貨還沒完成，合計 ${fmt(sum(open, (d) => d.amount))}。最近一筆是 ${open[0].vendor}（${open[0].status}）。`,
    rows: open.slice(0, 6).map((d) => ({ label: d.vendor, amount: d.amount, detail: `${d.no} · ${d.status} · 下一步：${d.next}`, href: d.href })),
    source: src,
    link,
    follow: keep(["什麼貨快沒了？", "待付廠商多少？", "現金夠不夠撐？"], f),
  });
}

function leads({ f }: Ctx): Answer {
  if (!f.people.ok) return missing("leads", f.people);
  const list = f.people.data.filter((x) => x.stage !== "客人");
  const link = { href: "/workspace/crm", label: "到客人頁跟進" };
  const src = from(f, "還沒成交的詢問（Lead），最近有動的在前", "練習的客人名單，和「客人」頁同一份");
  if (!list.length) return base("leads", { text: "沒有還在跟的詢問。", source: src, link, follow: keep(["最大的客人是誰？"], f) });
  const hottest = f.mode === "demo" ? [...list].sort((a, b) => b.score - a.score)[0] : list[0];
  return base("leads", {
    text: `${list.length} 位還在跟。${f.mode === "demo" ? "最有機會的" : "最近有動的"}是 ${hottest.name}（${stageName(hottest.stage)}${hottest.channel ? `，從 ${hottest.channel} 來` : ""}）。`,
    rows: list.slice(0, 6).map((x) => ({ label: x.name, detail: [stageName(x.stage), x.channel].filter(Boolean).join(" · "), href: x.href })),
    source: src,
    link,
    follow: keep([`${hottest.name} 最近怎樣？`, "哪張報價卡住最久？"], f),
  });
}

function vat({ f }: Ctx): Answer {
  if (!f.money.ok) return missing("vat", f.money);
  const v = f.money.data.vatPayable;
  if (v === null) return hiddenGap("vat", "營業稅");
  return base("vat", {
    text: v >= 0 ? `這個月的營業稅大約 ${fmt(v)}（銷項稅額減進項稅額）。營業稅兩個月申報一次，要把兩個月加起來。` : `這個月進項稅額比銷項多 ${fmt(-v)}，可以留抵。營業稅兩個月申報一次。`,
    figures: [{ label: "本月銷項減進項", amount: v }],
    source: from(f, "這個月送出的銷項與進項發票的稅額", "練習帳本，和「收錢」頁同一份"),
    link: { href: "/workspace/erp/finance", label: "到收錢看" },
    follow: keep(["這個月營收多少？", "現金夠不夠撐？"], f),
  });
}

function einvoice({ f }: Ctx): Answer {
  if (!f.money.ok) return missing("einvoice", f.money);
  const list = f.money.data.einvoices;
  if (list === null) return hiddenGap("einvoice", "電子發票");
  const failed = list.filter((e) => e.status === "失敗");
  const waiting = list.filter((e) => e.status !== "失敗" && e.status !== "已上傳");
  const link = { href: "/workspace/erp/finance", label: "到收錢看發票" };
  const src = from(f, "最近 30 張有電子發票狀態的銷項發票", "練習帳本的電子發票");
  return base("einvoice", {
    text: failed.length ? `${failed.length} 張電子發票沒開成，第一張是 ${failed[0].no}：${failed[0].error || "打開看原因"}。` : waiting.length ? `沒有失敗的；${waiting.length} 張還在等上傳。` : "電子發票都上傳了，沒有失敗的。",
    rows: [...failed, ...waiting].slice(0, 6).map((e) => ({ label: e.no, amount: e.amount, detail: `${e.status} · ${e.related}${e.error ? ` · ${e.error}` : ""}`, tone: e.status === "失敗" ? ("danger" as const) : undefined, href: e.href })),
    source: src,
    link,
    follow: keep(["這個月營收多少？", "營業稅大概多少？"], f),
  });
}

function capabilities({ f }: Ctx): Answer {
  const groups: [string, IntentId, string][] = [
    ["收錢", "receivables", "誰欠我們最多？逾期多少？"],
    ["營收", "revenue", "這個月營收多少？跟上個月比呢？毛利多少？"],
    ["庫存", "low_stock", "什麼貨快沒了？有哪些進貨還沒到？"],
    ["銷售", "quotes", "哪張報價卡住最久？有哪些訂單還沒出貨？"],
    ["人事", "leave", "今天誰請假？有假單等我核准嗎？"],
    ["每天", "agenda", "今天要做什麼？這週要做什麼？"],
    ["客人", "customer", "某位客人最近怎樣？最大的客人是誰？"],
    ["付錢", "cash", "待付廠商多少？現金夠不夠撐？"],
    ["幫我寫", "draft_reply", "催款訊息、報價追蹤、回客人的問題"],
  ];
  const can = groups.filter(([, id]) => canAnswer(id, f));
  const cannot = groups.filter(([, id]) => !canAnswer(id, f)).map(([g]) => g);
  return base("capabilities", {
    text: `用平常講話的方式問就好。數字都從${f.mode === "demo" ? "練習帳本" : "你們的 ERPNext"}算出來，每個答案下面會寫從哪來。${cannot.length ? `你的職務或公司沒開的：${cannot.join("、")}，問了會告訴你去哪裡打開。` : ""}`,
    rows: can.map(([g, , ex]) => ({ label: g, detail: ex })),
    follow: starterQuestions(f).slice(0, 3),
    link: { href: "/help/assistant", label: "看問助理的說明" },
  });
}

// ---------------------------------------------------------------------------
// Drafts. Templates only: every number and date comes from the facts.

function opener(f: AssistantFacts) {
  if (f.company && f.me) return `我是${f.company}的${f.me}。`;
  if (f.company) return `這邊是${f.company}。`;
  if (f.me) return `我是${f.me}。`;
  return "";
}

function signoff(f: AssistantFacts) {
  return [f.company, f.me].filter(Boolean).join(" ") || "";
}

export function reminderDraft(f: AssistantFacts, row: AgingRow): Draft {
  const invoices = f.sales.ok ? f.sales.data.docs.filter((d) => d.party === row.party && d.step === "invoice" && (d.overdueDays ?? 0) > 0) : [];
  const nos = invoices.map((d) => d.invoiceNo || d.no).slice(0, 4);
  const oldestDue = invoices.map((d) => d.due).filter(Boolean).sort()[0];
  const total = owed(row);
  const overdueAmt = late(row);
  const lines = [
    `${row.party} 您好，`,
    `${opener(f)}想跟您確認一下，我們帳上目前還有 ${fmt(total)} 尚未收到${overdueAmt && overdueAmt !== total ? `，其中 ${fmt(overdueAmt)} 已經超過付款期限` : overdueAmt ? "，已經超過付款期限" : ""}${oldestDue ? `（最早一筆 ${md(oldestDue)} 到期）` : ""}。`,
    nos.length ? `相關發票：${nos.join("、")}。` : "",
    "不知道是不是已經安排付款了？如果已經匯款，再麻煩告訴我匯款日期和帳號後五碼，我這邊好對帳；如果金額或發票有任何問題，也歡迎直接跟我說。",
    "謝謝您，祝 順心！",
    signoff(f),
  ].filter(Boolean);
  return {
    kind: "reminder",
    title: `催款訊息給 ${row.party}`,
    to: row.party,
    text: lines.join("\n"),
    facts: { customer: row.party, owed: fmt(total), ...(overdueAmt ? { overdue: fmt(overdueAmt) } : {}), ...(nos.length ? { invoices: nos.join("、") } : {}), ...(oldestDue ? { due: md(oldestDue) } : {}) },
  };
}

export function quoteDraft(f: AssistantFacts, q: SalesDoc): Draft {
  const lines = [
    `${q.party} 您好，`,
    `${opener(f)}${q.date ? `${md(q.date)} ` : "之前"}提供給您的報價（${q.no}，未稅 ${fmt(q.amount)}）不知道您看過了嗎？`,
    `如果規格、數量或交期需要調整，跟我說一聲，我馬上幫您改。${q.due ? `這份報價有效到 ${md(q.due)}。` : ""}`,
    "再麻煩您有空時回覆，謝謝！",
    signoff(f),
  ].filter(Boolean);
  return {
    kind: "quote",
    title: `報價追蹤給 ${q.party}`,
    to: q.party,
    text: lines.join("\n"),
    facts: { customer: q.party, quote: q.no, amount: fmt(q.amount), ...(q.date ? { sent: md(q.date) } : {}), ...(q.due ? { valid_till: md(q.due) } : {}) },
  };
}

export function replyDraft(f: AssistantFacts, name: string | null): Draft {
  const who = name ?? "（客人名字）";
  const docs = name && f.sales.ok ? f.sales.data.docs.filter((d) => d.party === name && d.step !== "paid") : [];
  const order = docs.find((d) => d.step === "order" || d.step === "fulfill");
  const bill = docs.find((d) => d.step === "invoice");
  const facts: Record<string, string> = { customer: who };
  const body: string[] = [];
  if (order) {
    body.push(`您的訂單 ${order.no} 目前${order.step === "order" ? `正在準備，還沒${f.fulfillment}` : `已經${f.fulfillment}完成`}${order.step === "order" && order.due ? `，預計 ${md(order.due)} 交給您` : ""}。`);
    facts.order = order.no;
    if (order.due) facts.delivery = md(order.due);
  }
  if (bill) {
    body.push(`帳上還有一筆 ${fmt(bill.amount + bill.tax)}（含稅，${bill.invoiceNo || bill.no}）${bill.due ? `，付款期限是 ${md(bill.due)}` : ""}。`);
    facts.invoice = bill.invoiceNo || bill.no;
    facts.amount = fmt(bill.amount + bill.tax);
  }
  if (!body.length) body.push("您問的事我們已經收到，確認好之後馬上回覆您。");
  const lines = [`${who} 您好，謝謝您的詢問！`, opener(f), ...body, "還有任何問題都可以直接回覆這則訊息，我們會盡快處理。謝謝您！", signoff(f)].filter(Boolean);
  return { kind: "reply", title: name ? `回覆 ${name}` : "回覆客人", to: who, text: lines.join("\n"), facts };
}

function draftReminder({ f, p }: Ctx): Answer {
  if (!f.aging.ok) return missing("draft_reminder", f.aging);
  const rows = f.aging.data.filter((r) => owed(r) > 0);
  const named = p.name ? rows.find((r) => r.party === p.name) : undefined;
  if (p.name && !named) return base("draft_reminder", { name: p.name, text: `${p.name} 沒有欠款，不用催。`, source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO), follow: keep(["誰欠我們最多？", `幫我回${p.name}的問題`], f) });
  const row = named ?? [...rows].sort((a, b) => late(b) - late(a) || owed(b) - owed(a))[0];
  if (!row) return base("draft_reminder", { text: "沒有人欠款，不用催。", source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO), follow: keep(["這個月營收多少？"], f) });
  const d = reminderDraft(f, row);
  return base("draft_reminder", {
    name: row.party,
    text: `幫你寫好給 ${row.party} 的催款訊息${named ? "" : "（逾期最多的一位）"}，金額和發票號碼都是帳上的。看過再送出。`,
    drafts: [d],
    figures: [{ label: "還沒收", amount: owed(row) }, { label: "已經逾期", amount: late(row), tone: late(row) ? "warn" : "ok" }],
    source: from(f, AGING_SOURCE_LIVE, AGING_SOURCE_DEMO),
    link: { href: "/workspace/erp/finance#aging", label: "到收錢看帳齡" },
    follow: keep([`${row.party} 最近怎樣？`, "誰欠我們最多？"], f),
  });
}

function draftQuote({ f, p }: Ctx): Answer {
  if (!f.sales.ok) return missing("draft_quote", f.sales);
  const list = f.sales.data.docs.filter((d) => d.step === "quote").sort((a, b) => (quoteAge(b, f.today) ?? -1) - (quoteAge(a, f.today) ?? -1));
  const named = p.name ? list.find((d) => d.party === p.name) : undefined;
  if (p.name && !named) return base("draft_quote", { name: p.name, text: `${p.name} 沒有等回覆的報價。`, follow: keep(["哪張報價卡住最久？", `幫我回${p.name}的問題`], f) });
  const q = named ?? list[0];
  if (!q) return base("draft_quote", { text: "現在沒有等回覆的報價。", follow: keep(["有哪些訂單還沒出貨？"], f) });
  return base("draft_quote", {
    name: q.party,
    text: `幫你寫好給 ${q.party} 的報價追蹤${named ? "" : "（等最久的一張）"}。看過再送出。`,
    drafts: [quoteDraft(f, q)],
    source: from(f, "送出、還沒成交的報價單", "練習帳本的報價"),
    link: { href: "/workspace/erp/sales", label: "到銷售看報價" },
    follow: keep(["哪張報價卡住最久？", `${q.party} 最近怎樣？`], f),
  });
}

function draftReply({ f, p }: Ctx): Answer {
  const d = replyDraft(f, p.name);
  return base("draft_reply", {
    name: p.name,
    text: p.name ? `幫你寫好回 ${p.name} 的訊息${Object.keys(d.facts).length > 1 ? "，訂單和帳款是帳上的" : ""}。看過、補上他問的細節再送出。` : "幫你寫好一段回客人的開頭。把「（客人名字）」換掉，或在問題裡加上客人名字，我會把他的訂單和帳款帶進來。",
    drafts: [d],
    source: Object.keys(d.facts).length > 1 ? from(f, "這位客人的訂單與發票", "練習帳本的單據") : null,
    follow: keep(p.name ? [`${p.name} 最近怎樣？`, `幫我寫催款訊息給${p.name}`] : ["幫我寫催款訊息", "幫我寫報價追蹤"], f),
  });
}

const HANDLERS: Record<IntentId, (ctx: Ctx) => Answer> = {
  receivables,
  overdue,
  revenue,
  revenue_compare: revenueCompare,
  margin,
  low_stock: lowStock,
  quotes,
  orders,
  leave,
  approvals,
  payroll,
  agenda,
  customer,
  top_customers: topCustomers,
  payables,
  cash,
  purchases,
  leads,
  vat,
  einvoice,
  draft_reminder: draftReminder,
  draft_quote: draftQuote,
  draft_reply: draftReply,
  capabilities,
};

export function notUnderstood(f: AssistantFacts): Answer {
  return base(null, { understood: false, text: "這題我還聽不懂。換個說法，或點下面的問題試試。", follow: starterQuestions(f).slice(0, 4) });
}

/**
 * `hint` is what the AI classifier suggested for a question the rules missed.
 * It can only pick an intent, a period and a name the facts already contain.
 */
export function answer(text: string, f: AssistantFacts, hint?: Partial<Parsed>): Answer {
  const parsed = parseQuestion(text, f);
  if (hint?.intent && INTENTS.includes(hint.intent)) parsed.intent = hint.intent;
  if (hint?.period && PERIODS.includes(hint.period)) parsed.period = parsed.period ?? hint.period;
  if (hint?.name && !parsed.name) parsed.name = findName(normalize(hint.name), f);
  if (!parsed.intent) return notUnderstood(f);
  const result = HANDLERS[parsed.intent]({ f, p: parsed, text });
  return { ...result, name: result.name ?? parsed.name };
}
