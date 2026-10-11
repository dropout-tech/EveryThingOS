CREATE TABLE IF NOT EXISTS tenants (
  site TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seen (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dead_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dead_letters_site ON dead_letters (site, id);

CREATE TABLE IF NOT EXISTS meetings (
  site TEXT NOT NULL,
  platform TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  title TEXT,
  attendees TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (site, platform, meeting_id)
);
