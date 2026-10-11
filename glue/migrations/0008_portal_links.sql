-- 客戶入口: links a salesperson sends to a customer (quote, order or invoice).
-- The token in the URL is signed by the shell; this row is what makes a link
-- revocable, expirable and countable. `accepted_ip_hash` is SHA-256 of the
-- customer's address salted with TENANT_KEY, never the address itself.
CREATE TABLE IF NOT EXISTS portal_links (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  doctype TEXT NOT NULL,
  docname TEXT NOT NULL,
  party TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  first_viewed_at TEXT,
  last_viewed_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT,
  accepted_name TEXT,
  accepted_ip_hash TEXT,
  attempt_window TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS portal_links_site ON portal_links (site, created_at);
CREATE INDEX IF NOT EXISTS portal_links_doc ON portal_links (site, doctype, docname);
