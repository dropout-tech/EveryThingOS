import { describe, expect, it, vi } from "vitest";
import { mergeAccount, purgeStatus, type Account } from "../src/accounts";
import { daily, handle, type App, type Env } from "../src/app";
import { backupProblem } from "../src/backups";
import { toBase64 } from "../src/crypto";
import { publicStatus } from "../src/monitor";
import { MemoryMonitorStore } from "../src/monitor-store";
import { MemoryStore, type Tenant } from "../src/store";

const SITE = "make.dropout.tw";
const tenant: Tenant = {
  site: SITE,
  erpnext_url: "https://erp.example",
  erpnext_key: "k",
  erpnext_secret: "s",
  erpnext_webhook_secret: "w",
  unsubscribe_secret: "u",
};
const account = (patch: Partial<Account> = {}): Account => ({
  site: SITE,
  company: "琢奧精密製造",
  plan: "annual",
  state: "active",
  renews_on: "2027-10-10",
  hosts: ["make.os.dropout.tw"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...patch,
});

const NOW = new Date();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const report = (offsiteHours: number | null, localHours: number | null = offsiteHours) => ({
  checked_at: NOW.toISOString(),
  local: localHours === null ? null : { taken_at: hoursAgo(localHours), bytes: 100, files: 4 },
  offsite: { enabled: true, bucket: "dropout-backups", taken_at: offsiteHours === null ? null : hoursAgo(offsiteHours), bytes: 100, files: 4 },
  encrypted: false,
});

function harness(env: Partial<Env> = {}) {
  const store = new MemoryStore();
  const monitor = new MemoryMonitorStore();
  store.tenants.set(SITE, tenant);
  store.accounts.set(SITE, account());
  const calls: { url: string; body?: string }[] = [];
  let backup: unknown = report(2);
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body as string | undefined });
    if (url.includes("dropout_core.team.usage")) return Response.json({ message: { users: 3, backup } });
    return Response.json({ message: {} });
  }) as unknown as typeof fetch;
  const fullEnv = { TENANT_KEY: toBase64(new Uint8Array(32)), ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell", ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/x", ...env } as unknown as Env;
  const app: App = { store: () => store, fetcher, monitor: () => monitor };
  return { store, monitor, calls, env: fullEnv, app, setBackup: (b: unknown) => (backup = b) };
}

const req = (method: string, path: string, body?: unknown, token = "admin") =>
  new Request(`https://glue.example${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-actor": "ops@dropout.tw" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("backup freshness", () => {
  it("judges the newest R2 copy against 26 hours", () => {
    const created = "2026-01-01T00:00:00Z";
    expect(backupProblem(report(2), created, NOW)).toBeNull();
    expect(backupProblem(report(25.9), created, NOW)).toBeNull();
    expect(backupProblem(report(30), created, NOW)).toContain("R2 最新備份是 30 小時前");
    expect(backupProblem(report(50, 2), created, NOW)).toContain("沒有上傳到 R2：本機 2.0 小時前，R2 50 小時前");
    expect(backupProblem(report(null, 3), created, NOW)).toContain("R2 裡沒有備份");
    expect(backupProblem(report(null, null), created, NOW)).toBe("R2 和本機都沒有備份");
    expect(backupProblem({ offsite: { enabled: false } }, created, NOW)).toContain("S3 Backup Settings");
    expect(backupProblem({ offsite: { enabled: true, error: "AccessDenied" } }, created, NOW)).toBe("讀不到 R2：AccessDenied");
    expect(backupProblem({ error: "boom" }, created, NOW)).toBe("讀不到備份狀態：boom");
    // Older dropout_core without backups.py, and a site opened today: nothing to judge yet.
    expect(backupProblem(undefined, created, NOW)).toBeNull();
    expect(backupProblem(report(null, null), hoursAgo(3), NOW)).toBeNull();
  });

  it("opens one incident per stale company, alerts once, closes it when a fresh copy appears, and keeps it off /status", async () => {
    const h = harness();
    h.setBackup(report(40, 2));
    let out = await daily(h.env, h.app, NOW);
    expect(out.backups).toEqual({ stale: 1, fresh: 0 });
    expect(h.monitor.incidents).toMatchObject([{ site: SITE, target: "backup", resolved_at: null }]);
    expect(h.monitor.incidents[0].error).toContain("沒有上傳到 R2");
    const hooks = () => h.calls.filter((c) => c.url.startsWith("https://hooks.slack.com"));
    expect(JSON.parse(hooks()[0].body!).text).toContain("備份過期：琢奧精密製造（make.dropout.tw）");
    expect(h.store.events.map((e) => e.action)).toContain("備份過期");

    const view = await (await handle(req("GET", "/admin/accounts"), h.env, h.app)).json<{ accounts: { backup_problem: string | null }[] }>();
    expect(view.accounts[0].backup_problem).toContain("沒有上傳到 R2");

    const status = await publicStatus(h.monitor, NOW, SITE);
    expect(status.incidents).toEqual([]);
    expect((status.site as { incidents: unknown[] }).incidents).toEqual([]);

    out = await daily(h.env, h.app, new Date(NOW.getTime() + 86_400_000));
    expect(out.backups).toEqual({ stale: 0, fresh: 0 });
    expect(hooks()).toHaveLength(1);

    h.setBackup(report(1));
    out = await daily(h.env, h.app, NOW);
    expect(out.backups).toEqual({ stale: 0, fresh: 1 });
    expect(h.monitor.incidents[0].resolved_at).not.toBeNull();
    expect(JSON.parse(hooks()[1].body!).text).toContain("備份恢復：琢奧精密製造");
  });

  it("does not judge a company whose ERPNext did not answer", async () => {
    const h = harness();
    h.setBackup(undefined);
    expect((await daily(h.env, h.app, NOW)).backups).toEqual({ stale: 0, fresh: 0 });
    expect(h.monitor.incidents).toEqual([]);
  });
});

describe("lifecycle purge", () => {
  it("stamps cancelled_at on cancel, keeps it on later edits and clears it on resume", () => {
    const t0 = new Date("2026-06-01T04:00:00Z");
    const cancelled = mergeAccount(SITE, account(), { state: "cancelled" }, t0);
    expect(cancelled.cancelled_at).toBe(t0.toISOString());
    expect(mergeAccount(SITE, cancelled, { contact_email: "a@b.tw" }, new Date("2026-07-01T00:00:00Z")).cancelled_at).toBe(t0.toISOString());
    expect(mergeAccount(SITE, cancelled, { state: "active" }).cancelled_at).toBeNull();
  });

  it("is due from day 91 (Taiwan dates)", () => {
    const a = { state: "cancelled" as const, cancelled_at: "2026-06-30T17:00:00Z" }; // 07-01 in Taiwan
    expect(purgeStatus(a, new Date("2026-09-28T15:00:00Z"))).toEqual({ due_on: "2026-09-29", due: false, purged_at: null });
    expect(purgeStatus(a, new Date("2026-09-28T16:00:00Z")).due).toBe(true);
    expect(purgeStatus({ state: "active" }).due).toBe(false);
    expect(purgeStatus({ ...a, purged_at: "2026-10-01T00:00:00Z" }, NOW).due).toBe(false);
  });

  it("refuses before 90 days, records every step, and marks the account purged without reviving it", async () => {
    const h = harness();
    expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "started" }), h.env, h.app)).status).toBe(409);
    h.store.accounts.set(SITE, account({ state: "cancelled", cancelled_at: hoursAgo(24 * 30) }));
    const early = await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "started" }), h.env, h.app);
    expect(early.status).toBe(409);
    expect(await early.text()).toContain("還沒滿 90 天");
    expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "rm -rf" }), h.env, h.app)).status).toBe(400);
    expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "started" }, "shell"), h.env, h.app)).status).toBe(403);

    h.store.accounts.set(SITE, account({ state: "cancelled", cancelled_at: "2026-06-01T00:00:00Z" }));
    expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "final_deleted" }), h.env, h.app)).status).toBe(409);
    for (const step of ["started", "final_backup", "dropped", "r2_deleted"]) {
      expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step, detail: `${step} ok` }), h.env, h.app)).status).toBe(200);
    }
    const done = await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "done" }), h.env, h.app);
    const body = await done.json<{ account: Account & { purge: { purged_at: string } } }>();
    expect(body.account.purge.purged_at).toBeTruthy();
    expect(body.account.hosts).toEqual([]);
    expect(await h.store.getTenant(SITE)).toBeNull();
    expect(await h.store.siteForHost("make.os.dropout.tw")).toBeNull();
    expect(h.store.events.filter((e) => e.site === SITE).map((e) => [e.actor, e.action])).toEqual([
      ["ops@dropout.tw", "刪除開始"],
      ["ops@dropout.tw", "最後備份"],
      ["ops@dropout.tw", "刪除站台"],
      ["ops@dropout.tw", "刪除 R2 備份"],
      ["ops@dropout.tw", "已刪除"],
    ]);

    expect((await handle(req("POST", `/admin/accounts/${SITE}/state`, { state: "active" }), h.env, h.app)).status).toBe(409);
    expect((await handle(req("POST", `/admin/accounts/${SITE}/renew`, {}), h.env, h.app)).status).toBe(409);
    expect((await handle(req("POST", `/admin/accounts/${SITE}/purge`, { step: "final_deleted" }), h.env, h.app)).status).toBe(200);
  });

  it("lists companies due for deletion once in the daily job and never deletes anything", async () => {
    const h = harness();
    h.store.accounts.set(SITE, account({ state: "cancelled", cancelled_at: "2026-06-01T00:00:00Z" }));
    expect((await daily(h.env, h.app, NOW)).purge_due).toBe(1);
    expect((await daily(h.env, h.app, NOW)).purge_due).toBe(0);
    expect(h.store.events.map((e) => e.action)).toEqual(["待刪除"]);
    const hook = h.calls.find((c) => c.url.startsWith("https://hooks.slack.com"))!;
    expect(JSON.parse(hook.body!).text).toContain("1 家解約滿 90 天，等刪除");
    expect(await h.store.getTenant(SITE)).not.toBeNull();
    const view = await (await handle(req("GET", "/admin/accounts"), h.env, h.app)).json<{ accounts: { purge: { due: boolean; due_on: string } }[] }>();
    expect(view.accounts[0].purge).toMatchObject({ due: true, due_on: "2026-08-30" });
  });
});
