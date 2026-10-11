export type Target = "erpnext" | "shell";

/** Latest known state of one probe target. `up` only flips after the confirmation rules in monitor.ts. */
export type CheckState = {
  site: string;
  target: Target;
  up: boolean;
  failures: number;
  first_failed_at: string | null;
  last_status: number | null;
  last_ms: number | null;
  last_error: string | null;
  checked_at: string;
  changed_at: string;
};

export type Incident = { id: number; site: string; target: Target; started_at: string; resolved_at: string | null; error: string | null };

export type Availability = { target: Target; checks: number; failures: number };

export interface MonitorStore {
  ping(): Promise<boolean>;
  listChecks(): Promise<CheckState[]>;
  /** Saves the state and counts the probe in that day's availability. */
  recordProbe(c: CheckState, day: string, failed: boolean): Promise<void>;
  openIncident(site: string, target: Target, startedAt: string, error: string | null): Promise<void>;
  resolveIncidents(site: string, target: Target, at: string): Promise<void>;
  /** Stop watching a site: close its incidents and drop its check rows. */
  forget(site: string, at: string): Promise<void>;
  /** Incidents started since the cutoff, plus any still open. */
  listIncidents(since: string, site?: string): Promise<Incident[]>;
  availability(sinceDay: string, site?: string): Promise<Availability[]>;
  prune(beforeDay: string, before: string): Promise<void>;
}

type CheckRow = Omit<CheckState, "up"> & { up: number };

export class D1MonitorStore implements MonitorStore {
  constructor(private db: D1Database) {}

  async ping() {
    return (await this.db.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  }

  async listChecks() {
    const { results } = await this.db.prepare("SELECT * FROM monitor_checks").all<CheckRow>();
    return results.map((r) => ({ ...r, up: r.up === 1 }));
  }

  async recordProbe(c: CheckState, day: string, failed: boolean) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO monitor_checks (site, target, up, failures, first_failed_at, last_status, last_ms, last_error, checked_at, changed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(site, target) DO UPDATE SET up = excluded.up, failures = excluded.failures, first_failed_at = excluded.first_failed_at,
             last_status = excluded.last_status, last_ms = excluded.last_ms, last_error = excluded.last_error, checked_at = excluded.checked_at, changed_at = excluded.changed_at`,
        )
        .bind(c.site, c.target, c.up ? 1 : 0, c.failures, c.first_failed_at, c.last_status, c.last_ms, c.last_error, c.checked_at, c.changed_at),
      this.db
        .prepare(
          `INSERT INTO monitor_daily (day, site, target, checks, failures) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(day, site, target) DO UPDATE SET checks = checks + 1, failures = failures + excluded.failures`,
        )
        .bind(day, c.site, c.target, failed ? 1 : 0),
    ]);
  }

  async openIncident(site: string, target: Target, startedAt: string, error: string | null) {
    await this.db.prepare("INSERT INTO monitor_incidents (site, target, started_at, error) VALUES (?, ?, ?, ?)").bind(site, target, startedAt, error).run();
  }

  async resolveIncidents(site: string, target: Target, at: string) {
    await this.db.prepare("UPDATE monitor_incidents SET resolved_at = ? WHERE site = ? AND target = ? AND resolved_at IS NULL").bind(at, site, target).run();
  }

  async forget(site: string, at: string) {
    await this.db.batch([
      this.db.prepare("UPDATE monitor_incidents SET resolved_at = ? WHERE site = ? AND resolved_at IS NULL").bind(at, site),
      this.db.prepare("DELETE FROM monitor_checks WHERE site = ?").bind(site),
    ]);
  }

  async listIncidents(since: string, site?: string) {
    const where = "(started_at >= ? OR resolved_at IS NULL)" + (site ? " AND site = ?" : "");
    const stmt = this.db.prepare(`SELECT * FROM monitor_incidents WHERE ${where} ORDER BY started_at DESC LIMIT 500`);
    const { results } = await (site ? stmt.bind(since, site) : stmt.bind(since)).all<Incident>();
    return results;
  }

  async availability(sinceDay: string, site?: string) {
    const where = "day >= ?" + (site ? " AND site = ?" : "");
    const stmt = this.db.prepare(`SELECT target, SUM(checks) AS checks, SUM(failures) AS failures FROM monitor_daily WHERE ${where} GROUP BY target`);
    const { results } = await (site ? stmt.bind(sinceDay, site) : stmt.bind(sinceDay)).all<Availability>();
    return results;
  }

  async prune(beforeDay: string, before: string) {
    await this.db.batch([
      this.db.prepare("DELETE FROM monitor_daily WHERE day < ?").bind(beforeDay),
      this.db.prepare("DELETE FROM monitor_incidents WHERE resolved_at IS NOT NULL AND started_at < ?").bind(before),
    ]);
  }
}

export class MemoryMonitorStore implements MonitorStore {
  checks = new Map<string, CheckState>();
  incidents: Incident[] = [];
  daily = new Map<string, { day: string; site: string; target: Target; checks: number; failures: number }>();
  healthy = true;

  async ping() {
    if (!this.healthy) throw new Error("D1 unavailable");
    return true;
  }
  async listChecks() {
    return [...this.checks.values()].map((c) => ({ ...c }));
  }
  async recordProbe(c: CheckState, day: string, failed: boolean) {
    this.checks.set(`${c.site}|${c.target}`, { ...c });
    const key = `${day}|${c.site}|${c.target}`;
    const row = this.daily.get(key) ?? { day, site: c.site, target: c.target, checks: 0, failures: 0 };
    row.checks++;
    if (failed) row.failures++;
    this.daily.set(key, row);
  }
  async openIncident(site: string, target: Target, startedAt: string, error: string | null) {
    this.incidents.push({ id: this.incidents.length + 1, site, target, started_at: startedAt, resolved_at: null, error });
  }
  async resolveIncidents(site: string, target: Target, at: string) {
    for (const i of this.incidents) if (i.site === site && i.target === target && !i.resolved_at) i.resolved_at = at;
  }
  async forget(site: string, at: string) {
    for (const i of this.incidents) if (i.site === site && !i.resolved_at) i.resolved_at = at;
    for (const key of [...this.checks.keys()]) if (key.startsWith(`${site}|`)) this.checks.delete(key);
  }
  async listIncidents(since: string, site?: string) {
    return this.incidents
      .filter((i) => (i.started_at >= since || !i.resolved_at) && (!site || i.site === site))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map((i) => ({ ...i }));
  }
  async availability(sinceDay: string, site?: string) {
    const out = new Map<Target, Availability>();
    for (const r of this.daily.values()) {
      if (r.day < sinceDay || (site && r.site !== site)) continue;
      const a = out.get(r.target) ?? { target: r.target, checks: 0, failures: 0 };
      a.checks += r.checks;
      a.failures += r.failures;
      out.set(r.target, a);
    }
    return [...out.values()];
  }
  async prune(beforeDay: string, before: string) {
    for (const [key, r] of this.daily) if (r.day < beforeDay) this.daily.delete(key);
    this.incidents = this.incidents.filter((i) => !i.resolved_at || i.started_at >= before);
  }
}
