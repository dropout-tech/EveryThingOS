import type { SalesDoc, SalesStep } from "./erp";

/** 客戶入口: what a customer sees from a shared link, and what the salesperson sees about that link. */

export type PortalDoctype = "Quotation" | "Sales Order" | "Sales Invoice";
export type PortalKind = "quote" | "order" | "invoice";
export type PortalStatus = "open" | "accepted" | "ordered" | "lost" | "expired" | "cancelled" | "paid" | "unpaid" | "overdue" | "closed";

export const PORTAL_DOCTYPES: PortalDoctype[] = ["Quotation", "Sales Order", "Sales Invoice"];

export const KIND_OF: Record<PortalDoctype, PortalKind> = { Quotation: "quote", "Sales Order": "order", "Sales Invoice": "invoice" };
export const KIND_LABEL: Record<PortalKind, string> = { quote: "報價單", order: "訂單", invoice: "發票" };

export type PortalBank = { bank: string; holder: string | null; account: string; branch: string | null };

export type PortalDoc = {
  doctype: PortalDoctype;
  kind: PortalKind;
  name: string;
  status: PortalStatus;
  company: { name: string; taxId?: string | null; phone?: string | null; email?: string | null; website?: string | null; logo?: string | null };
  customer: string;
  date: string;
  validTill: string | null;
  dueDate: string | null;
  deliveryDate: string | null;
  currency: string;
  lines: { item: string; description: string | null; qty: number; uom: string | null; rate: number; amount: number }[];
  net: number;
  tax: number;
  total: number;
  terms: string | null;
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  accepted: { name: string; at: string } | null;
  outstanding: number | null;
  einvoice: string | null;
  bank: PortalBank | null;
  onlinePay: boolean;
};

export type LinkState = "active" | "revoked" | "expired";

export type PortalLink = {
  id: string;
  doctype: PortalDoctype;
  docname: string;
  party: string;
  amount: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  acceptedName: string | null;
  state: LinkState;
  /** Only for links that still open; built by the shell with the current expiry. */
  url?: string;
  demo?: boolean;
};

export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 90;
export const EXPIRY_CHOICES = [3, 7, 14, 30, 60, 90] as const;

export const NAME_MIN = 2;
export const NAME_MAX = 80;
/** A drawn signature as a PNG data URL; about 300 KB of image. */
export const SIGNATURE_MAX_CHARS = 420_000;

export function doctypeForStep(step: SalesStep): PortalDoctype | null {
  if (step === "quote") return "Quotation";
  if (step === "order") return "Sales Order";
  if (step === "invoice" || step === "paid") return "Sales Invoice";
  return null;
}

/** The doctype a sales card can be shared as, or null (出貨單 are not for customers). */
export function shareableDoctype(doc: Pick<SalesDoc, "step" | "doctype">): PortalDoctype | null {
  if (doc.doctype) return PORTAL_DOCTYPES.includes(doc.doctype as PortalDoctype) ? (doc.doctype as PortalDoctype) : null;
  return doctypeForStep(doc.step);
}

export type Chip = { label: string; tone: "ok" | "warn" | "danger" | "neutral" };

/** 已寄出／看過 N 次／已簽／過期／已撤回 */
export function linkChip(link: Pick<PortalLink, "state" | "viewCount" | "acceptedAt" | "doctype">): Chip {
  if (link.acceptedAt) return { label: "已簽", tone: "ok" };
  if (link.state === "revoked") return { label: "已撤回", tone: "neutral" };
  if (link.state === "expired") return { label: "過期", tone: "warn" };
  if (link.viewCount > 0) return { label: `看過 ${link.viewCount} 次`, tone: "ok" };
  return { label: "已寄出", tone: "neutral" };
}

export function lineShareUrl(text: string) {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

export function shareText({ company, doctype, docname, url }: { company?: string | null; doctype: PortalDoctype; docname: string; url: string }) {
  const kind = KIND_LABEL[KIND_OF[doctype]];
  const verb = doctype === "Quotation" ? "請點開看，確認沒問題可以直接線上簽回" : doctype === "Sales Invoice" ? "請點開看明細與付款方式" : "請點開看明細";
  return `您好，這是${company ? ` ${company} 的` : ""}${kind} ${docname}，${verb}：\n${url}`;
}

const taipeiDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" });
const taipeiDateTime = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

/** ERPNext sends site-local (Taipei) dates and datetimes without a zone; the glue sends ISO with Z. */
function parseWhen(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+08:00`);
  if (value.includes("T")) return new Date(value);
  return new Date(`${value.replace(" ", "T")}+08:00`);
}

export function dayText(value: string | null | undefined) {
  if (!value) return "";
  const date = parseWhen(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : taipeiDate.format(date);
}

export function timeText(value: string | null | undefined) {
  if (!value) return "";
  const date = parseWhen(value);
  return Number.isNaN(date.getTime()) ? value : taipeiDateTime.format(date);
}

export function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Demo acceptance and views live in this browser so the salesperson's tab sees the customer's tab. */
export const DEMO_TRACK_PREFIX = "dropout:portal-demo:";
export type DemoTrack = { views: number; firstViewedAt?: string; lastViewedAt?: string; acceptedAt?: string; acceptedName?: string; revokedAt?: string };

export function readDemoTrack(id: string): DemoTrack {
  try {
    const raw = localStorage.getItem(DEMO_TRACK_PREFIX + id);
    return raw ? (JSON.parse(raw) as DemoTrack) : { views: 0 };
  } catch {
    return { views: 0 };
  }
}

export function writeDemoTrack(id: string, update: (current: DemoTrack) => DemoTrack) {
  try {
    localStorage.setItem(DEMO_TRACK_PREFIX + id, JSON.stringify(update(readDemoTrack(id))));
  } catch {
    /* demo only */
  }
}
