-- 回滾：DROP TABLE workspace_tasks; DROP TABLE workspace_docs;
-- ALTER TABLE ledger_parties DROP COLUMN phone; ALTER TABLE ledger_parties DROP COLUMN email; ALTER TABLE ledger_parties DROP COLUMN notes;
-- 重跑：CREATE TABLE 使用 IF NOT EXISTS。此 SQLite 不支援 ADD COLUMN IF NOT EXISTS；
-- 重複執行時略過 duplicate column name，既有列與資料保留。
ALTER TABLE ledger_parties ADD COLUMN phone TEXT;
ALTER TABLE ledger_parties ADD COLUMN email TEXT;
ALTER TABLE ledger_parties ADD COLUMN notes TEXT;
CREATE TABLE IF NOT EXISTS workspace_tasks (tenant_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, assignee TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0, party_id TEXT, quote_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id,id));
CREATE TABLE IF NOT EXISTS workspace_docs (tenant_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, party_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id,id));
