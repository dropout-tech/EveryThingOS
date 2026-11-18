ALTER TABLE ledger_parties ADD COLUMN phone TEXT;
ALTER TABLE ledger_parties ADD COLUMN email TEXT;
ALTER TABLE ledger_parties ADD COLUMN notes TEXT;
CREATE TABLE workspace_tasks (tenant_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, assignee TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0, party_id TEXT, quote_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id,id));
CREATE TABLE workspace_docs (tenant_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, party_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id,id));
