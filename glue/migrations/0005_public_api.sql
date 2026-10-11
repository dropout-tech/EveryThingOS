-- Public REST API keys. Only the SHA-256 of the key is stored; `prefix` is the
-- short visible part people use to tell keys apart.
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS api_keys_site ON api_keys (site, created_at);

-- Outbound webhooks. `secret` is sealed with TENANT_KEY because it is needed to sign.
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  failures INTEGER NOT NULL DEFAULT 0,
  disabled_reason TEXT,
  last_success_at TEXT,
  last_failure_at TEXT
);

CREATE INDEX IF NOT EXISTS webhooks_site ON webhooks (site);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id TEXT NOT NULL,
  site TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_hook ON webhook_deliveries (webhook_id, id);
