import { NextResponse } from "next/server";
import { ADMIN_ROLE } from "@/lib/access";
import { recentRuns } from "@/lib/automations-server";
import { templateFor } from "@/lib/automations";
import { buildBooks } from "@/lib/erp";
import { demoNotifications, fromNotificationLog, sortItems, type NotificationItem, type Notifications, type RawNotificationLog } from "@/lib/notifications";
import { practiceCast } from "@/lib/practice";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { erpMethod, SourceError } from "@/lib/sources/erpnext";
import { liveDeadLetters, liveMe } from "@/lib/sources/live";
import { currentIndustry, demoRecords } from "@/lib/workspace";

const NO_STORE = { "cache-control": "no-store" };

/**
 * The bell: the person's own ERPNext Notification Log, what automations did in
 * the last day (for whoever may manage them) and stuck syncs (for the owner).
 * Each source fails on its own; the bell says which one it could not read.
 */
export async function GET() {
  const config = await liveConfig();
  if (!config.erpnext && !config.glue) {
    const pack = await currentIndustry();
    return NextResponse.json(demoNotifications(buildBooks(pack), demoRecords(pack).leads, practiceCast(pack.id)), { headers: NO_STORE });
  }

  const items: NotificationItem[] = [];
  const problems: string[] = [];
  let roles: string[] | null = null;

  if (config.erpnext) {
    if (loginRequired(config)) {
      try {
        roles = (await liveMe()).roles;
      } catch (error) {
        if (error instanceof SourceError && error.kind === "login") return NextResponse.json({ ok: false, message: error.message }, { status: 401, headers: NO_STORE });
        roles = [];
        problems.push("ERPNext");
      }
    }
    try {
      const body = await erpMethod<{ notification_logs: RawNotificationLog[] }>("frappe.desk.doctype.notification_log.notification_log.get_notification_logs", { limit: 20 }, config);
      items.push(...(body.notification_logs ?? []).map((r) => fromNotificationLog(r, config.erpnext?.url)));
    } catch {
      if (!problems.includes("ERPNext")) problems.push("ERPNext");
    }
  }

  if (config.glue) {
    const [runs, dead] = await Promise.allSettled([
      recentRuns(config.glue, roles),
      !roles || roles.includes(ADMIN_ROLE) ? liveDeadLetters() : Promise.resolve(null),
    ]);
    if (runs.status === "fulfilled" && runs.value) {
      for (const r of runs.value) {
        const failed = r.status === "failed";
        items.push({
          id: `auto:${r.id}`,
          source: "automation",
          title: `${failed ? "自動化沒做成" : "自動化"}：${r.title}`,
          detail: failed ? (r.error ?? templateFor(r.rule).title) : (r.result ?? templateFor(r.rule).title),
          at: r.finishedAt ?? r.createdAt,
          read: false,
          href: "/workspace/automations",
          tone: failed ? "danger" : undefined,
        });
      }
    }
    if (dead.status === "fulfilled" && dead.value?.length) {
      const newest = dead.value[0];
      items.push({
        id: `sync:${newest.id}:${dead.value.length}`,
        source: "sync",
        title: `${dead.value.length} 件同步沒送到`,
        detail: "系統之間有資料卡住了，看原因後重送",
        at: newest.created_at.includes("T") ? newest.created_at : `${newest.created_at.replace(" ", "T")}Z`,
        read: false,
        href: "/workspace/settings#sync",
        tone: "warn",
      });
    }
    if (runs.status === "rejected" || dead.status === "rejected") problems.push("系統同步");
  }

  const out: Notifications = { demo: false, items: sortItems(items), problems };
  return NextResponse.json(out, { headers: NO_STORE });
}
