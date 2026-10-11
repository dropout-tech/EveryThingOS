import { practiceCast } from "./practice";
import type { IndustryPack } from "./types";

/**
 * 簽核與報帳. Shared by the page, the board and the API routes: the shapes,
 * the demo data and the checks a new expense must pass. ERPNext checks the
 * same rules again in `dropout_core.approvals`.
 */
export type ApprovalKind = "expense" | "leave" | "purchase" | "quote" | "other";

export type ApprovalAction = { action: string; kind: "approve" | "reject" };

/** `src` is set for images the browser may show: the receipt proxy in live mode, a data URL in practice. */
export type Attachment = { id: string; name: string; image: boolean; src?: string };

export type ApprovalItem = {
  doctype: string;
  name: string;
  kind: ApprovalKind;
  requester: string;
  party?: string | null;
  title: string;
  amount: number | null;
  days?: number;
  dates?: string;
  discount?: number;
  reason?: string;
  /** "YYYY-MM-DD HH:mm:ss" in Taipei time, or empty when ERPNext does not say (leave). */
  created: string;
  state?: string | null;
  href?: string;
  actions: ApprovalAction[];
  attachments: Attachment[];
};

export type SentItem = {
  doctype: string;
  name: string;
  kind: ApprovalKind;
  title: string;
  amount: number | null;
  days?: number;
  status: string;
  tone: "ok" | "warn" | "danger";
  note?: string;
  created: string;
  href?: string;
  attachments?: Attachment[];
};

export type RuleId = "purchase" | "quote";

export type ApprovalRule = { id: RuleId; doctype: string; active: boolean; other: string | null; threshold: number; approver: string };

export type Approvals = {
  items: ApprovalItem[];
  mine: SentItem[];
  rules: ApprovalRule[];
  /** Expense Claim needs Frappe HRMS. */
  hrms: boolean;
  employee: string | null;
  can: { approve: boolean; file: boolean; configure: boolean };
  /** Sections that could not be read this time (e.g. 假單). */
  unavailable: string[];
  denied: string[];
};

export const KIND_LABEL: Record<ApprovalKind, string> = { expense: "報帳", leave: "假單", purchase: "採購", quote: "報價", other: "其他" };

export const EXPENSE_CATEGORIES = ["交通", "餐費", "住宿", "文具", "郵資", "其他"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const RULE_LABEL: Record<RuleId, { title: string; unit: "NT$" | "%"; plain: (n: number) => string }> = {
  purchase: { title: "大額採購", unit: "NT$", plain: (n) => `採購單超過 NT$${n.toLocaleString("en-US")} 要主管核准` },
  quote: { title: "大折扣報價", unit: "%", plain: (n) => `報價折扣超過 ${n}% 要業務主管核准` },
};

/** At or under this, an expense or purchase can be approved together with others in one tap. */
export const SMALL_AMOUNT = 5000;
export const BULK_LIMIT = 20;
export const MAX_AMOUNT = 1_000_000;
export const MAX_NOTE = 500;
export const MAX_REASON = 500;
export const OLDEST_DAYS = 365;
/** After the browser shrinks the photo. */
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
/** What the phone hands us before shrinking. */
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

export function itemKey(item: { doctype: string; name: string }) {
  return `${item.doctype}:${item.name}`;
}

export function approveAction(item: ApprovalItem) {
  return item.actions.find((a) => a.kind === "approve");
}

export function rejectAction(item: ApprovalItem) {
  return item.actions.find((a) => a.kind === "reject");
}

/** Small enough to approve in a batch: little money, or a leave of a day or less. Discounted quotes always get a look. */
export function isSmall(item: ApprovalItem) {
  if (!approveAction(item)) return false;
  if (item.kind === "leave") return (item.days ?? Infinity) <= 1;
  if (item.kind === "quote") return false;
  return item.amount !== null && item.amount <= SMALL_AMOUNT;
}

export function taipeiDay(offsetDays = 0, from = Date.now()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(from + offsetDays * 86_400_000));
}

function taipeiStamp(ms: number) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(ms));
}

/** ERPNext stores Taipei wall-clock time without a zone. */
export function parseTaipei(stamp: string) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(stamp);
  return m ? Date.parse(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+08:00`) : NaN;
}

export function ageLabel(stamp: string, now: number) {
  const at = parseTaipei(stamp);
  if (Number.isNaN(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 2) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** Waiting longer than a day is worth a colour. */
export function isStale(stamp: string, now: number) {
  const at = parseTaipei(stamp);
  return !Number.isNaN(at) && now - at > 86_400_000;
}

export type ExpenseInput = { amount: string; date: string; category: string; note: string; hasReceipt: boolean };
export type ExpenseErrors = Partial<Record<"amount" | "date" | "category" | "note", string>>;

export function parseAmount(raw: string) {
  const text = raw.replace(/[,\s，]/g, "").replace(/^NT\$/i, "");
  return /^\d{1,7}(\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
}

/** Same rules as `dropout_core.approvals.new_expense`; `today` is Taipei's date. */
export function expenseErrors(input: ExpenseInput, today: string): ExpenseErrors {
  const errors: ExpenseErrors = {};
  const amount = parseAmount(input.amount);
  if (!input.amount.trim() || Number.isNaN(amount) || amount <= 0) errors.amount = "請填金額，要大於 0。";
  else if (amount > MAX_AMOUNT) errors.amount = "超過 100 萬的請直接找會計。";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) errors.date = "請選日期。";
  else if (input.date > today) errors.date = "日期不能是未來。";
  else if (input.date < taipeiDay(-OLDEST_DAYS, Date.parse(`${today}T12:00:00+08:00`))) errors.date = "超過一年的單據請直接找會計。";
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) errors.category = "請選分類。";
  if (input.note.length > MAX_NOTE) errors.note = `備註最多 ${MAX_NOTE} 字。`;
  else if (!input.hasReceipt && !input.note.trim()) errors.note = "沒有收據的話，請寫一下原因。";
  return errors;
}

/** First bytes of a JPEG, PNG, WebP or GIF; anything else is not a receipt photo. */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 4)) === "GIF8") return "image/gif";
  return null;
}

const VENDORS = ["中盤供應", "原廠台灣", "包材行", "物流夥伴"];

export function demoApprovals(pack: IndustryPack, now = Date.now()): Approvals {
  const cast = practiceCast(pack.id);
  const ago = (hours: number) => taipeiStamp(now - hours * 3_600_000);
  const day = (offset: number) => taipeiDay(offset, now).slice(5);
  const decide = (approve = "approve", reject = "reject"): ApprovalAction[] => [
    { action: approve, kind: "approve" },
    { action: reject, kind: "reject" },
  ];
  const receipt = (id: string, name: string): Attachment[] => [{ id, name, image: true }];
  const items: ApprovalItem[] = [
    { doctype: "Purchase Order", name: "PUR-ORD-2026-00031", kind: "purchase", requester: cast[3], party: VENDORS[0], title: `主力${pack.itemType} 補貨 等 3 項`, amount: 86_500, reason: "下個月檔期要用，廠商說月底前下單有九五折。", created: ago(26), state: "待核准", actions: decide("核准", "退回"), attachments: [{ id: "demo-po", name: "廠商報價單.pdf", image: false }] },
    { doctype: "Expense Claim", name: "HR-EXP-2026-00118", kind: "expense", requester: cast[1], title: "交通", amount: 1_240, reason: "到客戶那邊開會，高鐵來回。", created: ago(3), actions: decide(), attachments: receipt("demo-r1", "高鐵票.jpg") },
    { doctype: "Leave Application", name: "HR-LAP-2026-00012", kind: "leave", requester: cast[2], title: "事假", amount: null, days: 1, dates: day(2), reason: "小孩學校日。", created: "", actions: decide(), attachments: [] },
    { doctype: "Expense Claim", name: "HR-EXP-2026-00117", kind: "expense", requester: cast[4], title: "餐費", amount: 860, reason: "請廠商吃午餐，談明年合約。", created: ago(28), actions: decide(), attachments: receipt("demo-r2", "發票.jpg") },
    { doctype: "Quotation", name: "SAL-QTN-2026-00412", kind: "quote", requester: cast[0], party: cast[5], title: `${pack.itemType} 年約`, amount: 48_000, discount: 18, reason: "折扣 18%：老客人一次訂三批，對方說別家給到八折。", created: ago(44), state: "待核准", actions: decide("核准", "退回"), attachments: [] },
    { doctype: "Expense Claim", name: "HR-EXP-2026-00115", kind: "expense", requester: cast[6], title: "住宿", amount: 3_200, reason: "南部出差兩天，住台南。", created: ago(50), actions: decide(), attachments: receipt("demo-r3", "住宿收據.jpg") },
  ];
  const mine: SentItem[] = [
    { doctype: "Leave Application", name: "HR-LAP-2026-00010", kind: "leave", title: `特休 ${day(9)}`, amount: null, days: 1, status: "等核准", tone: "warn", created: ago(20) },
    { doctype: "Expense Claim", name: "HR-EXP-2026-00102", kind: "expense", title: "郵資", amount: 180, status: "已核准，等撥款", tone: "ok", note: "寄合約給客人", created: ago(72) },
    { doctype: "Expense Claim", name: "HR-EXP-2026-00097", kind: "expense", title: "文具", amount: 450, status: "退回", tone: "danger", note: "請附有統編的發票", created: ago(120) },
  ];
  return {
    items,
    mine,
    rules: [
      { id: "purchase", doctype: "Purchase Order", active: true, other: null, threshold: 50_000, approver: "Purchase Manager" },
      { id: "quote", doctype: "Quotation", active: true, other: null, threshold: 15, approver: "Sales Manager" },
    ],
    hrms: true,
    employee: "HR-EMP-00001",
    can: { approve: true, file: true, configure: true },
    unavailable: [],
    denied: [],
  };
}
