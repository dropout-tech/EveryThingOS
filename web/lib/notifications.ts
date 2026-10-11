import { demoFacts, preview, defaultParams } from "./automations";
import type { Books } from "./erp";

/** One line in the 通知 bell. `erpnext` items are Frappe Notification Logs and are marked read in ERPNext; the rest are remembered in this browser. */
export type NotificationItem = {
  id: string;
  source: "erpnext" | "automation" | "sync";
  title: string;
  detail?: string;
  at: string;
  read: boolean;
  href?: string;
  tone?: "warn" | "danger";
};

export type Notifications = { demo: boolean; items: NotificationItem[]; problems: string[] };

export type RawNotificationLog = {
  name: string;
  subject?: string | null;
  type?: string | null;
  document_type?: string | null;
  document_name?: string | null;
  link?: string | null;
  read?: number | boolean | null;
  creation?: string | null;
  from_user?: string | null;
};

const TYPE_LABEL: Record<string, string> = { Assignment: "指派給你", Mention: "提到你", Share: "分享給你", Alert: "提醒", "Energy Point": "點數" };

export function plainText(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const slug = (doctype: string) => doctype.toLowerCase().replace(/\s+/g, "-");

/** Frappe stores times in the site's zone without an offset; DropOut sites run on Asia/Taipei. */
export function taipeiToIso(value: string) {
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T").slice(0, 19)}+08:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** `desk` is the company's ERPNext address; links only ever point there. */
export function fromNotificationLog(r: RawNotificationLog, desk: string | undefined): NotificationItem {
  const path = r.link && r.link.startsWith("/") && !r.link.startsWith("//") ? r.link : r.document_type && r.document_name ? `/app/${slug(r.document_type)}/${encodeURIComponent(r.document_name)}` : null;
  const kind = r.type ? TYPE_LABEL[r.type] : undefined;
  return {
    id: `erp:${r.name}`,
    source: "erpnext",
    title: plainText(r.subject ?? "") || `${r.document_type ?? ""} ${r.document_name ?? ""}`.trim() || "ERPNext 通知",
    detail: [kind, r.document_name].filter(Boolean).join(" · ") || undefined,
    at: r.creation ? taipeiToIso(r.creation) : new Date().toISOString(),
    read: Boolean(r.read),
    href: path && desk ? `${desk}${path}` : undefined,
  };
}

export function sortItems(items: NotificationItem[]) {
  return [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}

/** What the bell shows in demo mode: a couple of ERPNext-style notices and what today's rules would do. */
export function demoNotifications(books: Books, leads: { name: string }[], people: string[], now = new Date()): Notifications {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const facts = demoFacts(books, leads, "");
  const overdue = preview("invoice_overdue", facts, defaultParams("invoice_overdue"))[0];
  const low = preview("low_stock", facts, defaultParams("low_stock"))[0];
  const quote = books.sales.find((d) => d.step === "quote");
  const items: NotificationItem[] = [
    { id: "demo:assign", source: "erpnext", title: `${people[1] ?? "同事"} 指派給你：跟進 ${quote?.party ?? "客人"} 的報價`, detail: `指派給你 · ${quote?.no ?? "SO-10400"}`, at: ago(12), read: false, href: "/workspace/erp/sales" },
    { id: "demo:mention", source: "erpnext", title: `${people[2] ?? "同事"} 在訂單留言提到你：「這張下週可以出嗎？」`, detail: "提到你", at: ago(95), read: false, href: "/workspace/erp/sales" },
  ];
  if (overdue) items.push({ id: "demo:auto-overdue", source: "automation", title: `自動化：${overdue.title}`, detail: overdue.actions.join("、"), at: ago(180), read: false, href: "/workspace/automations" });
  if (low) items.push({ id: "demo:auto-stock", source: "automation", title: `自動化：${low.title}`, detail: low.actions.join("、"), at: ago(185), read: true, href: "/workspace/automations" });
  items.push({ id: "demo:sync", source: "sync", title: "1 件同步沒送到", detail: "官網表單的一筆名單沒進到客人，看原因後重送", at: ago(60 * 26), read: true, href: "/workspace/settings#sync", tone: "warn" });
  return { demo: true, items: sortItems(items), problems: [] };
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}
