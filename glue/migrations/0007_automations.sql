-- 自動化: which rule templates each company has switched on, with its own numbers.
CREATE TABLE IF NOT EXISTS automation_rules (
  site TEXT NOT NULL,
  rule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  params TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_evaluated_at TEXT,
  last_error TEXT,
  PRIMARY KEY (site, rule)
);

-- One row per thing a rule did (or tried to do). The unique key is what keeps a
-- reminder from going out twice: the same rule never fires twice for the same
-- document on the same trigger day, however often the cron runs or a job retries.
CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  rule TEXT NOT NULL,
  target TEXT NOT NULL,
  day TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (site, rule, target, day)
);

CREATE INDEX IF NOT EXISTS automation_runs_site ON automation_runs (site, id);
