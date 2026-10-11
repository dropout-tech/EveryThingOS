-- One row per customer company: contract, lifecycle and what the shell shows.
-- Secrets stay in the sealed `tenants.config`; nothing here is secret.
CREATE TABLE IF NOT EXISTS accounts (
  site TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'annual',
  state TEXT NOT NULL DEFAULT 'active',
  state_reason TEXT,
  trial_ends TEXT,
  renews_on TEXT,
  contact_email TEXT,
  profile TEXT,
  usage TEXT,
  usage_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_renews ON accounts (renews_on);

CREATE TABLE IF NOT EXISTS hosts (
  host TEXT PRIMARY KEY,
  site TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hosts_site ON hosts (site);

CREATE TABLE IF NOT EXISTS account_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS account_events_site ON account_events (site, id);

CREATE INDEX IF NOT EXISTS seen_created ON seen (created_at);
