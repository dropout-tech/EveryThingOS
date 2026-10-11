import "server-only";
import { canSeeReports, featuresFor } from "./access";
import type { AssistantFacts, Gap, MoneyFacts, Slot } from "./assistant";
import type { Books } from "./erp";
import type { FeatureId } from "./shop";
import { getBooks, getHr, getMe, getPeople, isLive } from "./sources";
import { liveConfig, loginRequired } from "./sources/config";
import { getReports } from "./sources/reports";
import type { HrToday, Sourced } from "./sources/types";
import { currentIndustry, currentShop } from "./workspace";

const LABEL: Partial<Record<FeatureId, string>> = { finance: "收錢", sales: "銷售", stock: "庫存", purchase: "採購", crm: "客人", hr: "人事" };
const HELP: Partial<Record<FeatureId, string>> = { finance: "module-finance", sales: "module-sales", stock: "module-stock", purchase: "module-purchase", crm: "module-crm", hr: "module-hr" };
const ROLES_FIX = { href: "/help/roles", label: "看職務與權限" };

type No = { ok: false } & Gap;

function off(id: FeatureId): No {
  return { ok: false, reason: "off", message: `這家公司沒有開「${LABEL[id]}」，所以這題答不了。`, fix: { href: `/help/${HELP[id]}`, label: `看「${LABEL[id]}」能做什麼` } };
}

function role(id: FeatureId): No {
  return { ok: false, reason: "role", message: `你的職務看不到「${LABEL[id]}」，所以這題答不了。需要的話請老闆到「團隊」調整你的職務。`, fix: ROLES_FIX };
}

function failed(source: Extract<Sourced<unknown>, { origin: "error" }>): No {
  if (source.kind === "login") return { ok: false, reason: "error", message: "登入過期了，重新登入後再問一次。", fix: { href: "/api/auth/login?next=/workspace/ask", label: "重新登入" } };
  if (source.kind === "denied") return { ok: false, reason: "role", message: `你的 ERPNext 角色不能看這份資料（${source.message}）。`, fix: ROLES_FIX };
  return { ok: false, reason: "error", message: `現在拿不到 ERPNext 的資料：${source.message}。不會改用示範數字。`, fix: { href: "/workspace/settings#sync", label: "看連線狀態" } };
}

function deniedRead(what: string): No {
  return { ok: false, reason: "role", message: `你的 ERPNext 角色看不到${what}。`, fix: ROLES_FIX };
}

function taipeiDay(offset = 0) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offset * 86_400_000));
}

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** The practice books have no dates; give each document a fixed, plausible one so 「卡最久」 and 「這週」 have something to read. */
function datedPractice(books: Books): Books {
  const shift = (days: number) => taipeiDay(days);
  return {
    ...books,
    sales: books.sales.map((d) => {
      const h = hash(d.no);
      if (d.step === "quote") return { ...d, date: shift(-(4 + (h % 12))), due: shift(3 + (h % 10)) };
      if (d.step === "order") return { ...d, date: shift(-3), due: shift(1 + (h % 5)) };
      if (d.step === "fulfill") return { ...d, date: shift(-8) };
      if (d.step === "invoice") return { ...d, date: shift(-(30 + (d.overdueDays ?? 0))), due: shift(-(d.overdueDays ?? 0)) };
      return { ...d, date: shift(-20) };
    }),
    purchases: books.purchases.map((p) => (p.status === "待付款" || p.status === "已進貨待付款" ? { ...p, due: shift(5) } : p)),
  };
}

/** Same sample team as the 人事 page in practice mode (app/workspace/hr/page.tsx). */
function practiceHr(): HrToday {
  const today = taipeiDay();
  return {
    date: today,
    me: { employee: "HR-EMP-00001", name: "王小明", logs: [{ type: "IN", time: "08:56" }], next: "OUT" },
    onLeave: [
      { name: "林業務", leaveType: "特休", fromDate: today, toDate: taipeiDay(1), halfDay: false },
      { name: "陳倉管", leaveType: "病假", fromDate: today, toDate: today, halfDay: true },
    ],
    approvals: [
      { name: "HR-LAP-2026-00012", employee: "張會計", leaveType: "事假", fromDate: taipeiDay(2), toDate: taipeiDay(2), days: 1, reason: "小孩學校日" },
      { name: "HR-LAP-2026-00013", employee: "李師傅", leaveType: "家庭照顧假", fromDate: taipeiDay(5), toDate: taipeiDay(6), days: 2, reason: "家人開刀住院" },
    ],
    payroll: { month: today.slice(0, 7), state: "slips", employees: 8, draft: 8, submitted: 0, netPay: 312_480, entries: [] },
    rates: { year: Number(today.slice(0, 4)), verified: false, current: true },
    can: { approve: true, payroll: true },
  };
}

export type AssistantSetup = { facts: AssistantFacts; ai: boolean; packId: string };

/**
 * Everything 問助理 may read for this person. A part is only loaded when the
 * menu would show its page to them, and ERPNext still filters every read by
 * their own roles, so the assistant never sees more than the pages do.
 */
export async function assistantSetup(): Promise<AssistantSetup> {
  const [pack, shop, config] = await Promise.all([currentIndustry(), currentShop(), liveConfig()]);
  const today = taipeiDay();
  let roles: string[] | null = null;
  let me: string | undefined;
  let company = config.tenant?.company;
  if (config.erpnext) {
    const who = await getMe();
    const personal = loginRequired(config);
    if (who.origin === "live" && who.data) {
      company = company ?? (who.data.company || undefined);
      // With a shared integration key whoami is the integration user, not the person typing.
      if (personal) {
        me = who.data.fullName || undefined;
        roles = who.data.roles;
      }
    } else if (personal) roles = [];
  }
  const modules = shop?.modules ?? [];
  const allowed = new Set(featuresFor(modules, roles));
  const access = (id: FeatureId): No | null => (allowed.has(id) ? null : modules.includes(id) ? role(id) : off(id));

  const bookIds: FeatureId[] = ["sales", "finance", "stock", "purchase"];
  const needBooks = bookIds.some((id) => allowed.has(id));
  const [books, people, hr, report] = await Promise.all([
    needBooks ? getBooks(pack) : null,
    allowed.has("crm") ? getPeople(pack) : null,
    allowed.has("hr") ? getHr() : null,
    canSeeReports(roles) ? getReports(pack, 12) : null,
  ]);

  const bookFail = books?.origin === "error" ? failed(books) : null;
  const data = books && books.origin !== "error" ? (books.origin === "demo" ? datedPractice(books.data) : books.data) : null;
  const denied = new Set(books && books.origin === "live" ? (books.denied ?? []) : []);
  const fromBooks = <T,>(id: FeatureId, pick: (b: Books) => Slot<T>): Slot<T> => access(id) ?? bookFail ?? (data ? pick(data) : off(id));
  const nullIf = (key: string, value: number) => (denied.has(key) ? null : value);

  const money = fromBooks<MoneyFacts>("finance", (b) => ({
    ok: true,
    data: {
      monthSales: nullIf("month_sales", b.monthSales),
      monthCost: nullIf("month_cost", b.monthCost),
      grossProfit: books?.origin === "demo" ? (b.pnl.find((r) => r.label === "毛利")?.amount ?? null) : null,
      cash: nullIf("cash", b.cash),
      ar: nullIf("ar", b.ar),
      ap: nullIf("ap", b.ap),
      vatPayable: nullIf("vat_payable", b.vatPayable),
      einvoices: denied.has("einvoices") ? null : b.einvoices,
    },
  }));

  const hrSlot: Slot<HrToday> =
    access("hr") ??
    (hr === null
      ? off("hr")
      : hr.origin === "error"
        ? failed(hr)
        : hr.origin === "demo"
          ? { ok: true, data: practiceHr() }
          : hr.data
            ? { ok: true, data: hr.data }
            : { ok: false, reason: "missing", message: "這家公司的 ERPNext 還沒裝人事模組，所以看不到請假與薪資。", fix: { href: "/help/module-hr", label: "看人事要怎麼開" } });

  const facts: AssistantFacts = {
    mode: config.erpnext ? "live" : "demo",
    today,
    company,
    me,
    fulfillment: pack.modules.erp.inventory ? "出貨" : pack.fulfillment,
    money,
    aging: fromBooks("finance", (b) => (denied.has("ar_aging") ? deniedRead("帳齡") : { ok: true, data: b.arAging })),
    sales: fromBooks("sales", (b) => ({ ok: true, data: { docs: b.sales, hidden: ["Quotation", "Sales Order", "Sales Invoice"].filter((d) => denied.has(d)) } })),
    stock: fromBooks("stock", (b) => (denied.has("stock") ? deniedRead("庫存") : { ok: true, data: b.stock })),
    purchases: fromBooks("purchase", (b) => ({ ok: true, data: { docs: b.purchases, hidden: ["Purchase Order", "Purchase Invoice"].filter((d) => denied.has(d)) } })),
    people: access("crm") ?? (people === null ? off("crm") : people.origin === "error" ? failed(people) : { ok: true, data: people.data }),
    hr: hrSlot,
    report:
      report === null
        ? { ok: false, reason: "role", message: "報表只有老闆、主管、會計看得到。", fix: ROLES_FIX }
        : report.origin === "error"
          ? failed(report)
          : { ok: true, data: report.data },
    todo: !needBooks ? { ok: false, reason: "off", message: "你的選單裡沒有生意相關的頁面，所以沒有待辦。" } : (bookFail ?? (data ? { ok: true, data: data.today } : { ok: false, reason: "missing", message: "沒有待辦資料。" })),
    chatHref: allowed.has("chat") ? ((await isLive("chatwoot")) ? "/api/chat/open" : "/workspace/chat") : null,
  };
  return { facts, ai: Boolean(config.glue), packId: pack.id };
}
