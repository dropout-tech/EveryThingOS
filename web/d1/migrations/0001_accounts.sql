CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  google_sub TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  profile TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login TEXT,
  UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unsent', 'sent')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  at TEXT NOT NULL,
  who TEXT NOT NULL,
  what TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security (
  company_id TEXT PRIMARY KEY,
  session_expiry TEXT NOT NULL DEFAULT '08:00'
);
