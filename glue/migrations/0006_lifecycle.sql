-- When a company was cancelled (starts the 90-day export window) and when its site and backups were deleted.
ALTER TABLE accounts ADD COLUMN cancelled_at TEXT;
ALTER TABLE accounts ADD COLUMN purged_at TEXT;

-- Existing cancellations: the last 解約 in the history, else the last update (never earlier than the real date).
UPDATE accounts
SET cancelled_at = COALESCE((SELECT MAX(at) FROM account_events e WHERE e.site = accounts.site AND e.action = '解約'), updated_at)
WHERE state = 'cancelled';
