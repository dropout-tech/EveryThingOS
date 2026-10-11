export type RuleState = {
  site: string;
  rule: string;
  enabled: boolean;
  params: Record<string, unknown>;
  updated_by: string;
  updated_at: string;
  last_evaluated_at: string | null;
  last_error: string | null;
};

export type RunStatus = "queued" | "done" | "failed";

export type Run = {
  id: number;
  site: string;
  rule: string;
  target: string;
  day: string;
  title: string;
  detail: string;
  status: RunStatus;
  result: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export const RUN_LOG = 100;

export interface AutomationStore {
  listRules(site: string): Promise<RuleState[]>;
  /** Every company's switched-on rules, for the cron. */
  listEnabled(): Promise<RuleState[]>;
  putRule(r: RuleState): Promise<void>;
  markEvaluated(site: string, rule: string, at: string, error: string | null): Promise<void>;
  /** Null when this rule already fired for this target on this day. */
  insertRun(r: Omit<Run, "id" | "status" | "result" | "error" | "finished_at">): Promise<Run | null>;
  getRun(id: number): Promise<Run | null>;
  hasRun(site: string, rule: string, target: string, day: string): Promise<boolean>;
  finishRun(id: number, status: Exclude<RunStatus, "queued">, result: string | null, error: string | null, at: string): Promise<void>;
  /** For when the job could not even be queued: the next cron may try again. */
  deleteRun(id: number): Promise<void>;
  listRuns(site: string, limit?: number): Promise<Run[]>;
}

type RuleRow = Omit<RuleState, "enabled" | "params"> & { enabled: number; params: string };

const ruleFromRow = (r: RuleRow): RuleState => ({ ...r, enabled: r.enabled === 1, params: JSON.parse(r.params) as Record<string, unknown> });

export class D1AutomationStore implements AutomationStore {
  constructor(private db: D1Database) {}

  async listRules(site: string) {
    const { results } = await this.db.prepare("SELECT * FROM automation_rules WHERE site = ? ORDER BY rule").bind(site).all<RuleRow>();
    return results.map(ruleFromRow);
  }

  async listEnabled() {
    const { results } = await this.db.prepare("SELECT * FROM automation_rules WHERE enabled = 1 ORDER BY site, rule").all<RuleRow>();
    return results.map(ruleFromRow);
  }

  async putRule(r: RuleState) {
    await this.db
      .prepare(
        `INSERT INTO automation_rules (site, rule, enabled, params, updated_by, updated_at, last_evaluated_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site, rule) DO UPDATE SET enabled = excluded.enabled, params = excluded.params, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(r.site, r.rule, r.enabled ? 1 : 0, JSON.stringify(r.params), r.updated_by, r.updated_at, r.last_evaluated_at, r.last_error)
      .run();
  }

  async markEvaluated(site: string, rule: string, at: string, error: string | null) {
    await this.db.prepare("UPDATE automation_rules SET last_evaluated_at = ?, last_error = ? WHERE site = ? AND rule = ?").bind(at, error, site, rule).run();
  }

  async insertRun(r: Omit<Run, "id" | "status" | "result" | "error" | "finished_at">) {
    const row = await this.db
      .prepare(
        `INSERT INTO automation_runs (site, rule, target, day, title, detail, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
         ON CONFLICT(site, rule, target, day) DO NOTHING RETURNING *`,
      )
      .bind(r.site, r.rule, r.target, r.day, r.title, r.detail, r.created_at)
      .first<Run>();
    return row ?? null;
  }

  async getRun(id: number) {
    return (await this.db.prepare("SELECT * FROM automation_runs WHERE id = ?").bind(id).first<Run>()) ?? null;
  }

  async hasRun(site: string, rule: string, target: string, day: string) {
    return Boolean(await this.db.prepare("SELECT 1 AS hit FROM automation_runs WHERE site = ? AND rule = ? AND target = ? AND day = ?").bind(site, rule, target, day).first());
  }

  async finishRun(id: number, status: Exclude<RunStatus, "queued">, result: string | null, error: string | null, at: string) {
    await this.db.prepare("UPDATE automation_runs SET status = ?, result = ?, error = ?, finished_at = ? WHERE id = ?").bind(status, result, error?.slice(0, 1000) ?? null, at, id).run();
  }

  async deleteRun(id: number) {
    await this.db.prepare("DELETE FROM automation_runs WHERE id = ?").bind(id).run();
  }

  async listRuns(site: string, limit = RUN_LOG) {
    const { results } = await this.db.prepare("SELECT * FROM automation_runs WHERE site = ? ORDER BY id DESC LIMIT ?").bind(site, limit).all<Run>();
    return results;
  }
}

export class MemoryAutomationStore implements AutomationStore {
  rules = new Map<string, RuleState>();
  runs: Run[] = [];

  async listRules(site: string) {
    return [...this.rules.values()].filter((r) => r.site === site).map((r) => structuredClone(r));
  }
  async listEnabled() {
    return [...this.rules.values()].filter((r) => r.enabled).map((r) => structuredClone(r));
  }
  async putRule(r: RuleState) {
    const current = this.rules.get(`${r.site}|${r.rule}`);
    this.rules.set(`${r.site}|${r.rule}`, structuredClone({ ...r, last_evaluated_at: current?.last_evaluated_at ?? r.last_evaluated_at, last_error: current?.last_error ?? r.last_error }));
  }
  async markEvaluated(site: string, rule: string, at: string, error: string | null) {
    const r = this.rules.get(`${site}|${rule}`);
    if (r) Object.assign(r, { last_evaluated_at: at, last_error: error });
  }
  async insertRun(r: Omit<Run, "id" | "status" | "result" | "error" | "finished_at">) {
    if (await this.hasRun(r.site, r.rule, r.target, r.day)) return null;
    const run: Run = { ...r, id: this.runs.length + 1, status: "queued", result: null, error: null, finished_at: null };
    this.runs.push(run);
    return structuredClone(run);
  }
  async getRun(id: number) {
    const r = this.runs.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }
  async hasRun(site: string, rule: string, target: string, day: string) {
    return this.runs.some((x) => x.site === site && x.rule === rule && x.target === target && x.day === day);
  }
  async finishRun(id: number, status: Exclude<RunStatus, "queued">, result: string | null, error: string | null, at: string) {
    const r = this.runs.find((x) => x.id === id);
    if (r) Object.assign(r, { status, result, error, finished_at: at });
  }
  async deleteRun(id: number) {
    this.runs = this.runs.filter((x) => x.id !== id);
  }
  async listRuns(site: string, limit = RUN_LOG) {
    return this.runs.filter((x) => x.site === site).reverse().slice(0, limit).map((r) => structuredClone(r));
  }
}
