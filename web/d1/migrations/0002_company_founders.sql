CREATE TABLE IF NOT EXISTS company_founders (
  company_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL
);

-- Existing companies have already completed bootstrap.
INSERT OR IGNORE INTO company_founders (company_id, account_id)
SELECT company_id, MIN(id) FROM accounts GROUP BY company_id;
