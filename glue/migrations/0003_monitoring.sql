-- Uptime checks run by the 5-minute cron: each company's ERPNext site and shell host.
-- `site` and `target` never leave the glue through the public status endpoint.
CREATE TABLE IF NOT EXISTS monitor_checks (
  site TEXT NOT NULL,
  target TEXT NOT NULL,
  up INTEGER NOT NULL DEFAULT 1,
  failures INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT,
  last_status INTEGER,
  last_ms INTEGER,
  last_error TEXT,
  checked_at TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (site, target)
);

CREATE INDEX IF NOT EXISTS monitor_checks_checked ON monitor_checks (checked_at);

CREATE TABLE IF NOT EXISTS monitor_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  target TEXT NOT NULL,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS monitor_incidents_open ON monitor_incidents (site, target, resolved_at);
CREATE INDEX IF NOT EXISTS monitor_incidents_started ON monitor_incidents (started_at);

-- One row per day, site and target: how many probes ran and how many failed (monthly availability).
CREATE TABLE IF NOT EXISTS monitor_daily (
  day TEXT NOT NULL,
  site TEXT NOT NULL,
  target TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, site, target)
);
