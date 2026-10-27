import { purgeStatus, type Account } from "./accounts";
import type { App, Env } from "./app";
import { deliver, monitorStore } from "./monitor";

/** RPO is 24 hours; two hours of slack for a slow nightly job before it counts as missed. */
export const BACKUP_MAX_HOURS = 26;
const HOUR = 3_600_000;

type Copy = { enabled?: boolean; taken_at?: string | null; bytes?: number; error?: string };
/** `usage.backup` as reported by dropout_core.backups. */
export type BackupUsage = { checked_at?: string; local?: Copy | null; offsite?: Copy; encrypted?: boolean; error?: string };

const hours = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / HOUR;
const fmt = (h: number) => (h < 10 ? h.toFixed(1) : String(Math.round(h)));

/** Why this company's off-site copy misses the RPO, or null when it is fine or cannot be judged yet. */
export function backupProblem(b: BackupUsage | null | undefined, createdAt: string, now = new Date()): string | null {
  // No `backup` key: the site runs a dropout_core without backups.py; a brand-new site has not had its first night yet.
  if (!b || hours(createdAt, now) < BACKUP_MAX_HOURS) return null;
  if (b.error) return `讀不到備份狀態：${b.error}`;
  const off = b.offsite;
  if (!off?.enabled) return "沒有設定異地備份（ERPNext 的 S3 Backup Settings 沒開）";
  if (off.error) return `讀不到 R2：${off.error}`;
  const local = b.local?.taken_at ? hours(b.local.taken_at, now) : null;
  if (!off.taken_at) return local === null ? "R2 和本機都沒有備份" : `R2 裡沒有備份；本機最新的是 ${fmt(local)} 小時前（上傳失敗）`;
  const age = hours(off.taken_at, now);
  if (age <= BACKUP_MAX_HOURS) return null;
  if (local !== null && local < age - 1) return `最新備份沒有上傳到 R2：本機 ${fmt(local)} 小時前，R2 ${fmt(age)} 小時前`;
  return `R2 最新備份是 ${fmt(age)} 小時前，超過 ${BACKUP_MAX_HOURS} 小時（每日備份沒有跑）`;
}

type Notice = { site: string; company: string; change: "stale" | "fresh"; detail: string | null };

export function backupAlertText(notices: Notice[]) {
  const stale = notices.filter((n) => n.change === "stale");
  const fresh = notices.filter((n) => n.change === "fresh");
  const subject = `[EveryThingOS 備份] ${[stale.length ? `${stale.length} 家備份過期` : "", fresh.length ? `${fresh.length} 家恢復` : ""].filter(Boolean).join("、")}`;
  const lines = [...stale.map((n) => `備份過期：${n.company}（${n.site}）${n.detail ?? ""}`), ...fresh.map((n) => `備份恢復：${n.company}（${n.site}）`)];
  const shown = lines.slice(0, 30);
  if (lines.length > shown.length) shown.push(`…還有 ${lines.length - shown.length} 家，看營運後台`);
  return { subject, text: [subject, ...shown].join("\n").slice(0, 1900) };
}

/**
 * Daily, after usage is refreshed: one open `backup` incident per company while
 * its newest R2 copy is too old (or missing), closed once a fresh one shows up.
 * Ops hear about each change once.
 */
export async function checkBackups(env: Env, app: App, items: { account: Account; backup: BackupUsage | null | undefined }[], now = new Date()) {
  const ms = monitorStore(env, app);
  const store = app.store(env);
  const at = now.toISOString();
  const notices: Notice[] = [];
  for (const { account: a, backup } of items) {
    const problem = backupProblem(backup, a.created_at, now);
    const open = (await ms.listIncidents(at, a.site)).some((i) => i.target === "backup" && !i.resolved_at);
    if (problem && !open) {
      await ms.openIncident(a.site, "backup", at, problem);
      await store.addAccountEvent(a.site, "監看", "備份過期", problem);
      notices.push({ site: a.site, company: a.company, change: "stale", detail: problem });
    } else if (!problem && open && backup) {
      await ms.resolveIncidents(a.site, "backup", at);
      await store.addAccountEvent(a.site, "監看", "備份恢復", backup.offsite?.taken_at ? `R2 最新備份 ${backup.offsite.taken_at}` : "");
      notices.push({ site: a.site, company: a.company, change: "fresh", detail: null });
    }
  }
  if (notices.length) {
    const { subject, text } = backupAlertText(notices);
    await deliver(env, app.fetcher, subject, text, notices);
  }
  return { stale: notices.filter((n) => n.change === "stale").length, fresh: notices.filter((n) => n.change === "fresh").length };
}

/**
 * Daily: companies cancelled at least EXPORT_DAYS ago whose data is still there.
 * Lists them for ops (history + one alert per company); deleting is always a
 * person running `dropout-onboard fleet purge`.
 */
export async function purgeNotices(env: Env, app: App, accounts: Account[], now = new Date()) {
  const store = app.store(env);
  const due: { site: string; company: string; due_on: string }[] = [];
  for (const a of accounts) {
    const p = purgeStatus(a, now);
    if (!p.due || !p.due_on) continue;
    if (!(await store.claim(`purge-due:${a.site}:${p.due_on}`))) continue;
    await store.addAccountEvent(a.site, "排程", "待刪除", `解約滿 90 天（${p.due_on} 起可刪）。確認沒有要回來後，用 dropout-onboard fleet purge ${a.site}`);
    due.push({ site: a.site, company: a.company, due_on: p.due_on });
  }
  if (due.length) {
    const subject = `[EveryThingOS 營運] ${due.length} 家解約滿 90 天，等刪除`;
    const lines = due.slice(0, 30).map((d) => `${d.company}（${d.site}）${d.due_on} 起可刪`);
    await deliver(env, app.fetcher, subject, [subject, ...lines, "刪除前先確認：dropout-onboard fleet purge <site>（預設只預演）"].join("\n").slice(0, 1900), due);
  }
  return due.length;
}
